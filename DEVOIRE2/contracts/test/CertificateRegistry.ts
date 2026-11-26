
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { network } from "hardhat";

const { viem } = await network.create();

describe("CertificateRegistry", () => {

  it("1. Creer un certificat", async () => {
    const registry = await viem.deployContract("CertificateRegistry");
    const [owner] = await viem.getWalletClients();

    await registry.write.mintCertificate([
      owner.account.address,
      "Amina Benali",
      "2023-INF-042",
      "Licence Informatique",
      "2026-06-15",
      "Mention Bien"
    ]);

    const cert = await registry.read.getCertificate([1n]);

    assert.equal(cert.studentName, "Amina Benali");
    assert.equal(cert.studentId, "2023-INF-042");
    assert.equal(cert.revoked, false);
  });

  it("2. Empecher les doublons", async () => {
    const registry = await viem.deployContract("CertificateRegistry");
    const [owner] = await viem.getWalletClients();

    const data = [
      owner.account.address,
      "Amina Benali",
      "2023-INF-042",
      "Licence Informatique",
      "2026-06-15",
      "Mention Bien"
    ] as const;

    await registry.write.mintCertificate(data);

    await assert.rejects(
      registry.write.mintCertificate(data)
    );
  });

  it("3. Revoquer un certificat", async () => {
    const registry = await viem.deployContract("CertificateRegistry");
    const [owner] = await viem.getWalletClients();

    await registry.write.mintCertificate([
      owner.account.address,
      "Youssef Alami",
      "2023-INF-043",
      "Master IA",
      "2026-06-15",
      "Tres Bien"
    ]);

    await registry.write.revoke([1n]);

    const cert = await registry.read.getCertificate([1n]);

    assert.equal(cert.revoked, true);
  });

  it("4. Creer plusieurs certificats", async () => {
    const registry = await viem.deployContract("CertificateRegistry");
    const [owner] = await viem.getWalletClients();

    await registry.write.batchMint([
      [owner.account.address, owner.account.address],
      ["Amina Benali", "Sara Idrissi"],
      ["2023-INF-042", "2023-INF-044"],
      ["Licence Informatique", "Licence Data"],
      ["2026-06-15", "2026-06-15"],
      ["Bien", "Tres Bien"]
    ]);

    const cert1 = await registry.read.getCertificate([1n]);
    const cert2 = await registry.read.getCertificate([2n]);

    assert.equal(cert1.studentName, "Amina Benali");
    assert.equal(cert2.studentName, "Sara Idrissi");
  });

  it("5. Refuser un utilisateur non autorise", async () => {
    const registry = await viem.deployContract("CertificateRegistry");
    const [owner, other] = await viem.getWalletClients();

    await assert.rejects(
      registry.write.mintCertificate(
        [
          owner.account.address,
          "Etudiant Test",
          "TEST-001",
          "Licence",
          "2026-06-15",
          "Bien"
        ],
        { account: other.account }
      )
    );
  });
});
