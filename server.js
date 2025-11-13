// server.js
require('dotenv').config();
const fs = require('fs'), path = require('path'), express = require('express');
const { Client } = require('pg'); const QRCode = require('qrcode'); const crypto = require('crypto');
const { ethers } = require('ethers');

const PORT = process.env.PORT || 5000;

// ---------- DB ----------
const useSSL = !/localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL || '');
const db = new Client({ connectionString: process.env.DATABASE_URL, ssl: useSSL ? { require: true, rejectUnauthorized: false } : undefined });
db.connect().then(()=>console.log('✅ DB connected')).catch(e=>{console.error('❌ DB connect failed:',e.message);process.exit(1);});

// Ensure schema (idempotent)
async function ensureSchema() {
  // optional boot from schema.sql if present
  const schemaPath = path.join(__dirname,'schema.sql');
  if (fs.existsSync(schemaPath)) await db.query(fs.readFileSync(schemaPath,'utf8'));

  await db.query(`
    CREATE TABLE IF NOT EXISTS batches(
      id                   text PRIMARY KEY,
      product_name         text NOT NULL,
      product_price        numeric(12,2) DEFAULT 0,
      created_at           timestamptz DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS events(
      id             bigserial PRIMARY KEY,
      batch_id       text REFERENCES batches(id) ON DELETE CASCADE,
      role           text NOT NULL,                 -- producer/manufacturer/distributor/retailer
      location       text,
      doc_hash       text,
      event_hash     text NOT NULL,
      occurred_at    timestamptz NOT NULL,
      recorded_at    timestamptz DEFAULT now(),
      actor_id       text,
      actor_name     text,
      actor_company  text,
      actor_phone    text,
      actor_price    numeric(12,2)
    );
    CREATE TABLE IF NOT EXISTS transfer_tokens(
      id               bigserial PRIMARY KEY,
      batch_id         text REFERENCES batches(id) ON DELETE CASCADE,
      code             text NOT NULL,
      next_role        text NOT NULL,
      next_owner_id    text NOT NULL,
      next_owner_name  text,
      not_before       timestamptz,
      expires_at       timestamptz,
      used             boolean DEFAULT false,
      revoked          boolean DEFAULT false,
      created_at       timestamptz DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS day_roots(
      day     date PRIMARY KEY,
      root    text NOT NULL,
      tx_hash text
    );
  `);

  // owner snapshot columns on batches
  await db.query(`ALTER TABLE batches ADD COLUMN IF NOT EXISTS current_owner_id text;`);
  await db.query(`ALTER TABLE batches ADD COLUMN IF NOT EXISTS current_owner_code text;`);
  await db.query(`ALTER TABLE batches ADD COLUMN IF NOT EXISTS current_owner_role text NOT NULL DEFAULT 'producer';`);
  await db.query(`ALTER TABLE batches ADD COLUMN IF NOT EXISTS current_owner_name text;`);
  await db.query(`ALTER TABLE batches ADD COLUMN IF NOT EXISTS current_owner_company text;`);
  await db.query(`ALTER TABLE batches ADD COLUMN IF NOT EXISTS current_owner_phone text;`);

  await db.query(`CREATE INDEX IF NOT EXISTS ix_events_batch ON events(batch_id);`);
  await db.query(`CREATE INDEX IF NOT EXISTS ix_events_day ON events((date(recorded_at)));`);

  console.log('✅ Schema ensured');
}

// ---------- helpers ----------
const todayStr = (d=new Date()) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const sha256hex = v => '0x'+crypto.createHash('sha256').update(Buffer.isBuffer(v)?v:Buffer.from(String(v))).digest('hex');
const randCode = () => Math.random().toString(36).slice(2,8).toUpperCase();

function canonEvent(e){
  return JSON.stringify({
    batch_id:e.batch_id, role:e.role, location:e.location||'', doc_hash:e.doc_hash||'',
    actor_id:e.actor_id||'', actor_name:e.actor_name||'', actor_company:e.actor_company||'',
    actor_phone:e.actor_phone||'', actor_price:isFinite(e.actor_price)?Number(e.actor_price):0,
    occurred_at:new Date(e.occurred_at).toISOString()
  });
}
const evHash = e => sha256hex(Buffer.from(canonEvent(e)));

function hexToBuf(h){return Buffer.from((h||'').replace(/^0x/,''),'hex');}
function bufToHex(b){return '0x'+Buffer.from(b).toString('hex');}
function hPair(a,b){return crypto.createHash('sha256').update(Buffer.concat([a,b])).digest();}
function merkleRoot(hexLeaves){
  if(!hexLeaves || !hexLeaves.length) return '0x'+'00'.repeat(32);
  let level = hexLeaves.map(hexToBuf);
  while(level.length>1){const next=[];for(let i=0;i<level.length;i+=2) next.push(hPair(level[i], level[i+1]||level[i])); level=next;}
  return bufToHex(level[0]);
}

// ethers contract loader (anchor.abi.json MUST be beside server.js)
function getContract(){
  const addr = process.env.CONTRACT_ADDRESS;
  if(!addr) throw new Error('CONTRACT_ADDRESS missing');
  const abiFile = path.join(__dirname,'anchor.abi.json');
  if(!fs.existsSync(abiFile)) throw new Error('anchor.abi.json not found next to server.js');
  const { abi } = JSON.parse(fs.readFileSync(abiFile,'utf8'));
  const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
  return new ethers.Contract(addr, abi, wallet);
}

// ---------- app ----------
const app = express();
app.use(express.json({limit:'1mb'}));
app.get('/health',(_,res)=>res.json({ok:true}));

// serve UI for / and /view/:id
function serveIndex(_,res){
  const file=path.join(__dirname,'index.html');
  if(fs.existsSync(file)) return res.end(fs.readFileSync(file));
  res.type('text/plain').end('UI missing. Put index.html next to server.js');
}
app.get('/', serveIndex);
app.get('/view/:id', serveIndex);

// QR -> /view/:batchId
app.get('/qr/:batchId', async (req,res)=>{
  try{
    const url=`${req.protocol}://${req.get('host')}/view/${encodeURIComponent(req.params.batchId)}`;
    res.setHeader('Content-Type','image/png');
    res.end(await QRCode.toBuffer(url,{width:256}));
  }catch(e){res.status(500).json({error:e.message});}
});

// ---------- API ----------

// Create batch (initial owner is the producer)
app.post('/batch/create', async (req,res)=>{
  try{
    const { id, product_name, product_price, location,
            producer_name, producer_company, producer_phone,
            owner_id, owner_code, doc_text } = req.body;

    if(!id) return res.status(400).json({error:'id required'});
    if(!owner_id || !owner_code) return res.status(400).json({error:'owner_id and owner_code required'});

    const exists = await db.query('SELECT 1 FROM batches WHERE id=$1',[id]);
    if(exists.rowCount) return res.status(409).json({error:'batch id already exists'});

    const price = isFinite(product_price)?Number(product_price):0;

    await db.query(`
      INSERT INTO batches(
        id, product_name, product_price,
        current_owner_id, current_owner_code, current_owner_role,
        current_owner_name, current_owner_company, current_owner_phone
      ) VALUES ($1,$2,$3,$4,$5,'producer',$6,$7,$8)
    `,[id, product_name||'Unknown', price, owner_id, owner_code, producer_name||'', producer_company||'', producer_phone||'']);

    const occurred_at = new Date().toISOString();
    const doc_hash = doc_text ? sha256hex(String(doc_text)) : '';
    const ev = { batch_id:id, role:'producer', location:location||'', doc_hash, occurred_at,
                 actor_id:owner_id, actor_name:producer_name||'', actor_company:producer_company||'', actor_phone:producer_phone||'',
                 actor_price:price };
    const event_hash = evHash(ev);

    await db.query(`
      INSERT INTO events(batch_id,role,location,doc_hash,event_hash,occurred_at,actor_id,actor_name,actor_company,actor_phone,actor_price)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
    `,[id,'producer',ev.location,doc_hash,event_hash,occurred_at,ev.actor_id,ev.actor_name,ev.actor_company,ev.actor_phone,ev.actor_price]);

    res.json({ok:true,id,qrcode_url:`/qr/${encodeURIComponent(id)}`,first_event_hash:event_hash});
  }catch(e){res.status(500).json({error:e.message});}
});

// Authorize next handoff (owner must pass x-owner-id + x-owner-code)
app.post('/handoff/authorize', async (req,res)=>{
  try{
    const ownerId  = req.header('x-owner-id')?.trim();
    const ownerCode= req.header('x-owner-code')?.trim();
    const { batch_id, next_role, next_owner_id, next_owner_name, valid_days, not_before } = req.body;

    if(!batch_id || !next_role || !next_owner_id) return res.status(400).json({error:'batch_id, next_role, next_owner_id required'});
    if(!ownerId || !ownerCode) return res.status(400).json({error:'owner headers missing: x-owner-id, x-owner-code'});

    const { rows:b } = await db.query(`SELECT current_owner_id, current_owner_code FROM batches WHERE id=$1`,[batch_id]);
    if(!b.length) return res.status(404).json({error:'batch not found'});
    if(b[0].current_owner_id!==ownerId || b[0].current_owner_code!==ownerCode) return res.status(403).json({error:'owner credentials invalid'});

    // Only one active token at a time
    await db.query(`UPDATE transfer_tokens SET revoked=TRUE WHERE batch_id=$1 AND used=FALSE AND revoked=FALSE`,[batch_id]);

    const code = randCode();
    const days = Math.max(1, Number(valid_days||14));
    await db.query(`
      INSERT INTO transfer_tokens(batch_id,code,next_role,next_owner_id,next_owner_name,not_before,expires_at)
      VALUES ($1,$2,$3,$4,$5,$6, NOW() + ($7||' days')::interval)
    `,[batch_id,code,next_role,next_owner_id,next_owner_name||null,not_before||null,String(days)]);

    res.json({ok:true,batch_id,next_role,next_owner_id,next_owner_name:next_owner_name||null,code,expires_in_days:days,not_before:not_before||null});
  }catch(e){res.status(500).json({error:e.message});}
});

// Guarded handoff (receiver executes; must present correct code)
app.post('/handoff', async (req,res)=>{
  try{
    const { batch_id, role, code, actor_id, actor_name, actor_company, actor_phone, location, price, doc_text } = req.body;
    if(!batch_id || !role || !code || !actor_id) return res.status(400).json({error:'batch_id, role, code, actor_id required'});

    const { rows:tok } = await db.query(`SELECT * FROM transfer_tokens WHERE batch_id=$1 AND code=$2`,[batch_id,code]);
    if(!tok.length) return res.status(403).json({error:'invalid code'});
    const t = tok[0];
    if(t.revoked) return res.status(403).json({error:'code revoked'});
    if(t.used)    return res.status(403).json({error:'code used'});
    if(t.next_role!==role) return res.status(403).json({error:'role mismatch'});
    const now=new Date();
    if(t.not_before && new Date(t.not_before)>now) return res.status(403).json({error:'code not active yet'});
    if(t.expires_at && new Date(t.expires_at)<now) return res.status(403).json({error:'code expired'});
    if(t.next_owner_id && t.next_owner_id!==actor_id) return res.status(403).json({error:'owner_id mismatch'});
    if(t.next_owner_name && actor_name && t.next_owner_name.trim().toLowerCase()!==actor_name.trim().toLowerCase())
      return res.status(403).json({error:'owner_name mismatch'});

    const occurred_at=new Date().toISOString();
    const doc_hash = doc_text ? sha256hex(String(doc_text)) : '';
    const salePrice = isFinite(price)?Number(price):null;

    const ev={batch_id,role,location:location||'',doc_hash,occurred_at,
              actor_id,actor_name:actor_name||'',actor_company:actor_company||'',actor_phone:actor_phone||'',
              actor_price:salePrice};
    const event_hash = evHash(ev);

    await db.query(`
      INSERT INTO events(batch_id,role,location,doc_hash,event_hash,occurred_at,actor_id,actor_name,actor_company,actor_phone,actor_price)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
    `,[batch_id,role,ev.location,doc_hash,event_hash,occurred_at,actor_id,ev.actor_name,ev.actor_company,ev.actor_phone,salePrice]);

    await db.query(`
      UPDATE batches SET
        current_owner_id=$1,
        current_owner_code=NULL,         -- receiver will set their own code when they authorize next
        current_owner_role=$2,
        current_owner_name=$3,
        current_owner_company=$4,
        current_owner_phone=$5,
        product_price=COALESCE($6,product_price)
      WHERE id=$7
    `,[actor_id,role,ev.actor_name,ev.actor_company,ev.actor_phone,salePrice,batch_id]);

    await db.query(`UPDATE transfer_tokens SET used=TRUE WHERE id=$1`,[t.id]);

    res.json({ok:true,event_hash});
  }catch(e){res.status(500).json({error:e.message});}
});

// Public timeline JSON (viewer + admin)
app.get('/timeline/:batchId', async (req,res)=>{
  try{
    const id=req.params.batchId;
    const { rows:b } = await db.query('SELECT * FROM batches WHERE id=$1',[id]);
    if(!b.length) return res.status(404).json({error:'batch not found'});

    const { rows:ev } = await db.query(`
      SELECT role,location,doc_hash,event_hash,occurred_at,recorded_at,
             actor_id,actor_name,actor_company,actor_phone,actor_price
      FROM events WHERE batch_id=$1 ORDER BY recorded_at ASC
    `,[id]);

    const lastDay = ev.length?new Date(ev[ev.length-1].recorded_at):new Date();
    const day = todayStr(lastDay);
    const { rows:dr } = await db.query('SELECT root,tx_hash FROM day_roots WHERE day=$1',[day]);
    const anchored = dr.length>0;

    res.json({ batch:b[0], events:ev, anchored_day:day, anchored, root:anchored?dr[0].root:null, tx_hash:anchored?dr[0].tx_hash:null });
  }catch(e){res.status(500).json({error:e.message});}
});

// Daily Merkle + optional on-chain anchoring
app.post('/anchor/daily', async (req,res)=>{
  try{
    const day = req.body.day || todayStr();
    const { rows } = await db.query(
      `SELECT event_hash FROM events WHERE date(recorded_at)=to_date($1,'YYYY-MM-DD') ORDER BY id ASC`,[day]
    );
    const leaves = rows.map(r=>r.event_hash);
    const root = merkleRoot(leaves);

    let txHash = null;
    if(process.env.CONTRACT_ADDRESS){
      const c = getContract();
      const tx = await c.anchorRoot(root, day);       // ethers v6
      const rc = await tx.wait();
      txHash = rc.hash;
    }

    await db.query(`
      INSERT INTO day_roots(day,root,tx_hash)
      VALUES ($1,$2,$3)
      ON CONFLICT (day) DO UPDATE SET root=EXCLUDED.root, tx_hash=EXCLUDED.tx_hash
    `,[day,root,txHash]);

    res.json({ok:true,day,leaves:leaves.length,root,tx_hash:txHash});
  }catch(e){res.status(500).json({error:e.message});}
});

// ---------- boot ----------
(async()=>{ try{ await ensureSchema(); app.listen(PORT,()=>console.log(`✅ Server on http://localhost:${PORT}`)); }
catch(e){ console.error('❌ Startup error:',e.message); process.exit(1); }})();
