// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
contract Anchor {
  mapping(string=>bytes32) public rootByDay;
  event RootAnchored(string indexed day, bytes32 root, address indexed sender);
  function anchorRoot(bytes32 root, string calldata day) external { rootByDay[day]=root; emit RootAnchored(day, root, msg.sender); }
}