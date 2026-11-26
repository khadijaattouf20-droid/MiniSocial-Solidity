// Devoir 2 : évolution du frontend du devoir 1 vers le contrat ERC-721.
// Nouveautés : rôles (MINTER / ADMIN) lus dans le contrat, tokenId + tokenURI,
// messages clairs pour les erreurs de rôle, révocation, destinataire choisi.
import { useCallback, useEffect, useState } from "react";
import * as XLSX from "xlsx";
import {
  BaseError,
  ContractFunctionRevertedError,
  createPublicClient,
  createWalletClient,
  custom,
  http,
  isAddress,
  parseEventLogs,
  zeroHash,
} from "viem";
import { hardhat, sepolia } from "viem/chains";
import ABI from "./abi.json";
import { BATCH_SIZE, CHAIN_ID, CONTRACT_ADDRESS, RPC_URL } from "./config";
import "./App.css";

const CHAIN = CHAIN_ID === sepolia.id ? sepolia : hardhat;

const publicClient = createPublicClient({
  chain: CHAIN,
  transport: http(RPC_URL),
});

const contract = { address: CONTRACT_ADDRESS, abi: ABI };

const emptyForm = {
  studentName: "",
  studentId: "",
  diplomaTitle: "",
  issueDate: "",
  grade: "",
  recipientAddress: "",
};

// Messages lisibles pour les erreurs du contrat (custom errors).
const ERROR_MESSAGES = {
  AccessControlUnauthorizedAccount:
    "Compte non autorisé : il faut le rôle MINTER pour émettre et le rôle ADMIN pour révoquer.",
  StudentAlreadyRegistered: "Cet identifiant étudiant a déjà un certificat.",
  ZeroAddress: "Adresse du destinataire invalide.",
  EmptyField: "Un champ obligatoire est vide.",
  InvalidBatchSize: "Le lot doit contenir entre 1 et 20 certificats.",
  LengthMismatch: "Les listes envoyées n'ont pas la même taille.",
  AlreadyRevoked: "Ce certificat est déjà révoqué.",
  NonTransferable: "Les certificats ne sont pas transférables.",
  ERC721NonexistentToken: "Certificat inexistant.",
};

function errorText(error) {
  if (error instanceof BaseError) {
    const revert = error.walk((e) => e instanceof ContractFunctionRevertedError);
    const name = revert?.data?.errorName;
    if (name) return ERROR_MESSAGES[name] ?? "Erreur du contrat : " + name;
    const details = `${error.shortMessage} ${error.details ?? ""}`;
    if (/user (rejected|denied)/i.test(details)) return "Transaction refusée dans MetaMask.";
    if (/insufficient funds/i.test(details)) return "Pas assez d'ETH pour payer les frais.";
    if (/fetch|ECONNREFUSED/i.test(details))
      return "Le nœud Hardhat ne répond pas. Lancez « npx.cmd hardhat node ».";
    return error.shortMessage;
  }
  if (error?.code === 4001) return "Demande refusée dans MetaMask.";
  return error?.message || String(error);
}

// Métadonnées du NFT (tokenURI) générées sans serveur ni IPFS.
function buildTokenURI(student) {
  const metadata = {
    name: `Certificat ${student.diplomaTitle} - ${student.studentName}`,
    description: `Certificat académique de ${student.studentName} (${student.studentId}).`,
    attributes: [
      { trait_type: "studentId", value: student.studentId },
      { trait_type: "diplomaTitle", value: student.diplomaTitle },
      { trait_type: "issueDate", value: student.issueDate },
      { trait_type: "grade", value: student.grade },
    ],
  };
  return "data:application/json;charset=utf-8," + encodeURIComponent(JSON.stringify(metadata));
}

function decodeTokenURI(uri) {
  if (!uri?.startsWith("data:application/json")) return null;
  const comma = uri.indexOf(",");
  try {
    const body = uri.slice(comma + 1);
    return JSON.parse(uri.slice(0, comma).includes(";base64") ? atob(body) : decodeURIComponent(body));
  } catch {
    return null;
  }
}

function App() {
  const [wallet, setWallet] = useState("");
  const [roles, setRoles] = useState({ minter: false, admin: false });
  const [form, setForm] = useState(emptyForm);
  const [students, setStudents] = useState([]);
  const [selected, setSelected] = useState([]);
  const [searchId, setSearchId] = useState("");
  const [certificate, setCertificate] = useState(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [hashes, setHashes] = useState([]);
  const [createdIds, setCreatedIds] = useState([]);

  // Suit les changements de compte / réseau dans MetaMask (comme au devoir 1).
  useEffect(() => {
    const provider = window.ethereum;
    if (!provider?.on) return;

    provider.request({ method: "eth_accounts" }).then((accounts) => setWallet(accounts[0] || ""));

    function handleAccounts(accounts) {
      setWallet(accounts[0] || "");
    }

    function handleChain() {
      setWallet("");
      setMessage("Réseau changé. Reconnectez MetaMask.");
    }

    provider.on("accountsChanged", handleAccounts);
    provider.on("chainChanged", handleChain);

    return () => {
      provider.removeListener?.("accountsChanged", handleAccounts);
      provider.removeListener?.("chainChanged", handleChain);
    };
  }, []);

  // Nouveau : les rôles sont lus dans le contrat (plus d'adresse codée en dur).
  const loadRoles = useCallback(async (account) => {
    if (!account) return { minter: false, admin: false };
    try {
      const minterRole = await publicClient.readContract({ ...contract, functionName: "MINTER_ROLE" });
      const [minter, admin] = await Promise.all([
        publicClient.readContract({ ...contract, functionName: "hasRole", args: [minterRole, account] }),
        publicClient.readContract({ ...contract, functionName: "hasRole", args: [zeroHash, account] }),
      ]);
      return { minter, admin };
    } catch {
      return { minter: false, admin: false };
    }
  }, []);

  useEffect(() => {
    let active = true;
    loadRoles(wallet).then((result) => active && setRoles(result));
    return () => {
      active = false;
    };
  }, [wallet, loadRoles]);

  async function checkContract() {
    const code = await publicClient.getCode({ address: CONTRACT_ADDRESS });

    if (!code || code === "0x") {
      throw new Error(
        "Contrat introuvable. Lancez « hardhat node », déployez le contrat et mettez à jour CONTRACT_ADDRESS dans src/config.js.",
      );
    }
  }

  async function checkChain(provider) {
    const chainId = await provider.request({ method: "eth_chainId" });
    if (BigInt(chainId) === BigInt(CHAIN_ID)) return;

    try {
      await provider.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: "0x" + CHAIN_ID.toString(16) }],
      });
    } catch {
      throw new Error(`Sélectionnez le réseau ${CHAIN.name} (${CHAIN_ID}) dans MetaMask.`);
    }
  }

  async function connectWallet() {
    setMessage("Demande de connexion MetaMask...");

    try {
      const provider = window.ethereum;

      if (!provider) {
        throw new Error("MetaMask n'est pas détecté. Ouvrez Chrome avec l'extension.");
      }

      const accounts = await provider.request({ method: "eth_requestAccounts" });

      if (!accounts.length) {
        throw new Error("Aucun compte disponible.");
      }

      await checkChain(provider);
      await checkContract();

      setWallet(accounts[0]);
      setMessage("MetaMask connecté : " + accounts[0]);
    } catch (error) {
      console.error("Connexion MetaMask :", error);
      setMessage("Erreur MetaMask : " + errorText(error));
    }
  }

  // Vérifie le réseau, le contrat et le rôle avant chaque transaction.
  async function authorizedClient(role) {
    const provider = window.ethereum;

    if (!provider) {
      throw new Error("MetaMask n'est pas installé.");
    }

    await checkChain(provider);
    await checkContract();

    const accounts = await provider.request({ method: "eth_requestAccounts" });
    const account = accounts[0];

    if (!account) {
      throw new Error("Aucun compte MetaMask connecté.");
    }

    setWallet(account);

    const accountRoles = await loadRoles(account);
    setRoles(accountRoles);

    if (!accountRoles[role]) {
      throw new Error(
        `Compte non autorisé : ${account} n'a pas le rôle ${role === "minter" ? "MINTER" : "ADMIN"}. ` +
          "Choisissez le compte qui a déployé le contrat, ou donnez-lui le rôle avec scripts/grantMinter.ts.",
      );
    }

    const walletClient = createWalletClient({
      chain: CHAIN,
      transport: custom(provider),
    });

    return { walletClient, account };
  }

  // Simule d'abord (pour obtenir la vraie erreur), puis envoie la transaction.
  async function sendTransaction(walletClient, account, functionName, args) {
    const { request } = await publicClient.simulateContract({ ...contract, functionName, args, account });
    const hash = await walletClient.writeContract(request);
    setHashes((previous) => [...previous, hash]);
    setMessage("Transaction envoyée : " + hash);

    const receipt = await publicClient.waitForTransactionReceipt({ hash });

    if (receipt.status !== "success") {
      throw new Error("Transaction échouée.");
    }

    return receipt;
  }

  function getIds(receipt) {
    const events = parseEventLogs({
      abi: ABI,
      eventName: "CertificateMinted",
      logs: receipt.logs.filter((log) => log.address.toLowerCase() === CONTRACT_ADDRESS.toLowerCase()),
    });

    return events.map((event) => event.args.tokenId.toString());
  }

  async function handleMint(event) {
    event.preventDefault();

    if (loading) return;

    setLoading(true);
    setMessage("Préparation de la transaction...");
    setHashes([]);
    setCreatedIds([]);

    try {
      const { studentName, studentId, diplomaTitle, issueDate, grade } = form;

      if ([studentName, studentId, diplomaTitle, issueDate, grade].some((value) => !String(value).trim())) {
        throw new Error("Remplissez tous les champs.");
      }

      const recipient = form.recipientAddress.trim();
      if (recipient && !isAddress(recipient)) {
        throw new Error("Adresse du destinataire incorrecte.");
      }

      const { walletClient, account } = await authorizedClient("minter");

      const student = {
        studentName: studentName.trim(),
        studentId: studentId.trim(),
        diplomaTitle: diplomaTitle.trim(),
        issueDate,
        grade: grade.trim(),
      };

      setMessage("Demande de confirmation envoyée à MetaMask...");

      const receipt = await sendTransaction(walletClient, account, "mintCertificate", [
        recipient || account,
        buildTokenURI(student),
        student.studentName,
        student.studentId,
        student.diplomaTitle,
        student.issueDate,
        student.grade,
      ]);

      const ids = getIds(receipt);
      setCreatedIds(ids);

      if (ids.length > 0) {
        setSearchId(ids[0]);
      }

      setMessage(`Certificat NFT créé avec succès ! tokenId : ${ids.join(", ")}`);
      setForm({ ...emptyForm });
    } catch (error) {
      console.error("Emission unitaire :", error);
      setMessage("Erreur : " + errorText(error));
    } finally {
      setLoading(false);
    }
  }

  async function importExcel(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    setStudents([]);
    setSelected([]);
    setMessage("");

    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: "array", dateNF: "yyyy-mm-dd" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];

      const rows = XLSX.utils.sheet_to_json(sheet, {
        defval: "",
        raw: false,
        dateNF: "yyyy-mm-dd",
      });

      const required = ["studentName", "studentId", "diplomaTitle", "issueDate", "grade"];

      if (rows.length === 0 || required.some((key) => !(key in rows[0]))) {
        throw new Error("Fichier vide ou colonnes incorrectes.");
      }

      const clean = rows.map((row, i) => ({
        index: i,
        studentName: String(row.studentName).trim(),
        studentId: String(row.studentId).trim(),
        diplomaTitle: String(row.diplomaTitle).trim(),
        issueDate: String(row.issueDate).trim(),
        grade: String(row.grade).trim(),
        recipientAddress: String(row.recipientAddress || "").trim(),
        alreadyMinted: false,
      }));

      const seen = new Set();

      for (const row of clean) {
        if (required.some((key) => !row[key])) {
          throw new Error("Informations manquantes à la ligne " + (row.index + 2));
        }

        if (!/^\d{4}-\d{2}-\d{2}$/.test(row.issueDate)) {
          throw new Error("Format de date incorrect à la ligne " + (row.index + 2));
        }

        if (row.recipientAddress && !isAddress(row.recipientAddress)) {
          throw new Error("Adresse wallet incorrecte à la ligne " + (row.index + 2));
        }

        if (seen.has(row.studentId)) {
          throw new Error("Identifiant étudiant en double : " + row.studentId);
        }

        seen.add(row.studentId);
      }

      // Nouveau : on repère les étudiants qui ont déjà un certificat on-chain.
      try {
        await checkContract();
        const registered = await Promise.all(
          clean.map((row) =>
            publicClient.readContract({ ...contract, functionName: "isStudentRegistered", args: [row.studentId] }),
          ),
        );
        registered.forEach((value, i) => {
          clean[i].alreadyMinted = value;
        });
      } catch {
        // contrat non joignable : la vérification se fera à l'émission
      }

      setStudents(clean);
      setSelected(clean.filter((row) => !row.alreadyMinted).map((row) => row.index));

      const done = clean.filter((row) => row.alreadyMinted).length;
      setMessage(
        clean.length + " étudiants importés avec succès." + (done ? ` ${done} ont déjà un certificat.` : ""),
      );
    } catch (error) {
      console.error("Import Excel :", error);
      setMessage("Erreur Excel : " + errorText(error));
    }
  }

  function toggleStudent(index) {
    setSelected((previous) =>
      previous.includes(index) ? previous.filter((i) => i !== index) : [...previous, index],
    );
  }

  async function handleBatchMint() {
    if (loading || selected.length === 0) return;

    setLoading(true);
    setMessage("Préparation des certificats...");
    setHashes([]);
    setCreatedIds([]);

    const completed = [];
    const allIds = [];

    try {
      const { walletClient, account } = await authorizedClient("minter");

      const chosen = selected.map((i) => students[i]);

      for (let start = 0; start < chosen.length; start += BATCH_SIZE) {
        const batch = chosen.slice(start, start + BATCH_SIZE);

        setMessage("Confirmation MetaMask pour le lot " + (Math.floor(start / BATCH_SIZE) + 1));

        const receipt = await sendTransaction(walletClient, account, "batchMintCertificates", [
          batch.map((s) => s.recipientAddress || account),
          batch.map((s) => buildTokenURI(s)),
          batch.map((s) => s.studentName),
          batch.map((s) => s.studentId),
          batch.map((s) => s.diplomaTitle),
          batch.map((s) => s.issueDate),
          batch.map((s) => s.grade),
        ]);

        allIds.push(...getIds(receipt));
        completed.push(...batch);
        setCreatedIds([...allIds]);
      }

      setMessage(completed.length + " certificats NFT créés avec succès !");
    } catch (error) {
      console.error("Emission multiple :", error);
      setMessage("Erreur : " + errorText(error) + ". Certificats déjà réussis : " + completed.length);
    } finally {
      const doneIndexes = completed.map((s) => s.index);
      setStudents((previous) =>
        previous.map((s) => (doneIndexes.includes(s.index) ? { ...s, alreadyMinted: true } : s)),
      );
      setSelected((previous) => previous.filter((index) => !doneIndexes.includes(index)));
      setLoading(false);
    }
  }

  async function loadCertificate(tokenId) {
    const [data, tokenURI, owner] = await Promise.all([
      publicClient.readContract({ ...contract, functionName: "getCertificate", args: [tokenId] }),
      publicClient.readContract({ ...contract, functionName: "tokenURI", args: [tokenId] }),
      publicClient.readContract({ ...contract, functionName: "ownerOf", args: [tokenId] }),
    ]);

    setCertificate({ ...data, tokenId, tokenURI, owner, metadata: decodeTokenURI(tokenURI) });
  }

  async function verifyCertificate() {
    setCertificate(null);
    setMessage("");

    try {
      if (!/^[1-9]\d*$/.test(searchId.trim())) {
        throw new Error("Identifiant invalide (tokenId à partir de 1).");
      }

      await checkContract();
      await loadCertificate(BigInt(searchId.trim()));
      setMessage("Certificat trouvé.");
    } catch (error) {
      setMessage("Erreur : " + errorText(error));
    }
  }

  async function revokeCertificate() {
    if (loading || !certificate) return;

    setLoading(true);
    setHashes([]);

    try {
      const { walletClient, account } = await authorizedClient("admin");
      setMessage("Demande de confirmation envoyée à MetaMask...");
      await sendTransaction(walletClient, account, "revokeCertificate", [certificate.tokenId]);
      await loadCertificate(certificate.tokenId);
      setMessage("Certificat " + certificate.tokenId + " révoqué.");
    } catch (error) {
      console.error("Révocation :", error);
      setMessage("Erreur : " + errorText(error));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="container">
      <h1>Certification Académique Blockchain</h1>

      <p>Gestion et vérification des certificats académiques (NFT ERC-721)</p>

      <button type="button" onClick={connectWallet}>
        {wallet ? "Wallet connecté" : "Connecter MetaMask"}
      </button>

      {wallet && (
        <>
          <p className="wallet">Adresse : {wallet}</p>
          <p className="roles">
            <span className={roles.minter ? "badge ok" : "badge ko"}>
              {roles.minter ? "MINTER" : "Pas MINTER"}
            </span>
            <span className={roles.admin ? "badge ok" : "badge ko"}>
              {roles.admin ? "ADMIN" : "Pas ADMIN"}
            </span>
          </p>
          {!roles.minter && (
            <p className="warning">
              Ce compte ne peut pas émettre de certificats (rôle MINTER manquant). Choisissez dans MetaMask le
              compte qui a déployé le contrat.
            </p>
          )}
        </>
      )}

      <p className="small">Contrat : {CONTRACT_ADDRESS}</p>

      <hr />

      <h2>1. Émettre un certificat NFT</h2>

      <form onSubmit={handleMint}>
        <input
          placeholder="Nom de l'étudiant"
          value={form.studentName}
          onChange={(e) => setForm({ ...form, studentName: e.target.value })}
          required
        />

        <input
          placeholder="Identifiant étudiant unique"
          value={form.studentId}
          onChange={(e) => setForm({ ...form, studentId: e.target.value })}
          required
        />

        <input
          placeholder="Diplôme"
          value={form.diplomaTitle}
          onChange={(e) => setForm({ ...form, diplomaTitle: e.target.value })}
          required
        />

        <input
          type="date"
          value={form.issueDate}
          onChange={(e) => setForm({ ...form, issueDate: e.target.value })}
          required
        />

        <input
          placeholder="Mention"
          value={form.grade}
          onChange={(e) => setForm({ ...form, grade: e.target.value })}
          required
        />

        <input
          placeholder="Adresse du destinataire (facultatif, sinon votre compte)"
          value={form.recipientAddress}
          onChange={(e) => setForm({ ...form, recipientAddress: e.target.value })}
        />

        <button type="submit" disabled={loading}>
          {loading ? "Transaction en cours..." : "Émettre un certificat ERC-721"}
        </button>
      </form>

      <p className="small">Le tokenURI (métadonnées JSON) est généré automatiquement.</p>

      <hr />

      <h2>2. Import Excel</h2>

      <p className="small">
        Colonnes : studentName, studentId, diplomaTitle, issueDate, grade, recipientAddress (facultative).
      </p>

      <input type="file" accept=".xlsx,.csv" onChange={importExcel} />

      {students.length > 0 && (
        <>
          <h3>Étudiants importés : {students.length}</h3>

          <div style={{ overflowX: "auto" }}>
            <table width="100%" border="1" cellPadding="8">
              <thead>
                <tr>
                  <th>Choix</th>
                  <th>Nom</th>
                  <th>Identifiant</th>
                  <th>Diplôme</th>
                  <th>Date</th>
                  <th>Mention</th>
                  <th>Statut</th>
                </tr>
              </thead>

              <tbody>
                {students.map((student, i) => (
                  <tr key={i} className={student.alreadyMinted ? "done" : ""}>
                    <td>
                      <input
                        type="checkbox"
                        checked={selected.includes(i)}
                        disabled={student.alreadyMinted}
                        onChange={() => toggleStudent(i)}
                      />
                    </td>
                    <td>{student.studentName}</td>
                    <td>{student.studentId}</td>
                    <td>{student.diplomaTitle}</td>
                    <td>{student.issueDate}</td>
                    <td>{student.grade}</td>
                    <td>{student.alreadyMinted ? "Déjà émis" : "Prêt"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p>{selected.length} étudiants sélectionnés</p>

          <button type="button" onClick={handleBatchMint} disabled={loading || selected.length === 0}>
            {loading ? "Émission en cours..." : `Émettre ${selected.length} certificats`}
          </button>
        </>
      )}

      <hr />

      <h2>3. Vérification publique</h2>

      <input
        placeholder="Identifiant du certificat (tokenId)"
        value={searchId}
        onChange={(e) => setSearchId(e.target.value)}
      />

      <button type="button" onClick={verifyCertificate}>
        Vérifier le certificat
      </button>

      {certificate && (
        <div className={certificate.revoked ? "result revoked" : "result"}>
          <h3>Informations du certificat</h3>
          <p>tokenId : {certificate.tokenId.toString()}</p>
          <p>Nom : {certificate.studentName}</p>
          <p>Identifiant : {certificate.studentId}</p>
          <p>Diplôme : {certificate.diplomaTitle}</p>
          <p>Date : {certificate.issueDate}</p>
          <p>Mention : {certificate.grade}</p>
          <p className="wallet">Propriétaire du NFT : {certificate.owner}</p>
          <p>
            Statut :<strong>{certificate.revoked ? " Révoqué" : " Valide"}</strong>
          </p>
          <p className="wallet">tokenURI : {certificate.tokenURI}</p>

          {certificate.metadata && (
            <details>
              <summary>Métadonnées décodées</summary>
              <pre>{JSON.stringify(certificate.metadata, null, 2)}</pre>
            </details>
          )}

          {roles.admin && !certificate.revoked && (
            <button type="button" className="danger" onClick={revokeCertificate} disabled={loading}>
              Révoquer ce certificat
            </button>
          )}
        </div>
      )}

      {createdIds.length > 0 && (
        <div className="result">
          <h3>NFT créés</h3>
          <p>tokenId : {createdIds.join(", ")}</p>
        </div>
      )}

      {hashes.map((hash, i) => (
        <p key={i} style={{ overflowWrap: "anywhere" }}>
          Transaction {i + 1} : {hash}
        </p>
      ))}

      {message && (
        <p className={message.startsWith("Erreur") ? "message error" : "message"} role="status">
          {message}
        </p>
      )}
    </div>
  );
}

export default App;
