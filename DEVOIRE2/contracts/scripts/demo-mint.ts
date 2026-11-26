// Mint de démonstration en ligne de commande (tx d'exemple sur Sepolia).
// PowerShell : $env:CONTRACT="0x..."; npx.cmd hardhat run scripts/demo-mint.ts --network sepolia
import { network } from "hardhat";
import { parseEventLogs } from "viem";

const contractAddress = process.env.CONTRACT as `0x${string}`;
if (!contractAddress) throw new Error("Définis la variable CONTRACT avant de lancer le script.");

const { viem } = await network.create();
const [admin] = await viem.getWalletClients();
const publicClient = await viem.getPublicClient();
const registry = await viem.getContractAt("CertificateRegistryERC721", contractAddress);

const studentId = `DEMO-${Date.now()}`;
const metadata = { name: "Certificat de démonstration", attributes: [{ trait_type: "studentId", value: studentId }] };
const uri = "data:application/json;charset=utf-8," + encodeURIComponent(JSON.stringify(metadata));

const hash = await registry.write.mintCertificate([
  admin.account.address,
  uri,
  "Étudiant Démo",
  studentId,
  "Licence Informatique",
  new Date().toISOString().slice(0, 10),
  "Mention Bien",
]);
const receipt = await publicClient.waitForTransactionReceipt({ hash });
const [event] = parseEventLogs({ abi: registry.abi, logs: receipt.logs, eventName: "CertificateMinted" });
console.log(`tokenId = ${event.args.tokenId}`);
console.log(`tx = ${hash}`);
