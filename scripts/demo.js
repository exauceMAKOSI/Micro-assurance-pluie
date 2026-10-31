const { ethers } = require("hardhat");

const TOKEN = "0x45b15060F63685BE949E9e718a19905E58F30c75";
const INSURANCE = "0x2d9bDc40af88033fcA7c9bECa4c5A2d69b071027";

const E18 = (n) => ethers.parseUnits(n.toString(), 18);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fmt = (v) => ethers.formatUnits(v, 18);

async function main() {
  const [moi] = await ethers.getSigners();
  const token = await ethers.getContractAt("TestStableToken", TOKEN);
  const insurance = await ethers.getContractAt("RainfallInsurance", INSURANCE);

  console.log("1. Récupération de jetons de test (faucet)...");
  await (await token.faucet()).wait();

  console.log("2. Autorisation et dépôt de 300 jetons dans le pool...");
  await (await token.approve(INSURANCE, E18(1000))).wait();
  await (await insurance.depositToPool(E18(300))).wait();

  console.log("3. Démarrage d'une saison de 90 secondes...");
  await (await insurance.startSeason(90)).wait();
  const seasonId = (await insurance.seasonCount()) - 1n;

  console.log("4. Souscription d'une police (prime : 10 jetons)...");
  await (await insurance.buyPolicy(seasonId)).wait();
  const policyId = (await insurance.policyCount()) - 1n;

  const avant = await token.balanceOf(moi.address);
  console.log("   Solde après souscription :", fmt(avant));

  console.log("5. Attente de la fin de la saison (120 s)...");
  await sleep(120000);

  console.log("6. L'oracle déclare 10 mm de pluie (sécheresse)...");
  await (await insurance.settleSeason(seasonId, 10)).wait();

  console.log("7. Indemnisation automatique...");
  await (await insurance.payPolicy(policyId)).wait();

  const apres = await token.balanceOf(moi.address);
  console.log("   Solde après indemnisation :", fmt(apres));
  console.log("   Gain net :", fmt(apres - avant), "jetons (attendu : 100)");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});