// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title Jeton stable de test (aucune valeur réelle)
contract TestStableToken is ERC20 {
    uint256 public constant FAUCET_AMOUNT = 1000 * 10 ** 18;

    constructor() ERC20("Test USD", "tUSD") {
        _mint(msg.sender, 1_000_000 * 10 ** 18);
    }

    /// @notice Permet à n'importe qui de recevoir des jetons de test
    function faucet() external {
        _mint(msg.sender, FAUCET_AMOUNT);
    }
}