// Donne le rôle MINTER à une autre adresse (par exemple ton compte MetaMask 0xA4266…).
// Remplace le TEST_ADMIN codé en dur du devoir 1.
// PowerShell :
//   $env:CONTRACT="0x..."; $env:MINTER="0x..."; npx.cmd hardhat run scripts/grantMinter.ts --network localhost
import { network } from "hardhat";

const contractAddress = process.env.CONTRACT as `0x${string}`;
const minter = process.env.MINTER as `0x${string}`;
if (!contractAddress || !minter) {
  throw new Error("Définis les variables CONTRACT et MINTER avant de lancer le script.");
}

const { viem } = await network.create();
const registry = await viem.getContractAt("CertificateRegistryERC721", contractAddress);
const role = await registry.read.MINTER_ROLE();
const hash = await registry.write.grantRole([role, minter]);
console.log(`MINTER_ROLE donné à ${minter} (tx : ${hash})`);
