import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

// Devoir 2 : le compte #0 (celui qui déploie) devient admin + minter.
export default buildModule("CertificateRegistryERC721Module", (m) => {
  const admin = m.getAccount(0);
  const certificateRegistry = m.contract("CertificateRegistryERC721", [admin]);

  return { certificateRegistry };
});
