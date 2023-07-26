import { expect } from 'chai';
import { ethers } from 'hardhat';

import {
  loadFixture,
  time,
} from '@nomicfoundation/hardhat-network-helpers';

describe("Testing DAO" , () => {
    async function deploy() {
        const name = "Govermance Token";
        const symbol = "GT";
        const decimals = 18;
        const oneToken = 1000000000000000000n; // 1_000_000_000_000_000_000
        const day = 60 * 60 * 24;
        const [owner, user1, user2,, user3, user4, hacker] = await ethers.getSigners();
        const ERC20 =  await ethers.getContractFactory("MERC20");
        const erc20 = await ERC20.deploy(name, symbol, decimals);
        await erc20.waitForDeployment();

        let tx = await erc20.mint(user1.getAddress(), oneToken * BigInt(10));
        await tx.wait();
        tx = await erc20.mint(user2.getAddress(), oneToken * BigInt(10));
        await tx.wait();
        tx = await erc20.mint(user3.getAddress(), oneToken * BigInt(10));
        await tx.wait();
        tx = await erc20.mint(user4.getAddress(), oneToken * BigInt(10));
        await tx.wait();
        tx = await erc20.mint(hacker.getAddress(), oneToken * BigInt(10));
        await tx.wait();

        const DAO = await ethers.getContractFactory("DAO");
        const dao = await DAO.deploy(day, erc20.getAddress());

        const Target = await ethers.getContractFactory("Target");
        const target = await Target.deploy(dao.getAddress());

        const iTarget =  new ethers.Interface(
            ["function setValue(uint256 _value)"]
        )

        return {erc20, dao, target, iTarget, oneToken, day, owner, user1, user2, user3, user4, hacker}
    }

    describe("Deploy", () => {
        it("check owner", async () => {
            const { dao, owner } = await loadFixture(deploy);

            expect(await dao.owner()).to.equal(owner.address);
        })
        it("check dao", async () => {
            const { dao } = await loadFixture(deploy);
            expect(await dao.dao()).to.equal(dao.target);
        })
        it("check time", async () => {
            const { dao, day } = await loadFixture(deploy);

            expect(await dao.time()).to.equal(day);
        })
    })

    describe("AddDeposit", () => {
        describe("requires", () => {
            
        })
        describe("Effects", () => {
            it("Check change gon token balances", async () => {
                const {erc20, dao, oneToken, day, owner, user1, user2, user3, user4, hacker} = await loadFixture(deploy);             
                const tx = await erc20.connect(user1).approve(dao.target, oneToken * BigInt(10));
                await tx.wait();

                expect(await dao.connect(user1).addDeposit(oneToken * BigInt(10)))
                .to.changeTokenBalances(erc20, 
                    [user1.getAddress(), dao.target],
                    [oneToken * BigInt(-10), oneToken * BigInt(10)]
                )
            })
        })
    })

    describe("AddProposal", () => {
        describe("Requires", () => {
            it("Check change gon token balances", async () => {
                const {erc20, dao, target, iTarget, oneToken, day, owner, user1, user2, user3, user4, hacker} = await loadFixture(deploy);  
                const num = 100; 
                const callData = iTarget.encodeFunctionData("setValue", [num]);          
                await expect(dao.connect(hacker).addProposal(target.getAddress(), callData))
                .to.revertedWith("DAO: you are not owner!");     
            })
        })
        describe("Effects", () => {
            it("Check change proposals count", async () => {
                const { dao, target, iTarget } = await loadFixture(deploy);  
                const num = 100; 
                const callData = iTarget.encodeFunctionData("setValue", [num]);   
                const proposals = await dao.getProposals();
                const proposalsCount = proposals.length;
                const tx = await dao.addProposal(target.getAddress(), callData);
                await tx.wait()

                expect((await dao.getProposals()).length).to.equal(proposalsCount + 1)
            })
            it("Check new proposal", async () => {
                const { dao, target, iTarget, day } = await loadFixture(deploy);  
                const num = 100; 
                const callData = iTarget.encodeFunctionData("setValue", [num]);   
                
                const tx = await dao.addProposal(target.getAddress(), callData);
                await tx.wait()
                
                const proposals = await dao.getProposals();
                const proposal = proposals[proposals.length - 1];

                const returnProposal = {
                    pEndTime: proposal.pEndTime,
                    pTokenYes: proposal.pTokenYes,
                    pTokenNo: proposal.pTokenNo,
                    pCallAddress: proposal.pCallAddress,
                    pStatus: proposal.pStatus,
                    pCallData: proposal[5]
                }
                
                const expectProposal = {
                    pEndTime: await time.latest() + day,
                    pTokenYes: 0,
                    pTokenNo: 0,
                    pCallAddress: target.target,
                    pStatus: false,
                    pCallData: callData
                }
                
                expect(returnProposal).to.deep.equal(expectProposal);
            })
        })
    })

    describe("Vote", () => {
        describe("Requires", () => {
            it("Check proposals id", async () => {
                const { dao, target, iTarget, hacker } = await loadFixture(deploy); 
                
                const num = 100; 
                const callData = iTarget.encodeFunctionData("setValue", [num]);   
                
                const tx = await dao.addProposal(target.getAddress(), callData);
                await tx.wait()

                const proposals = await dao.getProposals();
                const proposalsCount = proposals.length;
                const choice = true;

                await expect(dao.connect(hacker).vote(proposalsCount, choice))
                .to.rejectedWith("DAO: bad id!")
            })
            it("Check deposit", async () => {
                const { dao, target, iTarget, hacker } = await loadFixture(deploy); 
                
                const num = 100; 
                const callData = iTarget.encodeFunctionData("setValue", [num]);   
                
                const tx = await dao.addProposal(target.getAddress(), callData);
                await tx.wait()

                const proposals = await dao.getProposals();
                const proposalsId = proposals.length - 1;
                const choice = true;
                const deposit = await dao.deposits(hacker.getAddress())
                expect(deposit.allToken).to.equal(0)

                await expect(dao.connect(hacker).vote(proposalsId, choice))
                .to.rejectedWith("DAO: you don't have deposit!")
            })
            it("Check double vote", async () => {
                const {erc20, dao, target, iTarget, oneToken, hacker } = await loadFixture(deploy); 
                
                const num = 100; 
                const callData = iTarget.encodeFunctionData("setValue", [num]);   
                
                let tx = await dao.addProposal(target.getAddress(), callData);
                await tx.wait()

                const proposals = await dao.getProposals();
                const proposalsId = proposals.length - 1;
                const choice = true;

                tx = await erc20.connect(hacker).approve(dao.target, oneToken * BigInt(10));
                await tx.wait();
                tx = await dao.connect(hacker).addDeposit(oneToken * BigInt(10));
                await tx.wait();
                tx = await dao.connect(hacker).vote(proposalsId, choice);
                await tx.wait();

                expect(await dao.voters(proposalsId, hacker.address)).to.equal(true);

                await expect(dao.connect(hacker).vote(proposalsId, choice))
                .to.rejectedWith("DAO: you already voted!")
            })
            it("Check proposal finish (end time)", async () => {
                const {erc20, dao, target, iTarget, oneToken, day, hacker } = await loadFixture(deploy); 
                
                const num = 100; 
                const callData = iTarget.encodeFunctionData("setValue", [num]);   
                
                let tx = await dao.addProposal(target.getAddress(), callData);
                await tx.wait()

                const proposals = await dao.getProposals();
                const proposalsId = proposals.length - 1;
                const proposal = proposals[proposals.length - 1];
                const choice = true;

                tx = await erc20.connect(hacker).approve(dao.target, oneToken * BigInt(10));
                await tx.wait();
                tx = await dao.connect(hacker).addDeposit(oneToken * BigInt(10));
                await tx.wait();

                await time.increase(day);
                const timeStamp = await time.latest();

                expect(timeStamp).to.gt(proposal.pEndTime);

                await expect(dao.connect(hacker).vote(proposalsId, choice))
                .to.rejectedWith("DAO: time is up!")
            })
        })
        describe("Effects", () => {
            it("Check change tokeYes", async () => {
                const {erc20, dao, target, iTarget, oneToken, user1 } = await loadFixture(deploy); 
                
                const num = 100; 
                const callData = iTarget.encodeFunctionData("setValue", [num]);   
                
                let tx = await dao.addProposal(target.getAddress(), callData);
                await tx.wait()

                let proposals = await dao.getProposals();
                const proposalsId = proposals.length - 1;
                let proposal = proposals[proposals.length - 1];
                const choice = true;
                const pTokenYes = proposal.pTokenYes;

                tx = await erc20.connect(user1).approve(dao.target, oneToken * BigInt(10));
                await tx.wait();
                tx = await dao.connect(user1).addDeposit(oneToken * BigInt(10));
                await tx.wait();

                const deposit = await dao.deposits(user1.address);

                tx = await dao.connect(user1).vote(proposalsId, choice);
                await tx.wait();

                proposals = await dao.getProposals();
                proposal = proposals[proposals.length - 1];

                expect(proposal.pTokenYes).to.equal(pTokenYes + deposit.allToken);
            })
            it("Check change tokeNo", async () => {
                const {erc20, dao, target, iTarget, oneToken, user1 } = await loadFixture(deploy); 
                
                const num = 100; 
                const callData = iTarget.encodeFunctionData("setValue", [num]);   
                
                let tx = await dao.addProposal(target.getAddress(), callData);
                await tx.wait()

                let proposals = await dao.getProposals();
                const proposalsId = proposals.length - 1;
                let proposal = proposals[proposals.length - 1];
                const choice = false;
                const pTokenNo = proposal.pTokenNo;

                tx = await erc20.connect(user1).approve(dao.target, oneToken * BigInt(10));
                await tx.wait();
                tx = await dao.connect(user1).addDeposit(oneToken * BigInt(10));
                await tx.wait();

                const deposit = await dao.deposits(user1.address);

                tx = await dao.connect(user1).vote(proposalsId, choice);
                await tx.wait();

                proposals = await dao.getProposals();
                proposal = proposals[proposals.length - 1];

                expect(proposal.pTokenNo).to.equal(pTokenNo + deposit.allToken);
            })
            it("Check change frozenToken", async () => {
                const {erc20, dao, target, iTarget, oneToken, day, owner, user1, user2, user3, user4, hacker} = await loadFixture(deploy); 
                
                const num = 100; 
                const callData = iTarget.encodeFunctionData("setValue", [num]);   
                
                let tx = await dao.addProposal(target.getAddress(), callData);
                await tx.wait()

                const proposals = await dao.getProposals();
                const proposalsId = proposals.length - 1;
                const choice = true;

                tx = await erc20.connect(user1).approve(dao.target, oneToken * BigInt(10));
                await tx.wait();
                tx = await dao.connect(user1).addDeposit(oneToken * BigInt(10));
                await tx.wait();

                let deposit = await dao.deposits(user1.address);
                expect(deposit.allToken).to.gte(deposit.frozenToken);

                tx = await dao.connect(user1).vote(proposalsId, choice);
                await tx.wait();

                deposit = await dao.deposits(user1.address);

                expect(deposit.allToken).to.equal(deposit.frozenToken);
            })
        })
    })
    describe("FinishProposal", () => {
        describe("Requires", () => {
            it("Check proposal status", async () => {
                const {erc20, dao, target, iTarget, oneToken, day, owner, user1, user2, user3, user4, hacker} = await loadFixture(deploy); 

                const num = 100; 
                const callData = iTarget.encodeFunctionData("setValue", [num]);   
                
                let tx = await dao.addProposal(target.getAddress(), callData);
                await tx.wait()

                const proposals = await dao.getProposals();
                const proposalsId = proposals.length - 1;

                await time.increase(day);

                tx = await dao.finishProposal(proposalsId);
                await tx.wait()

                await expect(dao.connect(hacker).finishProposal(proposalsId))
                .to.revertedWith("DAO: proposal already finished!")
            })
            it("Check proposal timestamp", async () => {
                const { dao, target, iTarget, hacker } = await loadFixture(deploy); 

                const num = 100; 
                const callData = iTarget.encodeFunctionData("setValue", [num]);   
                
                let tx = await dao.addProposal(target.getAddress(), callData);
                await tx.wait()

                const proposals = await dao.getProposals();
                const proposalsId = proposals.length - 1;
                let proposal = proposals[proposals.length - 1];
                const timeStamp = await time.latest();

                expect(proposal.pEndTime).to.gte(timeStamp);

                await expect(dao.connect(hacker).finishProposal(proposalsId))
                .to.revertedWith("DAO: early!")
            })
        })
        describe("effects", () => {
            it("Check change proposal pStatus", async () => {
                const { dao, target, iTarget, day } = await loadFixture(deploy); 

                const num = 100; 
                const callData = iTarget.encodeFunctionData("setValue", [num]);   
                
                let tx = await dao.addProposal(target.getAddress(), callData);
                await tx.wait()

                let proposals = await dao.getProposals();
                const proposalsId = proposals.length - 1;
                let proposal = proposals[proposals.length - 1];

                await time.increase(day);

                expect(proposal.pStatus).to.equal(false);

                tx = await dao.finishProposal(proposalsId);
                await tx.wait()

                proposals = await dao.getProposals();
                proposal = proposals[proposals.length - 1];

                expect(proposal.pStatus).to.equal(true);
            })
        })
        describe("Interactions", () => {
            it("Check !quorum + !result + !success", async () => {
                const {erc20, dao, target, iTarget, oneToken, day, user1 } = await loadFixture(deploy); 
                
                const num = 100; 
                const callData = iTarget.encodeFunctionData("setValue", [num]);   
                
                let tx = await dao.addProposal(target.getAddress(), callData);
                await tx.wait()

                let proposals = await dao.getProposals();
                const proposalsId = proposals.length - 1;
                const choice = false;

                tx = await erc20.connect(user1).approve(dao.target, oneToken * BigInt(10));
                await tx.wait();
                tx = await dao.connect(user1).addDeposit(oneToken * BigInt(10));
                await tx.wait();
                tx = await dao.connect(user1).vote(proposalsId, choice);
                await tx.wait();

                await time.increase(day);

                proposals = await dao.getProposals();
                const proposal = proposals[proposalsId];

                const totalSupply = await erc20.totalSupply();

                expect(proposal.pTokenNo + proposal.pTokenYes).to.lt(totalSupply / BigInt(2));

                const value = await target.value();

                tx = await dao.finishProposal(proposalsId);
                await tx.wait()
            
                expect(await target.value()).to.equal(value);
            })
            it("Check !quorum + result + !success", async () => {
                const {erc20, dao, target, iTarget, oneToken, day, user1 } = await loadFixture(deploy); 

                const num = 100; 
                const callData = iTarget.encodeFunctionData("setValue", [num]);   
                
                let tx = await dao.addProposal(target.getAddress(), callData);
                await tx.wait()

                let proposals = await dao.getProposals();
                const proposalsId = proposals.length - 1;
                const choice = true;

                tx = await erc20.connect(user1).approve(dao.target, oneToken * BigInt(10));
                await tx.wait();
                tx = await dao.connect(user1).addDeposit(oneToken * BigInt(10));
                await tx.wait();
                tx = await dao.connect(user1).vote(proposalsId, choice);
                await tx.wait();

                await time.increase(day);

                proposals = await dao.getProposals();
                const proposal = proposals[proposalsId];

                const totalSupply = await erc20.totalSupply();

                expect(proposal.pTokenNo + proposal.pTokenYes).to.lt(totalSupply / BigInt(2));

                const value = await target.value();

                tx = await dao.finishProposal(proposalsId);
                await tx.wait()
            
                expect(await target.value()).to.equal(value);        
            })
            it("Check quorum + !result + !success", async () => {
                const {erc20, dao, target, iTarget, oneToken, day, user1, user2, user3 } = await loadFixture(deploy); 
                const num = 100; 
                const callData = iTarget.encodeFunctionData("setValue", [num]);   
                let tx = await dao.addProposal(target.getAddress(), callData);
                await tx.wait()
                let proposals = await dao.getProposals();
                let proposalsId = proposals.length - 1;  
                let choice = false;

                tx = await erc20.connect(user1).approve(dao.target, oneToken * BigInt(10));
                await tx.wait();
                tx = await dao.connect(user1).addDeposit(oneToken * BigInt(10));
                await tx.wait();
                tx = await dao.connect(user1).vote(proposalsId, choice);
                await tx.wait();              
                tx = await erc20.connect(user2).approve(dao.target, oneToken * BigInt(10));
                await tx.wait();
                tx = await dao.connect(user2).addDeposit(oneToken * BigInt(10));
                await tx.wait();
                tx = await dao.connect(user2).vote(proposalsId, choice);
                await tx.wait();

                choice = true;

                tx = await erc20.connect(user3).approve(dao.target, oneToken * BigInt(10));
                await tx.wait();
                tx = await dao.connect(user3).addDeposit(oneToken * BigInt(10));
                await tx.wait();
                tx = await dao.connect(user3).vote(proposalsId, choice);
                await tx.wait();
                await time.increase(day);
                proposals = await dao.getProposals();
                const proposal = proposals[proposalsId];
                const totalSupply = await erc20.totalSupply();
                expect(proposal.pTokenNo + proposal.pTokenYes).to.greaterThan(totalSupply / BigInt(2));
                expect(proposal.pTokenNo).to.gt(proposal.pTokenYes);

                const value = await target.value();

                tx = await dao.finishProposal(proposalsId);
                await tx.wait()
            
                expect(await target.value()).to.equal(value);
            })
            it("Check quorum + result + success", async () => {
                const { erc20, dao, target, iTarget, oneToken, day, user1, user2, user3 } = await loadFixture(deploy); 

                const num = 100; 
                const callData = iTarget.encodeFunctionData("setValue", [num]);   
                
                let tx = await dao.addProposal(target.target, callData);
                await tx.wait()

                let proposals = await dao.getProposals();
                let proposalsId = proposals.length - 1;  
                let choice = true;

                tx = await erc20.connect(user1).approve(dao.target, oneToken * BigInt(10));
                await tx.wait();
                tx = await dao.connect(user1).addDeposit(oneToken * BigInt(10));
                await tx.wait();
                tx = await dao.connect(user1).vote(proposalsId, choice);
                await tx.wait();
                
                tx = await erc20.connect(user2).approve(dao.target, oneToken * BigInt(10));
                await tx.wait();
                tx = await dao.connect(user2).addDeposit(oneToken * BigInt(10));
                await tx.wait();
                tx = await dao.connect(user2).vote(proposalsId, choice);
                await tx.wait();

                choice = false;

                tx = await erc20.connect(user3).approve(dao.target, oneToken * BigInt(10));
                await tx.wait();
                tx = await dao.connect(user3).addDeposit(oneToken * BigInt(10));
                await tx.wait();
                tx = await dao.connect(user3).vote(proposalsId, choice);
                await tx.wait();

                await time.increase(day);

                proposals = await dao.getProposals();
                const proposal = proposals[proposalsId];

                const totalSupply = await erc20.totalSupply();

                expect(proposal.pTokenNo + proposal.pTokenYes).to.gt(totalSupply / BigInt(2));
                expect(proposal.pTokenYes).to.gt(proposal.pTokenNo);

                tx = await dao.finishProposal(proposalsId);
                await tx.wait()
            
                expect(await target.value()).to.equal(num);
            })
            it("Check quorum + result + !success", async () => {
                const { erc20, dao, target, iTarget, oneToken, day, user1, user2, user3, hacker} = await loadFixture(deploy); 

                const num = 100; 
                const callData = iTarget.encodeFunctionData("setValue", [num]);   
                
                let tx = await dao.addProposal(hacker.address, callData);
                await tx.wait()

                let proposals = await dao.getProposals();
                let proposalsId = proposals.length - 1;  
                let choice = true;

                tx = await erc20.connect(user1).approve(dao.target, oneToken * BigInt(10));
                await tx.wait();
                tx = await dao.connect(user1).addDeposit(oneToken * BigInt(10));
                await tx.wait();
                tx = await dao.connect(user1).vote(proposalsId, choice);
                await tx.wait();
                
                tx = await erc20.connect(user2).approve(dao.target, oneToken * BigInt(10));
                await tx.wait();
                tx = await dao.connect(user2).addDeposit(oneToken * BigInt(10));
                await tx.wait();
                tx = await dao.connect(user2).vote(proposalsId, choice);
                await tx.wait();

                choice = false;

                tx = await erc20.connect(user3).approve(dao.target, oneToken * BigInt(10));
                await tx.wait();
                tx = await dao.connect(user3).addDeposit(oneToken * BigInt(10));
                await tx.wait();
                tx = await dao.connect(user3).vote(proposalsId, choice);
                await tx.wait();

                await time.increase(day);

                proposals = await dao.getProposals();
                const proposal = proposals[proposalsId];

                const totalSupply = await erc20.totalSupply();

                expect(proposal.pTokenNo + proposal.pTokenYes).to.gt(totalSupply / BigInt(2));
                expect(proposal.pTokenYes).to.gt(proposal.pTokenNo);

                const value = await target.value();

                tx = await dao.finishProposal(proposalsId);
                await tx.wait()
            
                expect(await target.value()).to.equal(value);

            
            })
        })
        describe("events", () => {
            it("Check FinishProposal !quorum + !result + !success", async () => {
                const { erc20, dao, target, iTarget, oneToken, day, user1 } = await loadFixture(deploy); 
                const num = 100; 
                const callData = iTarget.encodeFunctionData("setValue", [num]);   
                
                let tx = await dao.addProposal(target.getAddress(), callData);
                await tx.wait()

                let proposals = await dao.getProposals();
                const proposalsId = proposals.length - 1;
                const choice = false;

                tx = await erc20.connect(user1).approve(dao.target, oneToken * BigInt(10));
                await tx.wait();
                tx = await dao.connect(user1).addDeposit(oneToken * BigInt(10));
                await tx.wait();
                tx = await dao.connect(user1).vote(proposalsId, choice);
                await tx.wait();

                await time.increase(day);
            
                await expect(await dao.finishProposal(proposalsId))
                .to.emit(dao, "FinishProposal")
                .withArgs(proposalsId, false, false, false);
            })
            it("Check FinishProposal !quorum + result + !success", async () => {
                const { erc20, dao, target, iTarget, oneToken, day, user1 } = await loadFixture(deploy); 
                const num = 100; 
                const callData = iTarget.encodeFunctionData("setValue", [num]);   
                
                let tx = await dao.addProposal(target.getAddress(), callData);
                await tx.wait()

                let proposals = await dao.getProposals();
                const proposalsId = proposals.length - 1;
                const choice = true;

                tx = await erc20.connect(user1).approve(dao.target, oneToken * BigInt(10));
                await tx.wait();
                tx = await dao.connect(user1).addDeposit(oneToken * BigInt(10));
                await tx.wait();
                tx = await dao.connect(user1).vote(proposalsId, choice);
                await tx.wait();

                await time.increase(day);
            
                await expect(await dao.finishProposal(proposalsId))
                .to.emit(dao, "FinishProposal")
                .withArgs(proposalsId, false, true, false);
            })
            it("Check FinishProposal quorum + !result + !success", async () => {
                const { erc20, dao, target, iTarget, oneToken, day, user1, user2, user3 } = await loadFixture(deploy); 
                const num = 100; 
                const callData = iTarget.encodeFunctionData("setValue", [num]);   
                
                let tx = await dao.addProposal(target.getAddress(), callData);
                await tx.wait()

                let proposals = await dao.getProposals();
                const proposalsId = proposals.length - 1;
                let choice = false;
                
                tx = await erc20.connect(user1).approve(dao.target, oneToken * BigInt(10));
                await tx.wait();
                tx = await dao.connect(user1).addDeposit(oneToken * BigInt(10));
                await tx.wait();
                tx = await dao.connect(user1).vote(proposalsId, choice);
                await tx.wait();

                tx = await erc20.connect(user2).approve(dao.target, oneToken * BigInt(10));
                await tx.wait();
                tx = await dao.connect(user2).addDeposit(oneToken * BigInt(10));
                await tx.wait();
                tx = await dao.connect(user2).vote(proposalsId, choice);
                await tx.wait();

                choice = true;
                
                tx = await erc20.connect(user3).approve(dao.target, oneToken * BigInt(10));
                await tx.wait();
                tx = await dao.connect(user3).addDeposit(oneToken * BigInt(10));
                await tx.wait();
                tx = await dao.connect(user3).vote(proposalsId, choice);
                await tx.wait();

                await time.increase(day);
            
                await expect(await dao.finishProposal(proposalsId))
                .to.emit(dao, "FinishProposal")
                .withArgs(proposalsId, true, false, false);
            })
            it("Check FinishProposal quorum + result + success", async () => {
                const { erc20, dao, target, iTarget, oneToken, day, user1, user2, user3 } = await loadFixture(deploy); 
                const num = 100; 
                const callData = iTarget.encodeFunctionData("setValue", [num]);   
                
                let tx = await dao.addProposal(target.getAddress(), callData);
                await tx.wait()

                let proposals = await dao.getProposals();
                const proposalsId = proposals.length - 1;
                let choice = true;
                
                tx = await erc20.connect(user1).approve(dao.target, oneToken * BigInt(10));
                await tx.wait();
                tx = await dao.connect(user1).addDeposit(oneToken * BigInt(10));
                await tx.wait();
                tx = await dao.connect(user1).vote(proposalsId, choice);
                await tx.wait();

                tx = await erc20.connect(user2).approve(dao.target, oneToken * BigInt(10));
                await tx.wait();
                tx = await dao.connect(user2).addDeposit(oneToken * BigInt(10));
                await tx.wait();
                tx = await dao.connect(user2).vote(proposalsId, choice);
                await tx.wait();

                choice = false;
                
                tx = await erc20.connect(user3).approve(dao.target, oneToken * BigInt(10));
                await tx.wait();
                tx = await dao.connect(user3).addDeposit(oneToken * BigInt(10));
                await tx.wait();
                tx = await dao.connect(user3).vote(proposalsId, choice);
                await tx.wait();

                await time.increase(day);

                proposals = await dao.getProposals();
                const proposal = proposals[proposalsId];

                const totalSupply = await erc20.totalSupply();

                expect(proposal.pTokenNo + proposal.pTokenYes).to.gt(totalSupply / BigInt(2));
                expect(proposal.pTokenYes).to.gt(proposal.pTokenNo);
            
                await expect(dao.finishProposal(proposalsId))
                .to.emit(dao, "FinishProposal")
                .withArgs(proposalsId, true, true, true);
            })
            it("Check SetValue quorum + result + success", async () => {
                const { erc20, dao, target, iTarget, oneToken, day, user1, user2, user3 } = await loadFixture(deploy); 
                const num = 100; 
                const callData = iTarget.encodeFunctionData("setValue", [num]);   
                
                let tx = await dao.addProposal(target.getAddress(), callData);
                await tx.wait()

                let proposals = await dao.getProposals();
                const proposalsId = proposals.length - 1;
                let choice = true;
                
                tx = await erc20.connect(user1).approve(dao.target, oneToken * BigInt(10));
                await tx.wait();
                tx = await dao.connect(user1).addDeposit(oneToken * BigInt(10));
                await tx.wait();
                tx = await dao.connect(user1).vote(proposalsId, choice);
                await tx.wait();

                tx = await erc20.connect(user2).approve(dao.target, oneToken * BigInt(10));
                await tx.wait();
                tx = await dao.connect(user2).addDeposit(oneToken * BigInt(10));
                await tx.wait();
                tx = await dao.connect(user2).vote(proposalsId, choice);
                await tx.wait();

                choice = false;
                
                tx = await erc20.connect(user3).approve(dao.target, oneToken * BigInt(10));
                await tx.wait();
                tx = await dao.connect(user3).addDeposit(oneToken * BigInt(10));
                await tx.wait();
                tx = await dao.connect(user3).vote(proposalsId, choice);
                await tx.wait();

                await time.increase(day);

                proposals = await dao.getProposals();
                const proposal = proposals[proposalsId];

                const totalSupply = await erc20.totalSupply();

                expect(proposal.pTokenNo + proposal.pTokenYes).to.gt(totalSupply / BigInt(2));
                expect(proposal.pTokenYes).to.gt(proposal.pTokenNo);
            
                await expect(dao.finishProposal(proposalsId))
                .to.emit(target, "SetValue")
                .withArgs(dao.target, num);
            })
            it("Check FinishProposal quorum + result + !success", async () => {
                const { erc20, dao, iTarget, oneToken, day, user1, user2, user3 } = await loadFixture(deploy); 
                const num = 100; 
                const callData = iTarget.encodeFunctionData("setValue", [num]);   
                
                let tx = await dao.addProposal(erc20.target, callData);
                await tx.wait()

                let proposals = await dao.getProposals();
                const proposalsId = proposals.length - 1;
                let choice = true;
                
                tx = await erc20.connect(user1).approve(dao.target, oneToken * BigInt(10));
                await tx.wait();
                tx = await dao.connect(user1).addDeposit(oneToken * BigInt(10));
                await tx.wait();
                tx = await dao.connect(user1).vote(proposalsId, choice);
                await tx.wait();

                tx = await erc20.connect(user2).approve(dao.target, oneToken * BigInt(10));
                await tx.wait();
                tx = await dao.connect(user2).addDeposit(oneToken * BigInt(10));
                await tx.wait();
                tx = await dao.connect(user2).vote(proposalsId, choice);
                await tx.wait();

                choice = false;
                
                tx = await erc20.connect(user3).approve(dao.target, oneToken * BigInt(10));
                await tx.wait();
                tx = await dao.connect(user3).addDeposit(oneToken * BigInt(10));
                await tx.wait();
                tx = await dao.connect(user3).vote(proposalsId, choice);
                await tx.wait();

                await time.increase(day);

                proposals = await dao.getProposals();
                const proposal = proposals[proposalsId];

                const totalSupply = await erc20.totalSupply();

                expect(proposal.pTokenNo + proposal.pTokenYes).to.gt(totalSupply / BigInt(2));
                expect(proposal.pTokenYes).to.gt(proposal.pTokenNo);
            
                await expect(dao.finishProposal(proposalsId))
                .to.emit(dao, "FinishProposal")
                .withArgs(proposalsId, true, true, false);
            })
        })
        describe("withdrawDeposit", () => {
            describe("Requires", () => {
                it("Check enough token", async () => {
                    const {erc20, dao, target, iTarget, oneToken, day, owner, user1, user2, user3, user4, hacker} = await loadFixture(deploy); 

                    // let tx = await erc20.connect(user1).approve(dao.target, oneToken * BigInt(10));
                    // await tx.wait();
                    // tx = await dao.connect(user1).addDeposit(oneToken * BigInt(10));
                    // await tx.wait();
                    // tx = await dao.connect(user1).vote(proposalsId, choice);
                    // await tx.wait();
                })
            })
        })
    })
})