const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-toolbox/network-helpers");

const E18 = (n) => ethers.parseUnits(n.toString(), 18);
const rows = [];

async function measure(label, txPromise) {
  const receipt = await (await txPromise).wait();
  rows.push([label, receipt.gasUsed]);
}

async function main() {
  const [admin, farmer] = await ethers.getSigners();

  const token = await (await ethers.getContractFactory("TestStableToken")).deploy();
  rows.push(["Déploiement TestStableToken", (await token.deploymentTransaction().wait()).gasUsed]);

  const insurance = await (
    await ethers.getContractFactory("RainfallInsurance")
  ).deploy(await token.getAddress(), admin.address, admin.address);
  rows.push(["Déploiement RainfallInsurance", (await insurance.deploymentTransaction().wait()).gasUsed]);

  const addr = await insurance.getAddress();

  await measure("faucet()", token.connect(farmer).faucet());
  await measure("approve()", token.connect(farmer).approve(addr, E18(1000)));
  await token.approve(addr, E18(1000));
  await measure("depositToPool()", insurance.depositToPool(E18(300)));
  await measure("startSeason()", insurance.startSeason(90));
  await measure("buyPolicy()", insurance.connect(farmer).buyPolicy(0));
  await time.increase(100);
  await measure("settleSeason()", insurance.settleSeason(0, 10));
  await measure("payPolicy() avec indemnisation", insurance.payPolicy(0));
  await measure("withdrawFromPool()", insurance.withdrawFromPool(E18(100)));

  console.log("\nFonction".padEnd(34) + "Gas".padStart(10) + "   Coût à 10 gwei (ETH)");
  for (const [label, gas] of rows) {
    const cost = ethers.formatEther(gas * 10n * 10n ** 9n);
    console.log(label.padEnd(33) + gas.toString().padStart(10) + "   " + cost);
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});