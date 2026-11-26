
import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

export default buildModule("CertificateRegistryV2Module", (m) => {
  const certificateRegistry = m.contract("CertificateRegistry");

  return { certificateRegistry };
});
