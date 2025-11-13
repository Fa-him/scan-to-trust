// save as check.js
require('dotenv').config();
const { ethers } = require('ethers');

(async () => {
  const rpc = process.env.RPC_URL;
  const pk  = process.env.PRIVATE_KEY; // testnet key only
  if (!rpc || !pk) throw new Error('Set RPC_URL and PRIVATE_KEY in .env');
  const provider = new ethers.JsonRpcProvider(rpc);
  const wallet = new ethers.Wallet(pk, provider);
  const net = await provider.getNetwork();
  const bal = await provider.getBalance(wallet.address);
  console.log('Network:', net.name, net.chainId);
  console.log('Address:', wallet.address);
  console.log('Balance (ETH):', ethers.formatEther(bal));
})();
