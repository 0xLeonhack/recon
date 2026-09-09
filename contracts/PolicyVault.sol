// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract PolicyVault is Ownable, ReentrancyGuard {
    enum Status {
        Active,
        Frozen,
        Closed
    }

    enum RejectReason {
        InvalidAmount,
        NotActive,
        Expired,
        RecipientNotAllowed,
        BudgetExceeded,
        InsufficientPrincipal,
        TransferFailed
    }

    struct Mandate {
        address asset;
        uint256 budgetCap;
        uint256 deadline;
    }

    struct Action {
        bytes32 evidenceId;
        address payable recipient;
        uint256 amount;
    }

    error InvalidMandate();
    error InvalidRecipient();
    error InvalidRoleConfiguration();
    error InvalidStatus(Status current);
    error UnauthorizedAgent(address caller);

    event ActionExecuted(bytes32 indexed evidenceId, address indexed recipient, uint256 amount);
    event ActionRejected(bytes32 indexed evidenceId, RejectReason reason);
    event Frozen(bytes32 indexed reasonHash);
    event PrincipalFunded(address indexed funder, uint256 amount);

    address public immutable agent;
    address public immutable agentOperator;
    address public immutable verifier;
    address payable public immutable slashBeneficiary;
    Mandate public mandate;
    Status public status;
    uint256 public principalBalance;
    uint256 public spent;

    mapping(address recipient => bool allowed) public isRecipientAllowed;

    modifier onlyAgent() {
        if (msg.sender != agent) revert UnauthorizedAgent(msg.sender);
        _;
    }

    constructor(
        address owner,
        address agentAddress,
        address agentOperatorAddress,
        address verifierAddress,
        address payable slashBeneficiaryAddress,
        uint256 budgetCap,
        uint256 deadline,
        address[] memory recipients
    ) Ownable(owner) {
        _validateRoles(owner, agentAddress, agentOperatorAddress, verifierAddress, slashBeneficiaryAddress);
        if (budgetCap == 0 || deadline <= block.timestamp) revert InvalidMandate();
        if (recipients.length == 0) revert InvalidRecipient();

        agent = agentAddress;
        agentOperator = agentOperatorAddress;
        verifier = verifierAddress;
        slashBeneficiary = slashBeneficiaryAddress;
        mandate = Mandate({asset: address(0), budgetCap: budgetCap, deadline: deadline});
        status = Status.Active;

        for (uint256 index = 0; index < recipients.length; index++) {
            address recipient = recipients[index];
            if (recipient == address(0)) revert InvalidRecipient();
            isRecipientAllowed[recipient] = true;
        }
    }

    function fund() external payable onlyOwner {
        if (status != Status.Active) revert InvalidStatus(status);
        if (msg.value == 0) revert InvalidMandate();

        principalBalance += msg.value;
        emit PrincipalFunded(msg.sender, msg.value);
    }

    function execute(Action calldata action) external onlyAgent nonReentrant returns (bool executed) {
        if (action.amount == 0) return _reject(action.evidenceId, RejectReason.InvalidAmount);
        if (status != Status.Active) return _reject(action.evidenceId, RejectReason.NotActive);
        if (block.timestamp > mandate.deadline) return _reject(action.evidenceId, RejectReason.Expired);
        if (!isRecipientAllowed[action.recipient]) {
            return _reject(action.evidenceId, RejectReason.RecipientNotAllowed);
        }
        if (action.amount > mandate.budgetCap - spent) {
            return _reject(action.evidenceId, RejectReason.BudgetExceeded);
        }
        if (action.amount > principalBalance) {
            return _reject(action.evidenceId, RejectReason.InsufficientPrincipal);
        }

        spent += action.amount;
        principalBalance -= action.amount;
        (bool success,) = action.recipient.call{value: action.amount}("");
        if (!success) {
            spent -= action.amount;
            principalBalance += action.amount;
            return _reject(action.evidenceId, RejectReason.TransferFailed);
        }

        emit ActionExecuted(action.evidenceId, action.recipient, action.amount);
        return true;
    }

    function kill(bytes32 reasonHash) external onlyOwner {
        if (status != Status.Active) revert InvalidStatus(status);
        status = Status.Frozen;
        emit Frozen(reasonHash);
    }

    function _reject(bytes32 evidenceId, RejectReason reason) private returns (bool) {
        emit ActionRejected(evidenceId, reason);
        return false;
    }

    function _validateRoles(
        address owner,
        address agentAddress,
        address agentOperatorAddress,
        address verifierAddress,
        address slashBeneficiaryAddress
    ) private pure {
        address[5] memory roles =
            [owner, agentAddress, agentOperatorAddress, verifierAddress, slashBeneficiaryAddress];

        for (uint256 left = 0; left < roles.length; left++) {
            if (roles[left] == address(0)) revert InvalidRoleConfiguration();
            for (uint256 right = left + 1; right < roles.length; right++) {
                if (roles[left] == roles[right]) revert InvalidRoleConfiguration();
            }
        }
    }
}
