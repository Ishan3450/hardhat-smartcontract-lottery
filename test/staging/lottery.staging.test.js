const { assert, expect } = require("chai")
const { getNamedAccounts, deployments, ethers, network } = require("hardhat")
const { developmentChains, networkConfig } = require("../../helper-hardhat-config")

developmentChains.includes(network.name)
    ? describe.skip
    : describe("lottery", function () {
          let lotteryInstance, lotteryEntranceFee, deployer

          beforeEach(async function () {
              deployer = (await getNamedAccounts()).deployer
              lotteryInstance = await ethers.getContract("lottery", deployer)
              lotteryEntranceFee = await lotteryInstance.getEntranceFee()
          })

          describe("fullfillRandomWords", function () {
              it("works with live Chainlink keepers and chainlink vrf, we get a random winner", async function () {
                  console.log("Setting up test...")
                  const startingTimeStamp = await lotteryInstance.getLatestTimeStamp()
                  const accounts = await ethers.getSigners()

                  console.log("setting up listener...")
                  await new Promise(async (resolve, reject) => {
                      lotteryInstance.once("WinnerPicked", async () => {
                          console.log("WinnerPicked event fired !!")

                          try {
                              const recentWinner = await lotteryInstance.getRecentWinner()
                              const lotteryState = await lotteryInstance.getLotteryState()
                              const winnerEndingBalance = await accounts[0].getBalance()
                              const endingTimeStamp = await lotteryInstance.getLatestTimeStamp()

                              await expect(lotteryInstance.getPlayerAt(0)).to.be.reverted
                              assert.equal(recentWinner.toString(), accounts[0].address)
                              assert.equal(lotteryState, 0)
                              assert.equal(
                                  winnerEndingBalance.toString(),
                                  winnerStartingBalance.add(lotteryEntranceFee).toString()
                              )
                              assert(endingTimeStamp > startingTimeStamp)
                              resolve()
                          } catch (error) {
                              console.log(error)
                              reject(error)
                          }
                      })

                      console.log("Entering lottery...")
                      const tx = await lotteryInstance.enterLottery({ value: lotteryEntranceFee })
                      await tx.wait(1)
                      console.log("Ok, time to wait...")
                      const winnerStartingBalance = await accounts[0].getBalance()
                  })
              })
          })
      })
