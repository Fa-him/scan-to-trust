// scripts/deploy.js (ESM)
import hre from "hardhat";
import fs from "node:fs";
import path from "node:path";

const rootDir = path.resolve(process.cwd(), ".."); // ../scantotrust

async function main() {
  const Factory = await hre.ethers.getContractFactory("Anchor");
  const contract = await Factory.deploy();

  // ethers v6 style:
  await contract.waitForDeployment();
  const address = await contract.getAddress(); // or: contract.target

  console.log("✅ Anchor deployed at:", address);

  const { abi } = await hre.artifacts.readArtifact("Anchor");
  fs.writeFileSync(path.join(rootDir, "anchor.abi.json"), JSON.stringify({ abi }, null, 2));
  fs.writeFileSync(path.join(rootDir, "anchor.address.txt"), address);
  console.log("📄 Wrote anchor.abi.json and anchor.address.txt to project root");
}

main().catch((e) => { console.error(e); process.exit(1); });
