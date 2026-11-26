// Copie l'ABI du contrat compilé vers le frontend : npm run export-abi
import { readFileSync, writeFileSync } from "node:fs";

const artifact = JSON.parse(
  readFileSync("artifacts/contracts/CertificateRegistryERC721.sol/CertificateRegistryERC721.json", "utf8"),
);
writeFileSync("../frontend/src/abi.json", JSON.stringify(artifact.abi, null, 2));
console.log("ABI copiée dans frontend/src/abi.json");
