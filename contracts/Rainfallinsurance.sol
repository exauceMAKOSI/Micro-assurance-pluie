// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title Micro-assurance agricole paramétrique (pluviométrie)
/// @notice Prototype académique : jetons de test uniquement
contract RainfallInsurance is AccessControl, ReentrancyGuard {
    using SafeERC20 for IERC20;

    bytes32 public constant ORACLE_ROLE = keccak256("ORACLE_ROLE");

    IERC20 public immutable token;

    string public constant ZONE = "Kinshasa";
    uint256 public constant PREMIUM = 10 * 1e18;
    uint256 public constant PAYOUT = 100 * 1e18;
    uint256 public constant DROUGHT_MM = 20;
    uint256 public constant FLOOD_MM = 200;

    struct Season {
        uint64 start;
        uint64 end;
        uint256 rainfallMm;
        bool settled;
    }

    struct Policy {
        address farmer;
        uint256 seasonId;
        bool resolved;
    }

    Season[] public seasons;
    Policy[] public policies;
    uint256 public reservedPayouts;
    mapping(address => uint256) public poolDeposits;

    event SeasonStarted(uint256 indexed seasonId, uint64 start, uint64 end);
    event PolicyCreated(uint256 indexed policyId, address indexed farmer, uint256 indexed seasonId);
    event SeasonSettled(uint256 indexed seasonId, uint256 rainfallMm);
    event PayoutTriggered(uint256 indexed policyId, address indexed farmer, uint256 amount);
    event PolicyClosedNoPayout(uint256 indexed policyId);
    event PoolDeposit(address indexed provider, uint256 amount);
    event PoolWithdrawal(address indexed provider, uint256 amount);

    constructor(IERC20 token_, address admin, address oracle) {
        token = token_;
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(ORACLE_ROLE, oracle);
    }

    // ---------- Administration ----------

    function startSeason(uint64 durationSeconds)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
        returns (uint256 seasonId)
    {
        require(durationSeconds > 0, "Duree invalide");
        uint64 start = uint64(block.timestamp);
        uint64 end = start + durationSeconds;
        seasons.push(Season(start, end, 0, false));
        seasonId = seasons.length - 1;
        emit SeasonStarted(seasonId, start, end);
    }

    // ---------- Pool de reassurance ----------

    function depositToPool(uint256 amount) external nonReentrant {
        require(amount > 0, "Montant nul");
        poolDeposits[msg.sender] += amount;
        token.safeTransferFrom(msg.sender, address(this), amount);
        emit PoolDeposit(msg.sender, amount);
    }

    function withdrawFromPool(uint256 amount) external nonReentrant {
        require(amount > 0, "Montant nul");
        require(poolDeposits[msg.sender] >= amount, "Depot insuffisant");
        uint256 balance = token.balanceOf(address(this));
        require(balance >= reservedPayouts + amount, "Fonds reserves");
        poolDeposits[msg.sender] -= amount;
        token.safeTransfer(msg.sender, amount);
        emit PoolWithdrawal(msg.sender, amount);
    }

    // ---------- Agriculteurs ----------

    function buyPolicy(uint256 seasonId) external nonReentrant returns (uint256 policyId) {
        require(seasonId < seasons.length, "Saison inconnue");
        Season storage s = seasons[seasonId];
        require(!s.settled && block.timestamp < s.end, "Saison close");

        uint256 balanceAfter = token.balanceOf(address(this)) + PREMIUM;
        require(balanceAfter >= reservedPayouts + PAYOUT, "Pool insuffisant");

        reservedPayouts += PAYOUT;
        policies.push(Policy(msg.sender, seasonId, false));
        policyId = policies.length - 1;

        token.safeTransferFrom(msg.sender, address(this), PREMIUM);
        emit PolicyCreated(policyId, msg.sender, seasonId);
    }

    // ---------- Oracle ----------

    function settleSeason(uint256 seasonId, uint256 rainfallMm)
        external
        onlyRole(ORACLE_ROLE)
    {
        require(seasonId < seasons.length, "Saison inconnue");
        Season storage s = seasons[seasonId];
        require(block.timestamp >= s.end, "Saison en cours");
        require(!s.settled, "Deja reglee");
        s.rainfallMm = rainfallMm;
        s.settled = true;
        emit SeasonSettled(seasonId, rainfallMm);
    }

    // ---------- Indemnisation automatique ----------

    function payPolicy(uint256 policyId) external nonReentrant {
        require(policyId < policies.length, "Police inconnue");
        Policy storage p = policies[policyId];
        require(!p.resolved, "Deja traitee");
        Season storage s = seasons[p.seasonId];
        require(s.settled, "Saison non reglee");

        p.resolved = true;
        reservedPayouts -= PAYOUT;

        if (isTriggered(s.rainfallMm)) {
            token.safeTransfer(p.farmer, PAYOUT);
            emit PayoutTriggered(policyId, p.farmer, PAYOUT);
        } else {
            emit PolicyClosedNoPayout(policyId);
        }
    }

    // ---------- Lecture ----------

    function isTriggered(uint256 rainfallMm) public pure returns (bool) {
        return rainfallMm < DROUGHT_MM || rainfallMm > FLOOD_MM;
    }

    function policyCount() external view returns (uint256) {
        return policies.length;
    }

    function seasonCount() external view returns (uint256) {
        return seasons.length;
    }
}
