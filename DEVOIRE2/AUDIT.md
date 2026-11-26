# Rapport d'audit simplifié — CertificateRegistryERC721 (Devoir 2)

**Contrat audité :** `contracts/contracts/CertificateRegistryERC721.sol`, évolution de `CertificateRegistry.sol` (devoir 1)
**Version Solidity :** `^0.8.24`, compilé avec 0.8.34 (`viaIR`, optimizer 200)
**Dépendances :** OpenZeppelin Contracts 5.x (`ERC721`, `ERC721URIStorage`, `AccessControl`, `ReentrancyGuard`)
**Méthode :** relecture manuelle avec une checklist, tests unitaires automatisés, mesure de la couverture.

## 1. Périmètre

| Fonction | Accès | Rôle |
| --- | --- | --- |
| `constructor(admin)` | déploiement | donne `DEFAULT_ADMIN_ROLE` et `MINTER_ROLE` à `admin` |
| `mintCertificate(...)` | `MINTER_ROLE` | émet un certificat (un NFT) |
| `batchMintCertificates(...)` | `MINTER_ROLE` | émet 1 à 20 certificats en une transaction |
| `revokeCertificate(tokenId)` | `DEFAULT_ADMIN_ROLE` | révoque un certificat (flag + event) |
| `getCertificate`, `tokenURI`, `isStudentRegistered`, `getTotalCertificates` | public, `view` | lecture et vérification |
| `grantRole`, `revokeRole` (hérités) | admin | gestion des minters |
| `_update` (surcharge) | interne | bloque les transferts (soulbound) |

Hors périmètre : frontend React, scripts de déploiement, infrastructure (nœud, RPC, MetaMask).

## 2. Problèmes du devoir 1 corrigés dans le devoir 2

| Problème dans `CertificateRegistry` (devoir 1) | Gravité | Correction (devoir 2) |
| --- | --- | --- |
| Adresse `TEST_ADMIN` codée en dur avec les droits d'émission et de révocation, impossible à retirer | Critique | supprimée ; rôles `AccessControl` attribués et retirés par l'admin |
| Un seul niveau de droits (`onlyOwner`) pour émettre et révoquer | Risque | `MINTER_ROLE` pour émettre, `DEFAULT_ADMIN_ROLE` pour révoquer |
| Aucun standard : invisible dans les wallets et explorateurs | Risque | ERC-721 + `tokenURI` (ERC721URIStorage) |
| Taille du `batchMint` non limitée (risque de dépasser le gas) | Risque | `MAX_BATCH = 20` |
| Nom et diplôme vides acceptés | Risque faible | `EmptyField` pour nom, studentId, diplôme et URI |
| Messages `require` en texte (plus coûteux, moins précis) | Info | custom errors |
| Pas de protection contre la reentrancy | Info | `nonReentrant` + `_mint` sans callback |
| Frontend : rôle vérifié avec une adresse codée en dur | Risque | rôles lus dans le contrat avec `hasRole` |

## 3. Checklist appliquée

| # | Point vérifié | Résultat | Détail |
| --- | --- | --- | --- |
| 1 | Contrôle d'accès strict sur mint / revoke | OK | `onlyRole(MINTER_ROLE)` et `onlyRole(DEFAULT_ADMIN_ROLE)` ; testé |
| 2 | Events `CertificateMinted` / `CertificateRevoked` avec `tokenId indexed` | OK | testés avec leurs arguments |
| 3 | Pas de reentrancy sur le mint | OK | `nonReentrant`, `_mint` (pas de `_safeMint`), état écrit avant le mint |
| 4 | Validation des entrées | OK | adresse non nulle, champs non vides, taille de lot, tableaux de même taille |
| 5 | Double mint du même `studentId` impossible | OK | testé en unitaire et dans un lot |
| 6 | Révocation claire | OK | flag `revoked` + event ; double révocation refusée |
| 7 | Solidity ≥ 0.8 (overflow) | OK | contrôles natifs |
| 8 | Fonctions de lecture en `view` | OK | |
| 9 | Boucle non bornée (DoS gas) | OK | `MAX_BATCH = 20` |
| 10 | Transfert des certificats | OK (choix) | bloqué dans `_update` |
| 11 | Centralisation de l'admin | Risque | un seul compte (EOA) détient l'admin |
| 12 | Données personnelles on-chain | Risque | nom, studentId et mention publics et non effaçables (RGPD) |
| 13 | Unicité globale du `studentId` | Risque (logique métier) | un étudiant ne peut avoir qu'un seul certificat |
| 14 | Contenu du `tokenURI` | Risque faible | non vérifié on-chain : un minter peut y écrire des données incohérentes |

Aucun point **critique** dans le contrat du devoir 2.

## 4. Vulnérabilités recherchées

- **Reentrancy :** aucun appel externe pendant le mint, garde `nonReentrant`, ordre Checks → Effects → Interactions.
- **Contrôle d'accès :** toute fonction qui modifie l'état est protégée par un rôle ; un compte sans rôle reçoit `AccessControlUnauthorizedAccount` (testé).
- **Overflow / underflow :** protégés par Solidity 0.8.
- **Logique métier :** doublons (même dans un lot), double révocation, token inexistant, transfert : tous refusés et testés.
- **Déni de service :** lots limités à 20.
- **Front-running :** aucun enjeu financier, seuls les minters agissent. Risque négligeable.

## 5. Résultats des tests automatisés

Commande : `npx hardhat test --coverage` — **25 tests réussis, 0 échec** (15 pour le contrat ERC-721, 5 du devoir 1 et 5 de l'exemple Counter).

| Test ERC-721 | Résultat |
| --- | --- |
| 1. Créer un certificat ERC721 (NFT, données, tokenURI, event) | ✔ |
| 2. Refuser un utilisateur non autorisé (pas de MINTER_ROLE) | ✔ |
| 3. Un minter ajouté par l'admin peut émettre | ✔ |
| 4. Empêcher les doublons (même studentId) | ✔ |
| 5. Refuser une adresse invalide et des champs vides | ✔ |
| 6. Créer plusieurs certificats (batch) | ✔ |
| 7. Batch : doublon dans le lot = tout le lot annulé | ✔ |
| 8. Batch : lot vide, trop grand ou tableaux de tailles différentes | ✔ |
| 9. Révoquer un certificat (flag + event, pas deux fois) | ✔ |
| 10. Refuser une révocation non autorisée | ✔ |
| 11. Certificat non transférable (soulbound) | ✔ |
| 12. Lecture d'un certificat inexistant refusée | ✔ |
| 13. Constructeur : admin = adresse nulle refusé | ✔ |
| 14. isStudentRegistered avant / après émission | ✔ |
| 15. Interfaces ERC-721 et AccessControl (ERC-165) | ✔ |

**Couverture de `CertificateRegistryERC721.sol` :** 100 % des lignes et 100 % des instructions.

## 6. Points d'amélioration recommandés

1. Confier `DEFAULT_ADMIN_ROLE` à un **multisig** et utiliser `AccessControlDefaultAdminRules`.
2. Stocker on-chain un **hash** des données personnelles plutôt que les données en clair.
3. Rendre l'unicité **(studentId, diplomaTitle)** si un étudiant peut obtenir plusieurs diplômes.
4. Stocker les métadonnées sur **IPFS** plutôt qu'en `data:` URI.
5. Ajouter **Pausable** pour arrêter les émissions en cas d'incident.
6. Frontend : remplacer `xlsx` 0.18.5 (npm, failles connues) par la version officielle de SheetJS (`cdn.sheetjs.com`).

## 7. Points non couverts (limites)

- **Slither** et le **fuzzing** n'ont pas été lancés sur le contrat ERC-721 : résultats à ajouter.
- Le **frontend** n'a pas été audité formellement (testé manuellement).
- Audit fait par l'auteur du code : ce n'est pas un audit indépendant.
- Le déploiement Sepolia (gestion de la clé privée, RPC) n'a pas été audité.
