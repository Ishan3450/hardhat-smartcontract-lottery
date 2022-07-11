const { ethers } = require("hardhat")

async function enterRaffle() {
    const lotteryInstance = await ethers.getContract("lottery")
    const entranceFee = await lotteryInstance.getEntranceFee()
    await lotteryInstance.enterRaffle({ value: entranceFee + 1 })
    console.log("Entered!")
}

enterRaffle()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error)
        process.exit(1)
    })