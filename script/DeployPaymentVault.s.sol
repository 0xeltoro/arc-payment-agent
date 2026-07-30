// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console} from "forge-std/Script.sol";
import {PaymentVault} from "../src/PaymentVault.sol";

/// @notice Deploys PaymentVault using policy limits set below. Reads the
///         deployer key and constructor addresses from env.
contract DeployPaymentVault is Script {
    uint256 public constant MAX_PER_TX = 1_000e6; // 1,000 USDC, 6 decimals
    uint256 public constant DAILY_LIMIT = 5_000e6; // 5,000 USDC, 6 decimals

    function run() external returns (PaymentVault vault) {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address usdc = vm.envAddress("USDC_ADDRESS");
        address agent = vm.envAddress("AGENT_ADDRESS");

        vm.startBroadcast(deployerKey);
        vault = new PaymentVault(usdc, agent, MAX_PER_TX, DAILY_LIMIT);
        vm.stopBroadcast();

        console.log("PaymentVault deployed at:", address(vault));
    }
}
