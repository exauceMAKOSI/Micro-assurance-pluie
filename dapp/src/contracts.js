import { parseAbi } from "viem";

export const TOKEN_ADDRESS = "0x45b15060F63685BE949E9e718a19905E58F30c75";
export const INSURANCE_ADDRESS = "0x2d9bDc40af88033fcA7c9bECa4c5A2d69b071027";

export const tokenAbi = parseAbi([
  "function faucet()",
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address,address) view returns (uint256)",
  "function approve(address,uint256) returns (bool)",
]);

export const insuranceAbi = parseAbi([
  "function buyPolicy(uint256 seasonId) returns (uint256)",
  "function depositToPool(uint256 amount)",
  "function startSeason(uint64 durationSeconds) returns (uint256)",
  "function settleSeason(uint256 seasonId, uint256 rainfallMm)",
  "function payPolicy(uint256 policyId)",
  "function seasonCount() view returns (uint256)",
  "function policyCount() view returns (uint256)",
  "function seasons(uint256) view returns (uint64 start, uint64 end, uint256 rainfallMm, bool settled)",
  "function policies(uint256) view returns (address farmer, uint256 seasonId, bool resolved)",
  "function reservedPayouts() view returns (uint256)",
]);