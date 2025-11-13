require('dotenv').config();
const { Client } = require('pg'); const crypto = require('crypto');

const users = [
  { role:'producer',      name:'Fahim',   company:'Fahim & Co', phone:'0185...', apiKey:'prod_KA9V-7P6Z-7B8Q' },
  { role:'manufacturer',  name:'Alam',    company:'Alam Mfg',   phone:'0156...', apiKey:'manu_M1-69PD-Q3F2' },
  { role:'manufacturer',  name:'Rafi',    company:'Rafi Mfg',   phone:'0177...', apiKey:'manu_M2-41XZ-PL90' },
  { role:'distributor',   name:'Ayesha',  company:'Ayesha Dist',phone:'0162...', apiKey:'dist_D1-11AA-22BB' },
  { role:'retailer',      name:'Karim',   company:'Karim Mart', phone:'0199...', apiKey:'retl_R1-99TT-00YY' },
];

(async () => {
  const db = new Client({ connectionString: process.env.DATABASE_URL }); await db.connect();
  for (const u of users) {
    const hash = crypto.createHash('sha256').update(u.apiKey).digest('hex');
    const { rows } = await db.query(
      `INSERT INTO users(role,name,company,phone,api_key_hash)
       VALUES($1,$2,$3,$4,$5) RETURNING id`, [u.role,u.name,u.company,u.phone,hash]
    );
    console.log(`${u.role} ${u.name} id=${rows[0].id} apiKey=${u.apiKey}`);
  }
  await db.end();
})();
