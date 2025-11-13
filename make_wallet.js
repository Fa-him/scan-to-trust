// make_wallet.js
const { Wallet } = require('ethers');
const w = Wallet.createRandom();
console.log('ADDRESS =', w.address);
console.log('PRIVATE_KEY =', w.privateKey); // keep secret!
console.log('MNEMONIC =', w.mnemonic?.phrase || '(none)');
