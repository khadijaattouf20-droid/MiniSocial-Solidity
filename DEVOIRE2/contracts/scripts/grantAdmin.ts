// Donne le rôle ADMIN (révocation) à une autre adresse.
import { network } from "hardhat";
import { zeroHash } from "viem";

const contractAddress = process.env.CONTRACT as `0x${string}`;
const admin = process.env.ADMIN as `0x${string}`;
if (!contractAddress || !admin) {
  throw new Error("Définis les variables CONTRACT et ADMIN avant de lancer le script.");
}

const { viem } = await network.create();
const registry = await viem.getContractAt("CertificateRegistryERC721", contractAddress);
const hash = await registry.write.grantRole([zeroHash, admin]); // zeroHash = DEFAULT_ADMIN_ROLE
console.log(`DEFAULT_ADMIN_ROLE donné à ${admin} (tx : ${hash})`);