import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { network } from "hardhat";
import { keccak256, toBytes, zeroAddress, zeroHash } from "viem";

const { viem } = await network.create();

const MINTER_ROLE = keccak256(toBytes("MINTER_ROLE"));
const URI = 'data:application/json,{"name":"Certificat"}';

// Mêmes données de test qu'au devoir 1, avec le tokenURI en plus.
function certificat(to: `0x${string}`, studentId: string, studentName = "Amina Benali") {
  return [to, URI, studentName, studentId, "Licence Informatique", "2026-06-15", "Mention Bien"] as const;
}

async function deploy() {
  const [owner, other, minter] = await viem.getWalletClients();
  const registry = await viem.deployContract("CertificateRegistryERC721", [owner.account.address]);
  return { registry, owner, other, minter };
}

describe("CertificateRegistryERC721 - Tests de securite", () => {
  it("1. Creer un certificat ERC721 (NFT, donnees, tokenURI, event)", async () => {
    const { registry, owner } = await deploy();

    await viem.assertions.emitWithArgs(
      registry.write.mintCertificate(certificat(owner.account.address, "2023-INF-042")),
      registry,
      "CertificateMinted",
      [1n, "2023-INF-042", owner.account.address],
    );

    const cert = await registry.read.getCertificate([1n]);
    assert.equal(cert.studentName, "Amina Benali");
    assert.equal(cert.studentId, "2023-INF-042");
    assert.equal(cert.revoked, false);
    assert.equal((await registry.read.ownerOf([1n])).toLowerCase(), owner.account.address.toLowerCase());
    assert.equal(await registry.read.tokenURI([1n]), URI);
    assert.equal(await registry.read.getTotalCertificates(), 1n);
  });

  it("2. Refuser un utilisateur non autorise (pas de MINTER_ROLE)", async () => {
    const { registry, other } = await deploy();

    await viem.assertions.revertWithCustomErrorWithArgs(
      registry.write.mintCertificate(certificat(other.account.address, "TEST-001"), {
        account: other.account,
      }),
      registry,
      "AccessControlUnauthorizedAccount",
      [other.account.address, MINTER_ROLE],
    );
  });

  it("3. Un minter ajoute par l'admin peut emettre", async () => {
    const { registry, minter } = await deploy();

    await registry.write.grantRole([MINTER_ROLE, minter.account.address]);
    await registry.write.mintCertificate(certificat(minter.account.address, "M-001"), {
      account: minter.account,
    });

    assert.equal(await registry.read.getTotalCertificates(), 1n);
  });

  it("4. Empecher les doublons (meme studentId)", async () => {
    const { registry, owner } = await deploy();

    await registry.write.mintCertificate(certificat(owner.account.address, "2023-INF-042"));
    await viem.assertions.revertWithCustomError(
      registry.write.mintCertificate(certificat(owner.account.address, "2023-INF-042", "Autre Nom")),
      registry,
      "StudentAlreadyRegistered",
    );
  });

  it("5. Refuser une adresse invalide et des champs vides", async () => {
    const { registry, owner } = await deploy();

    await viem.assertions.revertWithCustomError(
      registry.write.mintCertificate(certificat(zeroAddress, "Z-001")),
      registry,
      "ZeroAddress",
    );
    await viem.assertions.revertWithCustomError(
      registry.write.mintCertificate(certificat(owner.account.address, "E-001", "")),
      registry,
      "EmptyField",
    );
  });

  it("6. Creer plusieurs certificats (batch)", async () => {
    const { registry, owner, other } = await deploy();

    await registry.write.batchMintCertificates([
      [owner.account.address, other.account.address],
      [URI, URI],
      ["Amina Benali", "Sara Idrissi"],
      ["2023-INF-042", "2023-INF-044"],
      ["Licence Informatique", "Licence Data"],
      ["2026-06-15", "2026-06-15"],
      ["Bien", "Tres Bien"],
    ]);

    assert.equal((await registry.read.getCertificate([1n])).studentName, "Amina Benali");
    assert.equal((await registry.read.getCertificate([2n])).studentName, "Sara Idrissi");
    assert.equal((await registry.read.ownerOf([2n])).toLowerCase(), other.account.address.toLowerCase());
  });

  it("7. Batch : doublon dans le lot = tout le lot annule", async () => {
    const { registry, owner } = await deploy();

    await viem.assertions.revertWithCustomError(
      registry.write.batchMintCertificates([
        [owner.account.address, owner.account.address],
        [URI, URI],
        ["A", "B"],
        ["DUP-1", "DUP-1"],
        ["Licence", "Licence"],
        ["2026-06-15", "2026-06-15"],
        ["Bien", "Bien"],
      ]),
      registry,
      "StudentAlreadyRegistered",
    );
    assert.equal(await registry.read.getTotalCertificates(), 0n);
  });

  it("8. Batch : lot vide, trop grand ou tableaux de tailles differentes", async () => {
    const { registry, owner } = await deploy();
    const a = owner.account.address;

    await viem.assertions.revertWithCustomError(
      registry.write.batchMintCertificates([[], [], [], [], [], [], []]),
      registry,
      "InvalidBatchSize",
    );

    const n = 21;
    const fill = (v: string) => Array.from({ length: n }, () => v);
    await viem.assertions.revertWithCustomError(
      registry.write.batchMintCertificates([
        Array.from({ length: n }, () => a),
        fill(URI),
        fill("Nom"),
        Array.from({ length: n }, (_, i) => `BIG-${i}`),
        fill("Licence"),
        fill("2026-06-15"),
        fill("Bien"),
      ]),
      registry,
      "InvalidBatchSize",
    );

    await viem.assertions.revertWithCustomError(
      registry.write.batchMintCertificates([[a], [URI], ["Nom"], ["L-1", "L-2"], ["Licence"], ["2026"], ["Bien"]]),
      registry,
      "LengthMismatch",
    );
  });

  it("9. Revoquer un certificat (flag + event, pas deux fois)", async () => {
    const { registry, owner } = await deploy();

    await registry.write.mintCertificate(certificat(owner.account.address, "2023-INF-043"));
    await viem.assertions.emitWithArgs(registry.write.revokeCertificate([1n]), registry, "CertificateRevoked", [1n]);
    assert.equal((await registry.read.getCertificate([1n])).revoked, true);

    await viem.assertions.revertWithCustomError(
      registry.write.revokeCertificate([1n]),
      registry,
      "AlreadyRevoked",
    );
  });

  it("10. Refuser une revocation non autorisee", async () => {
    const { registry, owner, other } = await deploy();

    await registry.write.mintCertificate(certificat(owner.account.address, "2023-INF-045"));
    await viem.assertions.revertWithCustomErrorWithArgs(
      registry.write.revokeCertificate([1n], { account: other.account }),
      registry,
      "AccessControlUnauthorizedAccount",
      [other.account.address, zeroHash],
    );
  });

  it("11. Certificat non transferable (soulbound)", async () => {
    const { registry, owner, other } = await deploy();

    await registry.write.mintCertificate(certificat(owner.account.address, "T-001"));
    await viem.assertions.revertWithCustomError(
      registry.write.transferFrom([owner.account.address, other.account.address, 1n]),
      registry,
      "NonTransferable",
    );
  });

  it("12. Lecture d'un certificat inexistant refusee", async () => {
    const { registry } = await deploy();

    await viem.assertions.revertWithCustomError(
      registry.read.getCertificate([99n]),
      registry,
      "ERC721NonexistentToken",
    );
  });

  it("13. Constructeur : admin = adresse nulle refuse", async () => {
    await assert.rejects(viem.deployContract("CertificateRegistryERC721", [zeroAddress]));
  });

  it("14. isStudentRegistered avant / apres emission", async () => {
    const { registry, owner } = await deploy();

    assert.equal(await registry.read.isStudentRegistered(["U-001"]), false);
    await registry.write.mintCertificate(certificat(owner.account.address, "U-001"));
    assert.equal(await registry.read.isStudentRegistered(["U-001"]), true);
  });

  it("15. Interfaces ERC-721 et AccessControl (ERC-165)", async () => {
    const { registry } = await deploy();

    assert.equal(await registry.read.supportsInterface(["0x80ac58cd"]), true);
    assert.equal(await registry.read.supportsInterface(["0x7965db0b"]), true);
  });
});
