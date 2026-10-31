const { ethers } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Déploiement avec :", deployer.address);

  const Token = await ethers.getContractFactory("TestStableToken");
  const token = await Token.deploy();
  await token.waitForDeployment();
  const tokenAddress = await token.getAddress();
  console.log("TestStableToken  :", tokenAddress);

  const Insurance = await ethers.getContractFactory("RainfallInsurance");
  const insurance = await Insurance.deploy(
    tokenAddress,
    deployer.address, // administrateur
    deployer.address  // oracle provisoire
  );
  await insurance.waitForDeployment();
  console.log("RainfallInsurance:", await insurance.getAddress());
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});