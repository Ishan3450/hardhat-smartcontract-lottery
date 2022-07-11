const { assert, expect } = require("chai")
const { getNamedAccounts, deployments, ethers, network } = require("hardhat")
const { developmentChains, networkConfig } = require("../../helper-hardhat-config")

!developmentChains.includes(network.name)
    ? describe.skip
    : describe("lottery", function () {
          let lotteryInstance, vrfCoordinatorV2Mock, lotteryEntranceFee, deployer, interval
          let chainId = network.config.chainId

          beforeEach(async function () {
              deployer = (await getNamedAccounts()).deployer
              await deployments.fixture("all")
              lotteryInstance = await ethers.getContract("lottery", deployer)
              vrfCoordinatorV2Mock = await ethers.getContract("VRFCoordinatorV2Mock", deployer)
              lotteryEntranceFee = await lotteryInstance.getEntranceFee()
              interval = await lotteryInstance.getInterval()
          })

          describe("Constructor", function () {
              it("should initialize contructor properly", async function () {
                  const lotteryState = lotteryInstance.getLotteryState()
                  //   const interval = lotteryInstance.getInterval()

                  assert(lotteryState.toString(), "0")
                  assert(interval.toString(), networkConfig[chainId]["interval"])
              })
          })

          describe("enterLottery", function () {
              it("reverts when you don't pay enough entree fees", async function () {
                  await expect(
                      lotteryInstance.enterLottery(/* Without Value to check the error*/)
                  ).to.be.revertedWith("lottery__NotEnoughETHEntered")
              })

              it("records players when they enter", async function () {
                  await lotteryInstance.enterLottery({ value: lotteryEntranceFee })
                  const enteredPlayer = await lotteryInstance.getPlayerAt(0)

                  assert.equal(enteredPlayer, deployer)
              })

              it("must emit the event containing the address of the entered player", async function () {
                  await expect(lotteryInstance.enterLottery({ value: lotteryEntranceFee })).to.emit(
                      // name of the contract instance
                      lotteryInstance,
                      // name of the even which is in our case is : LotteryEnter
                      "LotteryEnter"
                  )
              })

              it("doesn't allow player to enter the lottery whenever the lottery is calculating", async function () {
                  await lotteryInstance.enterLottery({ value: lotteryEntranceFee })
                  // we are requesting the evm_increaseTime method to increase the time of our blockchain by the interval time + 1 of our lottery contract
                  await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                  // after increasing the time of our blockchain now we are mining a block
                  await network.provider.send("evm_mine", [])

                  await lotteryInstance.performUpkeep([])
                  await expect(
                      lotteryInstance.enterLottery({ value: lotteryEntranceFee })
                  ).to.be.revertedWith("lottery_NotOpen")
              })
          })

          describe("checkUpkeep", function () {
              it("returns false if players haven't sent any ETH", async function () {
                  await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                  await network.provider.send("evm_mine", [])
                  // callStatic is used to call the non view function to get the return variables
                  const { upkeepNeeded } = await lotteryInstance.callStatic.checkUpkeep([])
                  // if upkeepNeeded == true then false
                  // if upkeepNeeded == false then true
                  assert(!upkeepNeeded)
              })

              it("returns false if lottery isn't open", async function () {
                  await lotteryInstance.enterLottery({ value: lotteryEntranceFee })
                  await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                  await network.provider.send("evm_mine", [])
                  await lotteryInstance.performUpkeep([])

                  const lotteryState = await lotteryInstance.getLotteryState()
                  const { upkeepNeeded } = await lotteryInstance.callStatic.checkUpkeep([])

                  assert.equal(lotteryState.toString(), "1") // 1 for calculating
                  assert.equal(upkeepNeeded, false)
              })

              it("returns false if enough time hasn't passed", async function () {
                  await lotteryInstance.enterLottery({ value: lotteryEntranceFee })
                  await network.provider.send("evm_increaseTime", [interval.toNumber() - 1]) // we are not passing enough interval time so it will return false
                  await network.provider.send("evm_mine", [])
                  const { upkeepNeeded } = await lotteryInstance.callStatic.checkUpkeep([]) // will return false as not enough interval time is passed
                  assert(!upkeepNeeded) // expecting false
              })

              it("returns true if enought time passed, has players, has eths and is open", async function () {
                  // has players : true
                  // has eths : true
                  await lotteryInstance.enterLottery({ value: lotteryEntranceFee })
                  // enough time passed : true
                  await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                  await network.provider.send("evm_mine", [])

                  const { upkeepNeeded } = await lotteryInstance.callStatic.checkUpkeep([])

                  assert(upkeepNeeded)
              })
          })

          describe("performUpkeep", function () {
              it("it can only run if checkUpkeep is true", async function () {
                  await lotteryInstance.enterLottery({ value: lotteryEntranceFee })
                  await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                  await network.provider.send("evm_mine", [])
                  // by writing above code now upkeepNeeded has to be true
                  const transaction = await lotteryInstance.performUpkeep([])
                  // so if transaction happens we can say that upkeepNeed is true otherwise performUpkeep cannot be completed
                  assert(transaction)
              })

              it("must revert if upkeepNeeded is false", async function () {
                  await expect(lotteryInstance.performUpkeep([])).to.be.revertedWith(
                      "lottery_UpkeepNotNeeded"
                  )
              })

              it("updates the raffle state, emits the event, and calls the vrf coordinator", async function () {
                  await lotteryInstance.enterLottery({ value: lotteryEntranceFee })
                  await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                  await network.provider.send("evm_mine", [])

                  const transactionResponse = await lotteryInstance.performUpkeep([])
                  const transactionReceipt = await transactionResponse.wait(1)

                  const requestId = transactionReceipt.events[1].args.requestId
                  const lotteryState = await lotteryInstance.getLotteryState()

                  assert(requestId.toNumber() > 0)
                  assert(lotteryState.toString() == "1")
              })
          })

          describe("fullfillRandomWords", function () {
              beforeEach(async function () {
                  await lotteryInstance.enterLottery({ value: lotteryEntranceFee })
                  await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                  await network.provider.send("evm_mine", [])
              })

              it("can only be called after performUpkeep", async function () {
                  await expect(
                      vrfCoordinatorV2Mock.fulfillRandomWords(0, lotteryInstance.address)
                  ).to.be.revertedWith("nonexistent request")

                  await expect(
                      vrfCoordinatorV2Mock.fulfillRandomWords(1, lotteryInstance.address)
                  ).to.be.revertedWith("nonexistent request")
              })

              it("picks the winner, resets the lottery and send the money to the winner", async function () {
                  const additionalEntrants = 3
                  const startingAccountIndex = 1 // 0 is for deployer
                  const accounts = await ethers.getSigners()

                  for (
                      let i = startingAccountIndex;
                      i < startingAccountIndex + additionalEntrants;
                      i++
                  ) {
                      const lotteryConnectedAccount = await lotteryInstance.connect(accounts[i])
                      await lotteryConnectedAccount.enterLottery({ value: lotteryEntranceFee })
                  }
                  const startingTimeStamp = await lotteryInstance.getLatestTimeStamp()

                  await new Promise(async (resolve, reject) => {
                      // WinnerPicked is the name of the event
                      lotteryInstance.once("WinnerPicked", async () => {
                          console.log("WinnerPicked event triggered !!")
                          try {
                              const recentWinner = await lotteryInstance.getRecentWinner()

                              console.log(recentWinner)
                              console.log("Participants : ")
                              console.log(accounts[0].address)
                              console.log(accounts[1].address)
                              console.log(accounts[2].address)
                              const totalPlayers = await lotteryInstance.getNumberOfPlayers()
                              const lotteryState = await lotteryInstance.getLotteryState()
                              const endingTimeStamp = await lotteryInstance.getLatestTimeStamp()
                              const winnerEndingBalance = await accounts[1].getBalance()

                              assert.equal(totalPlayers.toString(), "0")
                              assert.equal(lotteryState.toString(), "0")
                              assert(endingTimeStamp > startingTimeStamp)

                              // assuring that the winner get the right amount
                              assert.equal(
                                  winnerEndingBalance.toString(),
                                  winnerStartingBalance.add(
                                      lotteryEntranceFee
                                          .mul(additionalEntrants)
                                          .add(lotteryEntranceFee)
                                          .toString()
                                  )
                              )
                          } catch (e) {
                              reject(e)
                          }
                          resolve()
                      })

                      const tx = await lotteryInstance.performUpkeep([])
                      const txReceipt = await tx.wait(1)
                      const winnerStartingBalance = await accounts[1].getBalance()
                      await vrfCoordinatorV2Mock.fulfillRandomWords(
                          txReceipt.events[1].args.requestId,
                          lotteryInstance.address
                      )
                  })
              })
          })
      })
