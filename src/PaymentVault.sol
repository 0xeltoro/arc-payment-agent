// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title PaymentVault
/// @notice Holds USDC and lets a single off-chain agent execute payments within
///         an onchain spending policy. The agent can only call executePayment —
///         every other privileged action requires the owner, so a compromised
///         agent key cannot change policy or move funds outside the policy.
contract PaymentVault {
    using SafeERC20 for IERC20;

    // --- Errors ---
    error NotOwner();
    error NotAgent();
    error ZeroAddress();
    error Paused();
    error RecipientNotAllowed();
    error ExceedsMaxPerTx();
    error ExceedsDailyLimit();
    error InsufficientBalance();

    // --- Events ---
    event PolicySet(uint256 maxPerTx, uint256 dailyLimit);
    event AgentSet(address indexed agent);
    event RecipientAdded(address indexed recipient);
    event RecipientRemoved(address indexed recipient);
    event Paused_(bool paused);
    event Withdrawn(address indexed to, uint256 amount);
    event PaymentExecuted(address indexed to, uint256 amount, uint256 day);

    // --- State ---
    address public owner;
    address public agent;
    IERC20 public immutable usdc;

    uint256 public maxPerTx;
    uint256 public dailyLimit;
    uint256 public spentToday;
    uint256 public currentDay;

    mapping(address => bool) public allowedRecipients;
    bool public paused;

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyAgent() {
        if (msg.sender != agent) revert NotAgent();
        _;
    }

    constructor(address _usdc, address _agent, uint256 _maxPerTx, uint256 _dailyLimit) {
        if (_usdc == address(0) || _agent == address(0)) revert ZeroAddress();

        owner = msg.sender;
        agent = _agent;
        usdc = IERC20(_usdc);
        maxPerTx = _maxPerTx;
        dailyLimit = _dailyLimit;
        currentDay = block.timestamp / 1 days;

        emit AgentSet(_agent);
        emit PolicySet(_maxPerTx, _dailyLimit);
    }

    /// @notice Execute a payment to an allowlisted recipient within policy limits.
    /// @dev The agent's only capability. Day rollover is handled here so the
    ///      policy stays self-contained and cannot be bypassed by omitting a
    ///      separate "roll the day" call.
    function executePayment(address to, uint256 amount) external onlyAgent {
        if (paused) revert Paused();
        if (!allowedRecipients[to]) revert RecipientNotAllowed();
        if (amount > maxPerTx) revert ExceedsMaxPerTx();

        uint256 today = block.timestamp / 1 days;
        if (today != currentDay) {
            currentDay = today;
            spentToday = 0;
        }

        if (spentToday + amount > dailyLimit) revert ExceedsDailyLimit();

        spentToday += amount;

        usdc.safeTransfer(to, amount);

        emit PaymentExecuted(to, amount, today);
    }

    function setPolicy(uint256 _maxPerTx, uint256 _dailyLimit) external onlyOwner {
        maxPerTx = _maxPerTx;
        dailyLimit = _dailyLimit;
        emit PolicySet(_maxPerTx, _dailyLimit);
    }

    function setAgent(address _agent) external onlyOwner {
        if (_agent == address(0)) revert ZeroAddress();
        agent = _agent;
        emit AgentSet(_agent);
    }

    function addRecipient(address recipient) external onlyOwner {
        if (recipient == address(0)) revert ZeroAddress();
        allowedRecipients[recipient] = true;
        emit RecipientAdded(recipient);
    }

    function removeRecipient(address recipient) external onlyOwner {
        allowedRecipients[recipient] = false;
        emit RecipientRemoved(recipient);
    }

    function pause() external onlyOwner {
        paused = true;
        emit Paused_(true);
    }

    function unpause() external onlyOwner {
        paused = false;
        emit Paused_(false);
    }

    function withdraw(uint256 amount) external onlyOwner {
        usdc.safeTransfer(owner, amount);
        emit Withdrawn(owner, amount);
    }

    /// @notice Remaining spendable amount for the current day, accounting for
    ///         a day rollover that hasn't been persisted onchain yet.
    function remainingToday() external view returns (uint256) {
        uint256 today = block.timestamp / 1 days;
        uint256 spent = today != currentDay ? 0 : spentToday;
        return dailyLimit > spent ? dailyLimit - spent : 0;
    }

    /// @notice Preview whether a payment would succeed under current policy.
    function canPay(address to, uint256 amount) external view returns (bool) {
        if (paused) return false;
        if (!allowedRecipients[to]) return false;
        if (amount > maxPerTx) return false;

        uint256 today = block.timestamp / 1 days;
        uint256 spent = today != currentDay ? 0 : spentToday;
        if (spent + amount > dailyLimit) return false;

        return true;
    }
}
