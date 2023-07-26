//SPDX-License-Identifier: UNLICENSED

pragma solidity 0.8.19;

contract Target {
    uint256 public value;
    address public owner;

    event SetValue(address adr, uint256 value);

    constructor(address _owner) {
        owner = _owner;
    }

    function setValue(uint256 _value) public {
        require(msg.sender == owner, "You are not owner!");
        value = _value;
        emit SetValue(msg.sender, value);
    }
}