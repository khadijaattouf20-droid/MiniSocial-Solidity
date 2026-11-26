
 // SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract CertificateRegistry {
    address public owner;

    // Compte MetaMask autorise pour les tests locaux
    address public constant TEST_ADMIN =
        0xA42665f3bFef443F1C5dcc5063DC6A7Ac5D7D8b0;

    uint256 public nextCertId = 1;

    struct Certificate {
        string studentName;
        string studentId;
        string diplomaTitle;
        string issueDate;
        string grade;
        address recipient;
        bool revoked;
    }

    mapping(uint256 => Certificate) private certificates;
    mapping(bytes32 => bool) private registeredStudents;

    event CertificateMinted(
        uint256 indexed certId,
        string studentId,
        address recipient
    );

    event CertificateRevoked(uint256 indexed certId);

    // Seuls le proprietaire et le compte de test
    // MetaMask peuvent emettre des certificats.
    modifier onlyOwner() {
        require(
            msg.sender == owner ||
            msg.sender == TEST_ADMIN,
            "Non autorise"
        );
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    // Fonction interne de creation d'un certificat
    function _mint(
        address to,
        string memory studentName,
        string memory studentId,
        string memory diplomaTitle,
        string memory issueDate,
        string memory grade
    ) internal returns (uint256) {
        require(
            to != address(0),
            "Adresse destinataire invalide"
        );

        require(
            bytes(studentId).length > 0,
            "Identifiant etudiant vide"
        );

        bytes32 key = keccak256(bytes(studentId));

        require(
            !registeredStudents[key],
            "Etudiant deja enregistre"
        );

        uint256 certId = nextCertId++;

        certificates[certId] = Certificate({
            studentName: studentName,
            studentId: studentId,
            diplomaTitle: diplomaTitle,
            issueDate: issueDate,
            grade: grade,
            recipient: to,
            revoked: false
        });

        registeredStudents[key] = true;

        emit CertificateMinted(
            certId,
            studentId,
            to
        );

        return certId;
    }

    // Emission d'un seul certificat
    function mintCertificate(
        address to,
        string calldata studentName,
        string calldata studentId,
        string calldata diplomaTitle,
        string calldata issueDate,
        string calldata grade
    ) external onlyOwner returns (uint256) {
        return _mint(
            to,
            studentName,
            studentId,
            diplomaTitle,
            issueDate,
            grade
        );
    }

    // Emission de plusieurs certificats depuis Excel
    function batchMint(
        address[] calldata recipients,
        string[] calldata studentNames,
        string[] calldata studentIds,
        string[] calldata diplomaTitles,
        string[] calldata issueDates,
        string[] calldata grades
    ) external onlyOwner {
        uint256 n = studentIds.length;

        require(n > 0, "Liste vide");

        require(
            recipients.length == n &&
            studentNames.length == n &&
            diplomaTitles.length == n &&
            issueDates.length == n &&
            grades.length == n,
            "Tailles incompatibles"
        );

        for (uint256 i = 0; i < n; i++) {
            _mint(
                recipients[i],
                studentNames[i],
                studentIds[i],
                diplomaTitles[i],
                issueDates[i],
                grades[i]
            );
        }
    }

    // Consultation publique d'un certificat
    function getCertificate(uint256 certId)
        external
        view
        returns (Certificate memory)
    {
        require(
            certId > 0 && certId < nextCertId,
            "Certificat inexistant"
        );

        return certificates[certId];
    }

    // Revocation d'un certificat
    function revoke(uint256 certId) external onlyOwner {
        require(
            certId > 0 && certId < nextCertId,
            "Certificat inexistant"
        );

        require(
            !certificates[certId].revoked,
            "Deja revoque"
        );

        certificates[certId].revoked = true;

        emit CertificateRevoked(certId);
    }

    // Retourner le nombre total de certificats
    function getTotalCertificates()
        external
        view
        returns (uint256)
    {
        return nextCertId - 1;
    }
}
