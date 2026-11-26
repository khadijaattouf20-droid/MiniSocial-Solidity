// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// Devoir 2 : évolution de CertificateRegistry (devoir 1) vers le standard ERC-721.
// Changements principaux par rapport au devoir 1 :
//  - chaque certificat devient un NFT (tokenId) avec un tokenURI (ERC721URIStorage) ;
//  - owner + TEST_ADMIN codé en dur  ->  rôles AccessControl (MINTER_ROLE, DEFAULT_ADMIN_ROLE) ;
//  - require("texte")  ->  custom errors ;
//  - nonReentrant, validation de tous les champs, lots limités à MAX_BATCH ;
//  - certificats non transférables (soulbound).

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ERC721URIStorage} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract CertificateRegistryERC721 is ERC721, ERC721URIStorage, AccessControl, ReentrancyGuard {
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    uint256 public constant MAX_BATCH = 20;

    // Même struct qu'au devoir 1 (le tokenId remplace certId).
    struct Certificate {
        string studentName;
        string studentId;
        string diplomaTitle;
        string issueDate;
        string grade;
        address recipient;
        bool revoked;
    }

    uint256 public nextTokenId = 1;

    mapping(uint256 => Certificate) private certificates;
    mapping(bytes32 => bool) private registeredStudents;

    event CertificateMinted(uint256 indexed tokenId, string studentId, address indexed recipient);
    event CertificateRevoked(uint256 indexed tokenId);

    error ZeroAddress();
    error EmptyField();
    error StudentAlreadyRegistered(string studentId);
    error AlreadyRevoked(uint256 tokenId);
    error InvalidBatchSize();
    error LengthMismatch();
    error NonTransferable();

    constructor(address admin) ERC721("Certificat Academique", "CERT") {
        if (admin == address(0)) revert ZeroAddress();
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(MINTER_ROLE, admin);
    }

    // ------------------------------------------------------------ émission

    // Émission d'un seul certificat
    function mintCertificate(
        address to,
        string calldata uri,
        string calldata studentName,
        string calldata studentId,
        string calldata diplomaTitle,
        string calldata issueDate,
        string calldata grade
    ) external onlyRole(MINTER_ROLE) nonReentrant returns (uint256) {
        return _mintCertificate(to, uri, studentName, studentId, diplomaTitle, issueDate, grade);
    }

    // Émission de plusieurs certificats depuis Excel
    function batchMintCertificates(
        address[] calldata recipients,
        string[] calldata uris,
        string[] calldata studentNames,
        string[] calldata studentIds,
        string[] calldata diplomaTitles,
        string[] calldata issueDates,
        string[] calldata grades
    ) external onlyRole(MINTER_ROLE) nonReentrant {
        uint256 n = recipients.length;
        if (n == 0 || n > MAX_BATCH) revert InvalidBatchSize();
        if (
            uris.length != n ||
            studentNames.length != n ||
            studentIds.length != n ||
            diplomaTitles.length != n ||
            issueDates.length != n ||
            grades.length != n
        ) revert LengthMismatch();

        for (uint256 i = 0; i < n; ++i) {
            _mintCertificate(
                recipients[i],
                uris[i],
                studentNames[i],
                studentIds[i],
                diplomaTitles[i],
                issueDates[i],
                grades[i]
            );
        }
    }

    // Fonction interne de création d'un certificat
    function _mintCertificate(
        address to,
        string calldata uri,
        string calldata studentName,
        string calldata studentId,
        string calldata diplomaTitle,
        string calldata issueDate,
        string calldata grade
    ) internal returns (uint256 tokenId) {
        // 1. Checks : validation des entrées
        if (to == address(0)) revert ZeroAddress();
        if (
            bytes(uri).length == 0 ||
            bytes(studentName).length == 0 ||
            bytes(studentId).length == 0 ||
            bytes(diplomaTitle).length == 0
        ) revert EmptyField();

        bytes32 key = keccak256(bytes(studentId));
        if (registeredStudents[key]) revert StudentAlreadyRegistered(studentId);

        // 2. Effects : l'état est écrit avant le mint
        registeredStudents[key] = true;
        tokenId = nextTokenId++;
        certificates[tokenId] = Certificate({
            studentName: studentName,
            studentId: studentId,
            diplomaTitle: diplomaTitle,
            issueDate: issueDate,
            grade: grade,
            recipient: to,
            revoked: false
        });

        // 3. Interactions : _mint (et non _safeMint) n'appelle aucun contrat externe
        _mint(to, tokenId);
        _setTokenURI(tokenId, uri);

        emit CertificateMinted(tokenId, studentId, to);
    }

    // ---------------------------------------------------------- révocation

    function revokeCertificate(uint256 tokenId) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _requireOwned(tokenId);
        Certificate storage cert = certificates[tokenId];
        if (cert.revoked) revert AlreadyRevoked(tokenId);
        cert.revoked = true;
        emit CertificateRevoked(tokenId);
    }

    // -------------------------------------------------------------- lecture

    // Consultation publique d'un certificat
    function getCertificate(uint256 tokenId) external view returns (Certificate memory) {
        _requireOwned(tokenId);
        return certificates[tokenId];
    }

    function isStudentRegistered(string calldata studentId) external view returns (bool) {
        return registeredStudents[keccak256(bytes(studentId))];
    }

    // Nombre total de certificats (comme au devoir 1)
    function getTotalCertificates() external view returns (uint256) {
        return nextTokenId - 1;
    }

    // ------------------------------------------------- soulbound + overrides

    // Bloque les transferts : seul le mint (from = 0) est autorisé.
    function _update(address to, uint256 tokenId, address auth) internal override(ERC721) returns (address) {
        address from = _ownerOf(tokenId);
        if (from != address(0) && to != address(0)) revert NonTransferable();
        return super._update(to, tokenId, auth);
    }

    function tokenURI(uint256 tokenId) public view override(ERC721, ERC721URIStorage) returns (string memory) {
        return super.tokenURI(tokenId);
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721, ERC721URIStorage, AccessControl)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}
