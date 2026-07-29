// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {PaymentVault} from "../src/PaymentVault.sol";

contract MockUSDC is ERC20 {
    constructor() ERC20("Mock USDC", "mUSDC") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

contract PaymentVaultTest is Test {
    PaymentVault public vault;
    MockUSDC public usdc;

    address public owner = address(this);
    address public agent = makeAddr("agent");
    address public recipient = makeAddr("recipient");
    address public stranger = makeAddr("stranger");

    uint256 public constant MAX_PER_TX = 1_000e6; // 1,000 USDC
    uint256 public constant DAILY_LIMIT = 5_000e6; // 5,000 USDC

    function setUp() public {
        usdc = new MockUSDC();
        vault = new PaymentVault(address(usdc), agent, MAX_PER_TX, DAILY_LIMIT);

        usdc.mint(address(vault), 100_000e6);

        vault.addRecipient(recipient);
    }

    // --- Successful payment ---

    function test_executePayment_succeeds_withinLimits() public {
        uint256 amount = 500e6;

        vm.expectEmit(true, false, false, true);
        emit PaymentVault.PaymentExecuted(recipient, amount, block.timestamp / 1 days);

        vm.prank(agent);
        vault.executePayment(recipient, amount);

        assertEq(usdc.balanceOf(recipient), amount);
        assertEq(vault.spentToday(), amount);
    }

    // --- maxPerTx ---

    function test_executePayment_reverts_whenExceedsMaxPerTx() public {
        vm.prank(agent);
        vm.expectRevert(PaymentVault.ExceedsMaxPerTx.selector);
        vault.executePayment(recipient, MAX_PER_TX + 1);
    }

    // --- dailyLimit ---

    function test_executePayment_reverts_whenExceedsDailyLimit() public {
        vm.startPrank(agent);
        // Spend up to the daily limit using multiple max-per-tx payments.
        for (uint256 i = 0; i < 5; i++) {
            vault.executePayment(recipient, MAX_PER_TX);
        }
        // spentToday == DAILY_LIMIT now; one more USDC should revert.
        vm.expectRevert(PaymentVault.ExceedsDailyLimit.selector);
        vault.executePayment(recipient, 1);
        vm.stopPrank();
    }

    // --- Day rollover ---

    function test_dailyCounter_resetsAfterDayPasses() public {
        vm.startPrank(agent);
        vault.executePayment(recipient, MAX_PER_TX);
        assertEq(vault.spentToday(), MAX_PER_TX);

        vm.warp(block.timestamp + 1 days);

        vault.executePayment(recipient, MAX_PER_TX);
        assertEq(vault.spentToday(), MAX_PER_TX);
        vm.stopPrank();
    }

    // --- Allowlist ---

    function test_executePayment_reverts_whenRecipientNotAllowlisted() public {
        address notAllowed = makeAddr("notAllowed");
        vm.prank(agent);
        vm.expectRevert(PaymentVault.RecipientNotAllowed.selector);
        vault.executePayment(notAllowed, 100e6);
    }

    // --- Paused ---

    function test_executePayment_reverts_whenPaused() public {
        vault.pause();
        vm.prank(agent);
        vm.expectRevert(PaymentVault.Paused.selector);
        vault.executePayment(recipient, 100e6);
    }

    // --- Access control: executePayment ---

    function test_executePayment_reverts_whenCallerNotAgent() public {
        vm.prank(stranger);
        vm.expectRevert(PaymentVault.NotAgent.selector);
        vault.executePayment(recipient, 100e6);
    }

    // --- Access control: agent cannot call owner functions ---

    function test_agent_cannotSetPolicy() public {
        vm.prank(agent);
        vm.expectRevert(PaymentVault.NotOwner.selector);
        vault.setPolicy(1, 1);
    }

    function test_agent_cannotAddRecipient() public {
        vm.prank(agent);
        vm.expectRevert(PaymentVault.NotOwner.selector);
        vault.addRecipient(stranger);
    }

    function test_agent_cannotWithdraw() public {
        vm.prank(agent);
        vm.expectRevert(PaymentVault.NotOwner.selector);
        vault.withdraw(1);
    }

    // --- Owner withdraw ---

    function test_owner_canWithdraw() public {
        uint256 amount = 1_000e6;
        uint256 ownerBalanceBefore = usdc.balanceOf(owner);

        vault.withdraw(amount);

        assertEq(usdc.balanceOf(owner), ownerBalanceBefore + amount);
    }
}
