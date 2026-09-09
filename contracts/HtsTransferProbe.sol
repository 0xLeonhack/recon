// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {HederaResponseCodes} from "@hiero-ledger/hiero-contracts/common/HederaResponseCodes.sol";
import {HederaTokenService} from "@hiero-ledger/hiero-contracts/token-service/HederaTokenService.sol";

contract HtsTransferProbe is HederaTokenService, Ownable {
    error HtsCallFailed(int64 responseCode);
    error InvalidAmount();
    error InvalidRecipient();
    error InvalidToken();

    event TokenAssociated(address indexed token, int64 responseCode);
    event TokenTransferred(address indexed token, address indexed recipient, int64 amount, int64 responseCode);

    constructor(address owner) Ownable(owner) {}

    function associate(address token) external onlyOwner returns (int64 responseCode) {
        if (token == address(0)) revert InvalidToken();

        responseCode = associateToken(address(this), token);
        if (responseCode != HederaResponseCodes.SUCCESS) revert HtsCallFailed(responseCode);

        emit TokenAssociated(token, responseCode);
    }

    function transfer(address token, address recipient, int64 amount)
        external
        onlyOwner
        returns (int64 responseCode)
    {
        if (token == address(0)) revert InvalidToken();
        if (recipient == address(0)) revert InvalidRecipient();
        if (amount <= 0) revert InvalidAmount();

        responseCode = transferToken(token, address(this), recipient, amount);
        if (responseCode != HederaResponseCodes.SUCCESS) revert HtsCallFailed(responseCode);

        emit TokenTransferred(token, recipient, amount, responseCode);
    }
}
