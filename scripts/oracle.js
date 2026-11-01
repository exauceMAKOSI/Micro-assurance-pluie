const { ethers } = require("hardhat");

const INSURANCE = "0x2d9bDc40af88033fcA7c9bECa4c5A2d69b071027";

// Zone assurée : Kinshasa
const LAT = -4.325;
const LON = 15.322;
// Fenêtre de pluie observée (jours) pour une saison
const WINDOW_DAYS = 30;
// Fréquence de vérification
const CHECK_EVERY_MS = 30000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (msg) => console.log(`[${new Date().toLocaleTimeString("fr-FR")}] ${msg}`);

// Pluie cumulée (mm) via l'API Open-Meteo
async function fetchRainfallMm() {
  if (process.env.RAIN_OVERRIDE) {
    log(`Mode simulation : pluie forcée à ${process.env.RAIN_OVERRIDE} mm`);
    return Number(process.env.RAIN_OVERRIDE);
  }
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}` +
    `&daily=precipitation_sum&past_days=${WINDOW_DAYS}&forecast_days=1` +
    `&timezone=Africa%2FKinshasa`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Open-Meteo : erreur HTTP ${res.status}`);
  const data = await res.json();
  const values = data.daily.precipitation_sum.map((v) => v ?? 0);
  const total = values.reduce((a, b) => a + b, 0);
  log(`Open-Meteo : ${total.toFixed(1)} mm sur ${values.length} jours`);
  return Math.round(total);
}

async function cycle(insurance) {
  const latestBlock = await ethers.provider.getBlock("latest");
  const now = Number(latestBlock.timestamp);
  const policyCount = Number(await insurance.policyCount());

  // Polices en attente
  const pending = [];
  for (let i = 0; i < policyCount; i++) {
    const p = await insurance.policies(i);
    if (!p.resolved) pending.push({ id: i, seasonId: Number(p.seasonId) });
  }
  if (pending.length === 0) {
    log("Aucune police en attente.");
    return;
  }

  // 1. Règlement des saisons terminées
  const seasonIds = [...new Set(pending.map((p) => p.seasonId))];
  for (const id of seasonIds) {
    const s = await insurance.seasons(id);
    if (!s.settled && now >= Number(s.end)) {
      const mm = await fetchRainfallMm();
      log(`Saison ${id} terminée : déclaration de ${mm} mm...`);
      await (await insurance.settleSeason(id, mm)).wait();
      log(`Saison ${id} réglée ✅`);
    }
  }

  // 2. Indemnisation automatique
  for (const p of pending) {
    const s = await insurance.seasons(p.seasonId);
    if (s.settled) {
      log(`Traitement de la police ${p.id}...`);
      await (await insurance.payPolicy(p.id)).wait();
      const mm = s.rainfallMm;
      const paid = await insurance.isTriggered(mm);
      log(`Police ${p.id} traitée ✅ (${mm} mm : ${paid ? "indemnisée" : "sans indemnisation"})`);
    } else {
      log(`Police ${p.id} : saison ${p.seasonId} pas encore terminée.`);
    }
  }
}

async function main() {
  const [oracle] = await ethers.getSigners();
  const insurance = await ethers.getContractAt("RainfallInsurance", INSURANCE, oracle);
  log(`Oracle démarré avec le compte ${oracle.address}`);
  log(`Vérification toutes les ${CHECK_EVERY_MS / 1000} s. Arrêt avec Ctrl + C.`);

  while (true) {
    try {
      await cycle(insurance);
    } catch (e) {
      log(`Erreur : ${e.shortMessage || e.message}`);
    }
    await sleep(CHECK_EVERY_MS);
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});