/**
 * Deploys SecureVote to the LOCAL Hardhat node and writes deployments/localhost.json.
 *
 * Safety: refuses to run on any chain other than 31337 (Hardhat local).
 * Roles: Hardhat account #0 becomes the on-chain admin; account #1 (the demo
 * organizer "Daniyar Organizer") receives ORGANIZER_ROLE. These are Hardhat's public
 * test accounts — never send real funds to them.
 */
import fs from "node:fs";
import path from "node:path";
import { ethers, network } from "hardhat";

const LOCAL_CHAIN_ID = 31337n;

async function main() {
  const { chainId } = await ethers.provider.getNetwork();
  if (chainId !== LOCAL_CHAIN_ID) {
    throw new Error(`Refusing to deploy: chainId ${chainId} is not the local Hardhat chain (31337).`);
  }

  const [admin, organizer] = await ethers.getSigners();
  const factory = await ethers.getContractFactory("SecureVote", admin);
  const contract = await factory.deploy(admin.address);
  const deployTx = contract.deploymentTransaction();
  await contract.waitForDeployment();
  const receipt = await deployTx!.wait();
  const address = await contract.getAddress();

  const ORGANIZER_ROLE = await contract.ORGANIZER_ROLE();
  await (await contract.grantRole(ORGANIZER_ROLE, organizer.address)).wait();

  const deployment = {
    network: network.name,
    chainId: Number(chainId),
    address,
    deployBlock: receipt!.blockNumber,
    deployTxHash: receipt!.hash,
    admin: admin.address,
    initialOrganizers: [organizer.address],
    deployedAt: new Date().toISOString(),
  };
  const outDir = path.join(__dirname, "..", "deployments");
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "localhost.json"), JSON.stringify(deployment, null, 2) + "\n");

  console.log(`SecureVote deployed to ${address} (chain ${chainId}, block ${receipt!.blockNumber})`);
  console.log(`Admin: ${admin.address}`);
  console.log(`ORGANIZER_ROLE granted to: ${organizer.address}`);
  console.log(`Wrote packages/contracts/deployments/localhost.json`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
