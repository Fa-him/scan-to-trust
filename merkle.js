// Deterministic Merkle root over an array of hex leaves (0x...)
// Pairing rule: if odd, duplicate last; hash = sha256(Buffer.concat([left,right]))
const { sha256 } = require('js-sha256');

function hexToBuf(h) {
  const s = h.startsWith('0x') ? h.slice(2) : h;
  return Buffer.from(s, 'hex');
}
function bufToHex(b) { return '0x' + Buffer.from(b).toString('hex'); }
function hPair(aBuf, bBuf) {
  const c = Buffer.concat([aBuf, bBuf]);
  const d = Buffer.from(sha256.arrayBuffer(c));
  return d;
}
function merkleRoot(hexLeaves) {
  if (!hexLeaves || hexLeaves.length === 0) return '0x' + '00'.repeat(32);
  let level = hexLeaves.map(hexToBuf);
  while (level.length > 1) {
    const next = [];
    for (let i = 0; i < level.length; i += 2) {
      const left = level[i];
      const right = level[i + 1] || level[i]; // duplicate last if odd
      next.push(hPair(left, right));
    }
    level = next;
  }
  return bufToHex(level[0]);
}
module.exports = { merkleRoot };
