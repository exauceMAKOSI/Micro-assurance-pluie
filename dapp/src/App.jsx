import { useEffect, useRef, useState } from "react";
import {
  useAccount,
  useConnect,
  useDisconnect,
  useSwitchChain,
  useReadContracts,
  useWriteContract,
  usePublicClient,
  useBlock,
} from "wagmi";
import { useQueryClient } from "@tanstack/react-query";
import { sepolia } from "wagmi/chains";
import { formatUnits, parseUnits } from "viem";
import {
  TOKEN_ADDRESS,
  INSURANCE_ADDRESS,
  tokenAbi,
  insuranceAbi,
} from "./contracts";

const PREMIUM = parseUnits("10", 18);

const card = {
  background: "white",
  borderRadius: 12,
  padding: 20,
  marginBottom: 16,
  boxShadow: "0 1px 4px rgba(0,0,0,0.1)",
};
const btn = {
  background: "#2e7d32",
  color: "white",
  border: "none",
  borderRadius: 8,
  padding: "10px 16px",
  cursor: "pointer",
  fontSize: 15,
  margin: "4px 8px 4px 0",
};
const fmt = (v) =>
  v === undefined ? "..." : Number(formatUnits(v, 18)).toLocaleString("fr-FR");

const read = (address, abi, functionName, args) => ({
  address,
  abi,
  functionName,
  args,
  chainId: sepolia.id,
});

export default function App() {
  const { address, isConnected, chainId } = useAccount();
  const { connect, connectors } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain } = useSwitchChain();
  const queryClient = useQueryClient();
  const publicClient = usePublicClient({ chainId: sepolia.id });
  const { writeContractAsync } = useWriteContract();

  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Math.floor(Date.now() / 1000));
  const [rain, setRain] = useState("10");

  const { data: block } = useBlock({
    chainId: sepolia.id,
    query: { refetchInterval: 5000 },
  });
  const offsetRef = useRef(0);
  useEffect(() => {
    if (block) {
      offsetRef.current = Number(block.timestamp) - Math.floor(Date.now() / 1000);
    }
  }, [block]);
  useEffect(() => {
    const t = setInterval(
      () => setNow(Math.floor(Date.now() / 1000) + offsetRef.current),
      1000
    );
    return () => clearInterval(t);
  }, []);

  const wrongNetwork = isConnected && chainId !== sepolia.id;
  const ready = isConnected && !wrongNetwork;

  // ---------- Lectures ----------
  const { data: base } = useReadContracts({
    contracts: [
      read(TOKEN_ADDRESS, tokenAbi, "balanceOf", [address]),
      read(TOKEN_ADDRESS, tokenAbi, "allowance", [address, INSURANCE_ADDRESS]),
      read(TOKEN_ADDRESS, tokenAbi, "balanceOf", [INSURANCE_ADDRESS]),
      read(INSURANCE_ADDRESS, insuranceAbi, "reservedPayouts"),
      read(INSURANCE_ADDRESS, insuranceAbi, "seasonCount"),
      read(INSURANCE_ADDRESS, insuranceAbi, "policyCount"),
    ],
    query: { enabled: ready, refetchInterval: 10000 },
  });
  const balance = base?.[0]?.result;
  const allowance = base?.[1]?.result;
  const poolBalance = base?.[2]?.result;
  const reserved = base?.[3]?.result;
  const sCount = Number(base?.[4]?.result ?? 0n);
  const pCount = Number(base?.[5]?.result ?? 0n);

  const seasonIds = Array.from({ length: Math.min(sCount, 20) }, (_, i) =>
    BigInt(sCount - 1 - i)
  );
  const { data: seasonsData } = useReadContracts({
    contracts: seasonIds.map((id) =>
      read(INSURANCE_ADDRESS, insuranceAbi, "seasons", [id])
    ),
    query: { enabled: ready && seasonIds.length > 0, refetchInterval: 10000 },
  });
  const seasonsMap = {};
  seasonIds.forEach((id, i) => {
    const r = seasonsData?.[i]?.result;
    if (r) seasonsMap[id.toString()] = { end: r[1], rain: r[2], settled: r[3] };
  });
  const latestId = sCount > 0 ? BigInt(sCount - 1) : undefined;
  const latest = latestId !== undefined ? seasonsMap[latestId.toString()] : undefined;
  const seasonOpen = latest && !latest.settled && now < Number(latest.end);

  const policyIds = Array.from({ length: Math.min(pCount, 30) }, (_, i) =>
    BigInt(pCount - 1 - i)
  );
  const { data: policiesData } = useReadContracts({
    contracts: policyIds.map((id) =>
      read(INSURANCE_ADDRESS, insuranceAbi, "policies", [id])
    ),
    query: { enabled: ready && policyIds.length > 0, refetchInterval: 10000 },
  });
  const myPolicies = [];
  policyIds.forEach((id, i) => {
    const r = policiesData?.[i]?.result;
    if (r && address && r[0].toLowerCase() === address.toLowerCase()) {
      myPolicies.push({ id, seasonId: r[1], resolved: r[2] });
    }
  });

  // ---------- Transactions ----------
  async function tx(label, params) {
    setBusy(true);
    try {
      setStatus(`${label} : confirmez dans MetaMask...`);
      const hash = await writeContractAsync({ ...params, chainId: sepolia.id });
      setStatus(`${label} : en cours...`);
      await publicClient.waitForTransactionReceipt({ hash });
      setStatus(`${label} : terminé ✅`);
      queryClient.invalidateQueries();
      return true;
    } catch (e) {
      setStatus(`${label} : échec — ${e.shortMessage || e.message}`);
      return false;
    } finally {
      setBusy(false);
    }
  }

  const insurance = (functionName, args, label) =>
    tx(label, { address: INSURANCE_ADDRESS, abi: insuranceAbi, functionName, args });

  async function ensureAllowance(amount) {
    if ((allowance ?? 0n) >= amount) return true;
    return tx("Autorisation du jeton", {
      address: TOKEN_ADDRESS,
      abi: tokenAbi,
      functionName: "approve",
      args: [INSURANCE_ADDRESS, parseUnits("1000000", 18)],
    });
  }

  async function buy() {
    if (await ensureAllowance(PREMIUM)) {
      await insurance("buyPolicy", [latestId], "Souscription");
    }
  }

  async function deposit() {
    const amount = parseUnits("100", 18);
    if (await ensureAllowance(amount)) {
      await insurance("depositToPool", [amount], "Dépôt dans le pool");
    }
  }

  function policyInfo(p) {
    const s = seasonsMap[p.seasonId.toString()];
    if (!s) return { text: "...", canPay: false };
    const triggered = s.rain < 20n || s.rain > 200n;
    if (p.resolved) {
      return {
        text: triggered
          ? `Indemnisée (${s.rain} mm de pluie)`
          : `Clôturée sans indemnisation (${s.rain} mm)`,
        canPay: false,
      };
    }
    if (s.settled) {
      return {
        text: triggered
          ? `Indemnisation due (${s.rain} mm)`
          : `Pluie normale (${s.rain} mm)`,
        canPay: true,
      };
    }
    if (now < Number(s.end)) {
      return { text: `En cours (${Number(s.end) - now} s restantes)`, canPay: false };
    }
    return { text: "Saison terminée, en attente de l'oracle", canPay: false };
  }

  return (
    <div style={{ maxWidth: 680, margin: "0 auto", padding: 20 }}>
      <h1>🌧️ Micro-assurance pluie</h1>
      <p>
        Assurance agricole paramétrique, zone Kinshasa. Ethereum Sepolia, jetons
        de test sans valeur.
      </p>

      {/* Connexion */}
      <div style={card}>
        {!isConnected ? (
          <button style={btn} onClick={() => connect({ connector: connectors[0] })}>
            Connecter MetaMask
          </button>
        ) : (
          <>
            <p>
              Portefeuille : <b>{address.slice(0, 6)}...{address.slice(-4)}</b>
            </p>
            {wrongNetwork ? (
              <button style={btn} onClick={() => switchChain({ chainId: sepolia.id })}>
                Passer sur Sepolia
              </button>
            ) : (
              <p>
                Solde : <b>{fmt(balance)} tUSD</b>
              </p>
            )}
            <button style={{ ...btn, background: "#777" }} onClick={() => disconnect()}>
              Déconnecter
            </button>
          </>
        )}
      </div>

      {ready && (
        <>
          {/* Statut des transactions */}
          {status && (
            <div style={{ ...card, background: "#fffde7" }}>{status}</div>
          )}

          {/* Souscription */}
          <div style={card}>
            <h3>1. Souscrire une police</h3>
            {latest ? (
              <p>
                Saison n°{String(latestId)} :{" "}
                {seasonOpen
                  ? `ouverte (${Number(latest.end) - now} s restantes)`
                  : latest.settled
                  ? "réglée"
                  : "terminée, en attente de l'oracle"}
              </p>
            ) : (
              <p>Aucune saison pour le moment.</p>
            )}
            <p>
              Prime : <b>10 tUSD</b> · Indemnisation : <b>100 tUSD</b> si pluie
              &lt; 20 mm (sécheresse) ou &gt; 200 mm (inondation).
            </p>
            <button style={btn} disabled={busy || !seasonOpen} onClick={buy}>
              Souscrire (10 tUSD)
            </button>
            <button
              style={{ ...btn, background: "#1565c0" }}
              disabled={busy}
              onClick={() =>
                tx("Jetons de test", {
                  address: TOKEN_ADDRESS,
                  abi: tokenAbi,
                  functionName: "faucet",
                })
              }
            >
              Recevoir 1000 tUSD de test
            </button>
          </div>

          {/* Tableau de bord */}
          <div style={card}>
            <h3>2. Mes polices</h3>
            {myPolicies.length === 0 ? (
              <p>Aucune police pour ce portefeuille.</p>
            ) : (
              myPolicies.map((p) => {
                const info = policyInfo(p);
                return (
                  <div
                    key={String(p.id)}
                    style={{ borderTop: "1px solid #ddd", padding: "10px 0" }}
                  >
                    <b>Police n°{String(p.id)}</b> (saison {String(p.seasonId)})
                    <br />
                    {info.text}
                    {info.canPay && (
                      <div>
                        <button
                          style={btn}
                          disabled={busy}
                          onClick={() => insurance("payPolicy", [p.id], "Indemnisation")}
                        >
                          Déclencher l'indemnisation
                        </button>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* Pool */}
          <div style={card}>
            <h3>3. Pool de réassurance</h3>
            <p>
              Fonds du pool : <b>{fmt(poolBalance)} tUSD</b> · Réservé aux
              indemnisations : <b>{fmt(reserved)} tUSD</b>
            </p>
            <button style={btn} disabled={busy} onClick={deposit}>
              Déposer 100 tUSD dans le pool
            </button>
          </div>

          {/* Démonstration */}
          <div style={{ ...card, background: "#eef3fb" }}>
            <h3>4. Démonstration (administrateur / oracle)</h3>
            <p>
              Ces actions ne fonctionnent qu'avec le portefeuille administrateur,
              qui joue aussi le rôle d'oracle provisoire.
            </p>
            <button
              style={btn}
              disabled={busy}
              onClick={() => insurance("startSeason", [90n], "Démarrage de saison")}
            >
              Démarrer une saison de 90 s
            </button>
            <div style={{ marginTop: 8 }}>
              Pluie observée (mm) :{" "}
              <input
                value={rain}
                onChange={(e) => setRain(e.target.value.replace(/\D/g, ""))}
                style={{ width: 70, padding: 6 }}
              />{" "}
              <button
                style={btn}
                disabled={busy || latestId === undefined || !rain}
                onClick={() =>
                  insurance("settleSeason", [latestId, BigInt(rain)], "Règlement de saison")
                }
              >
                Déclarer la pluie (oracle)
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}