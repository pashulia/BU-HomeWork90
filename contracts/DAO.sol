//SPDX-License-Identifier: UNLICENSED

pragma solidity 0.8.19;

interface IERC20 {
    function transfer(address to, uint256 amount) external returns(bool);
    function transferFrom(address from, address to, uint256 amount) external returns(bool);
    function totalSupply() external view returns(uint256);
}

contract DAO {
    // структура данных для информации о внесённых депозитах
    struct Deposit {
        uint256 allToken;
        uint256 frozenToken;
        uint256 unfrozenTime;
    }

    // структура данных для хранения инфы о голосованиях
    struct Proposal {
        uint256 pEndTime;
        uint256 pTokenYes;
        uint256 pTokenNo;
        address pCallAddress;
        bool pStatus;
        bytes pCalldata;
    }

    // переменные
    // инерфейс привязаный к токену управления
    IERC20 govToken;
    // время на одно голосования
    uint256 public time;
    address public owner;
    address public dao;

    // депозиты
    mapping(address => Deposit) public deposits;

    // голосования
    Proposal[] proposals;

    // проголосовал или нет
    // (id голосования => (адрес => да/нет))
    mapping(uint256 => mapping(address => bool)) public voters;

    event AddProposal(uint256 id);
    event FinishProposal(uint256 id, bool quorum, bool result, bool success);

    constructor(uint256 _time, address _govToken) {
        govToken = IERC20(_govToken);
        time = _time;
        owner = msg.sender;
        dao = address(this);
    }

    function addDeposit(uint256 _value) public {
        require(govToken.transferFrom(msg.sender, dao, _value), "DAO: problem with addDeposit!");
        deposits[msg.sender].allToken += _value;
    }

    function withdrawDeposit(uint256 _value) public {
        Deposit memory deposit = deposits[msg.sender];
        if(deposit.frozenToken > 0 && block.timestamp > deposit.unfrozenTime) {
            deposit.frozenToken = 0;
            deposits[msg.sender].frozenToken = 0;
        }
        require(deposit.allToken - deposit.frozenToken >= _value, "DAO: not enough token!");
        deposits[msg.sender].allToken -= _value;
        govToken.transfer(msg.sender, _value);
    }

    function addProposal(address _pCallAddress, bytes calldata _pCalldata) public {
        require(msg.sender == owner, "DAO: you are not owner!");
        proposals.push(
            Proposal(
                block.timestamp + time,
                0,
                0,
                _pCallAddress,
                false,
                _pCalldata
            )
        );
        emit AddProposal(proposals.length - 1);
    }

    function vote(uint256 _pId, bool _choice) public {
        require(_pId < proposals.length, "DAO: bad id!");
        Deposit memory deposit = deposits[msg.sender];
        Proposal memory proposal = proposals[_pId];
        require(deposit.allToken > 0, "DAO: you don't have deposit!");
        require(!voters[_pId][msg.sender], "DAO: you already voted!");
        require(block.timestamp < proposal.pEndTime, "DAO: time is up!");

        voters[_pId][msg.sender] = true;

        if (_choice) {
            proposals[_pId].pTokenYes += deposit.allToken;
        } else {
            proposals[_pId].pTokenNo += deposit.allToken;
        }
        if (deposit.allToken > deposit.frozenToken) {
            deposits[msg.sender].frozenToken = deposit.allToken;
        }
        if (proposal.pEndTime > deposit.unfrozenTime) {
            deposits[msg.sender].unfrozenTime = proposal.pEndTime;
        }
    }

    function finishProposal(uint256 _pId) public {
        Proposal memory proposal = proposals[_pId];
        require(!proposal.pStatus, "DAO: proposal already finished!");
        require(block.timestamp >= proposal.pEndTime, "DAO: early!" );

        proposals[_pId].pStatus = true;

        bool quorum = proposal.pTokenNo + proposal.pTokenYes > govToken.totalSupply() / 2;
        bool result = proposal.pTokenYes > proposal.pTokenNo;
        bool success;
        if (quorum && result) {
            (success, ) = proposal.pCallAddress.call(proposal.pCalldata);
        }
        emit FinishProposal(_pId, quorum, result, success);
    }

    function getDeposit() public view returns(Deposit memory) {
        return deposits[msg.sender];
    }

    function getProposal(uint256 _pId) public view returns(Proposal memory) {
        require(_pId < proposals.length, "DAO: bad id!");
        return proposals[_pId];
    }

    function getProposals() public view returns(Proposal[] memory) {
        return proposals;
    }
}