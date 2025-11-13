// anchor.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title DailyMerkleAnchor - store one Merkle root per day (YYYY-MM-DD)
contract Anchor {
    // date string (e.g., "2025-11-01") => root
    mapping(string => bytes32) public rootByDay;

    event RootAnchored(string indexed day, bytes32 root, address indexed sender);

    /// @notice write the merkle root for a given day; can be overwritten if you allow re-anchors
    /// Best practice: only allow first write; here we allow overwrite to keep demo simple.
    function anchorRoot(bytes32 root, string calldata day) external {
        rootByDay[day] = root;
        emit RootAnchored(day, root, msg.sender);
    }
}
