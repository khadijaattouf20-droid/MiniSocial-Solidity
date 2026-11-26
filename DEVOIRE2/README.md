# Devoir 2 — Standards ERC et audit (évolution du devoir 1)

Le système de certificats du devoir 1 (`CertificateRegistry`) a été refactoré vers le standard **ERC-721** :
chaque certificat devient un NFT unique (`tokenId`) avec ses métadonnées (`tokenURI`), et les droits sont gérés
par **rôles** OpenZeppelin (`MINTER_ROLE`, `DEFAULT_ADMIN_ROLE`).

## Ce qui a changé depuis le devoir 1

| Élément | Devoir 1 | Devoir 2 |
| --- | --- | --- |
| Contrat | `CertificateRegistry.sol` (conservé) | `CertificateRegistryERC721.sol` (nouveau) |
| Standard | aucun | ERC-721 + ERC721URIStorage (OpenZeppelin) |
| Identifiant | `certId` | `tokenId` (NFT) |
| Droits | `owner` + `TEST_ADMIN` codé en dur | `AccessControl` : `MINTER_ROLE` / `DEFAULT_ADMIN_ROLE` |
| Émission | `mintCertificate`, `batchMint` | `mintCertificate`, `batchMintCertificates` (+ `uri`) |
| Révocation | `revoke` | `revokeCertificate` (admin uniquement) |
| Erreurs | `require("texte")` | custom errors |
| Sécurité | — | `nonReentrant`, lots ≤ 20, validation des champs, soulbound |
| Tests | 5 tests | 15 tests ERC-721 (100 % de couverture) + les 5 du devoir 1 |
| Frontend | owner / TEST_ADMIN codés en dur | rôles lus avec `hasRole`, tokenId, tokenURI, révocation, erreurs de rôle claires |

## Structure

| Chemin | Contenu |
| --- | --- |
| `contracts/contracts/CertificateRegistryERC721.sol` | contrat ERC-721 |
| `contracts/test/CertificateRegistryERC721.ts` | tests de sécurité |
| `contracts/ignition/modules/CertificateRegistryERC721.ts` | déploiement |
| `contracts/scripts/` | `export-abi.mjs`, `grantMinter.ts`, `demo-mint.ts` |
| `frontend/src/App.jsx` | frontend du devoir 1 adapté à l'ERC-721 |
| `frontend/src/config.js` | adresse du contrat et réseau |
| `etudiants_exemple.xlsx` | fichier Excel d'exemple (8 étudiants) |
| `AUDIT.md` | rapport d'audit simplifié |

## Installation

Sous Windows PowerShell, utiliser `npx.cmd` et `npm.cmd`.

```powershell
cd contracts
npm.cmd install
npx.cmd hardhat build
npx.cmd hardhat test --coverage

cd ..\frontend
npm.cmd install
```

## Lancement en local

```powershell
# Terminal 1 (laisser ouvert)
cd contracts
npx.cmd hardhat node

# Terminal 2
cd contracts
npx.cmd hardhat ignition deploy ignition/modules/CertificateRegistryERC721.ts --network localhost
npm.cmd run export-abi

# Terminal 3
cd frontend
npm.cmd run dev
```

1. Mettre l'adresse affichée par le déploiement dans `frontend/src/config.js` si elle est différente.
2. Dans MetaMask : réseau Hardhat Local (31337) et compte `0xf39F…2266` (celui qui déploie : admin + minter).
3. Pour donner le rôle MINTER à un autre compte (remplace `TEST_ADMIN` du devoir 1) :

```powershell
$env:CONTRACT="0x5FbDB2315678afecb367f032d93F642f64180aa3"; $env:MINTER="0xA42665f3bFef443F1C5dcc5063DC6A7Ac5D7D8b0"
npx.cmd hardhat run scripts/grantMinter.ts --network localhost
```

## Déploiement sur Sepolia

```powershell
npx.cmd hardhat keystore set SEPOLIA_RPC_URL
npx.cmd hardhat keystore set SEPOLIA_PRIVATE_KEY
npx.cmd hardhat ignition deploy ignition/modules/CertificateRegistryERC721.ts --network sepolia
$env:CONTRACT="0x…"; npx.cmd hardhat run scripts/demo-mint.ts --network sepolia
```

- **Adresse du contrat sur Sepolia :** `à compléter`
- **Transaction d'exemple :** `à compléter` (lien Etherscan)

## Choix de conception

- **ERC-721 :** un certificat est unique et personnel, donc un NFT par certificat.
- **AccessControl :** plusieurs émetteurs possibles sans leur donner le droit de révoquer.
- **Même struct qu'au devoir 1 :** les données restent on-chain (vérification sans serveur) ; le `tokenURI`
  ajoute des métadonnées JSON standard, générées par le frontend (`data:` URI, sans IPFS).
- **`batchMintCertificates` avec des tableaux :** même style que `batchMint` du devoir 1, avec les
  `studentIds` pour bloquer les doublons (la signature du sujet ne prévoit que `to` et `uris`). Compilé avec
  `viaIR` pour éviter « stack too deep ».
- **Soulbound :** un diplôme ne se transfère pas.

## ERC-721 ou ERC-1155 pour ce cas ?

| Critère | ERC-721 | ERC-1155 |
| --- | --- | --- |
| Un certificat = un token unique | oui, naturel | possible (quantité 1), moins direct |
| Données propres à chaque étudiant | oui, par `tokenId` | non : un `id` = un type de diplôme partagé |
| Coût d'un lot | plus élevé | plus faible |
| Support wallets / explorateurs | très large | bon |

Conclusion : un certificat est personnel, donc **ERC-721** convient mieux. ERC-1155 servirait pour des badges
identiques distribués en masse.
