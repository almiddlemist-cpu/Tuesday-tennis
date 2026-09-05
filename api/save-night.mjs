// ---- Airtable REST (inlined, no imports) ----
const API = "https://api.airtable.com/v0";
const TOKEN = () => process.env.AIRTABLE_TOKEN;
const BASE = () => process.env.AIRTABLE_BASE_ID;
const TABLES = { players: "Players", sessions: "Sessions", matches: "Matches", history: "Rating History" };
class SetupError extends Error {}

async function atReq(path, opts = {}) {
  if (!TOKEN() || !BASE()) throw new SetupError("Airtable env vars not set");
  const res = await fetch(`${API}/${BASE()}/${path}`, {
    ...opts,
    headers: { Authorization: `Bearer ${TOKEN()}`, "Content-Type": "application/json", ...(opts.headers || {}) },
  });
  if (!res.ok) throw new Error(`Airtable ${res.status}: ${await res.text()}`);
  return res.json();
}
async function listAll(table) {
  let records = [], offset;
  do {
    const q = new URLSearchParams({ pageSize: "100" });
    if (offset) q.set("offset", offset);
    const data = await atReq(`${encodeURIComponent(table)}?${q}`);
    records = records.concat(data.records);
    offset = data.offset;
  } while (offset);
  return records;
}
async function createRecords(table, recs) {
  const out = [];
  for (let i = 0; i < recs.length; i += 10) {
    const chunk = recs.slice(i, i + 10).map(fields => ({ fields }));
    const data = await atReq(encodeURIComponent(table), { method: "POST", body: JSON.stringify({ records: chunk }) });
    out.push(...data.records);
  }
  return out;
}
async function updateRecords(table, recs) {
  const out = [];
  for (let i = 0; i < recs.length; i += 10) {
    const chunk = recs.slice(i, i + 10);
    const data = await atReq(encodeURIComponent(table), { method: "PATCH", body: JSON.stringify({ records: chunk }) });
    out.push(...data.records);
  }
  return out;
}
function readBody(req) {
  return new Promise((resolve) => {
    if (req.body) return resolve(typeof req.body === "string" ? JSON.parse(req.body) : req.body);
    let data = ""; req.on("data", c => (data += c));
    req.on("end", () => { try { resolve(data ? JSON.parse(data) : {}); } catch { resolve({}); } });
  });
}
// ---- Glicko-2 engine + night logic (inlined, no imports) ----
const TAU = 0.5, SCALE = 173.7178;
const gphi = (phi) => 1 / Math.sqrt(1 + (3 * phi * phi) / (Math.PI * Math.PI));
function updatePlayer(r, rd, sigma, obs) {
  const mu = (r - 1500) / SCALE, phi = rd / SCALE;
  if (obs.length === 0) { const phiStar = Math.sqrt(phi * phi + sigma * sigma); return { r, rd: phiStar * SCALE, sigma }; }
  let vInv = 0, deltaSum = 0;
  for (const o of obs) {
    const muOpp = (o.oppR - 1500) / SCALE, phiOpp = o.oppRd / SCALE, teamMu = (o.teamR - 1500) / SCALE;
    const g = gphi(phiOpp), e = 1 / (1 + Math.exp(-g * (teamMu - muOpp)));
    vInv += g * g * e * (1 - e); deltaSum += g * (o.s - e);
  }
  const v = 1 / vInv, delta = v * deltaSum, a = Math.log(sigma * sigma);
  const f = (x) => { const ex = Math.exp(x); return (ex * (delta * delta - phi * phi - v - ex)) / (2 * Math.pow(phi * phi + v + ex, 2)) - (x - a) / (TAU * TAU); };
  let A = a, B;
  if (delta * delta > phi * phi + v) B = Math.log(delta * delta - phi * phi - v);
  else { let k = 1; while (f(a - k * TAU) < 0) k++; B = a - k * TAU; }
  let fa = f(A), fb = f(B);
  while (Math.abs(B - A) > 1e-6) { const C = A + ((A - B) * fa) / (fb - fa); const fc = f(C); if (fc * fb <= 0) { A = B; fa = fb; } else { fa = fa / 2; } B = C; fb = fc; }
  const sigmaNew = Math.exp(A / 2);
  const phiStar = Math.sqrt(phi * phi + sigmaNew * sigmaNew);
  const phiNew = 1 / Math.sqrt(1 / (phiStar * phiStar) + 1 / v);
  const muNew = mu + phiNew * phiNew * deltaSum;
  return { r: muNew * SCALE + 1500, rd: phiNew * SCALE, sigma: sigmaNew };
}
function outcome(gf, ga, blend = 0.5) {
  const t = gf + ga, prop = t ? gf / t : 0.5;
  const res = gf > ga ? 1 : gf < ga ? 0 : 0.5;
  return blend * res + (1 - blend) * prop;
}
function computeNight(players, payload) {
  const blend = payload.blend ?? 0.5;
  const byId = {}; players.forEach(p => (byId[p.id] = p));
  const obs = {}; players.forEach(p => (obs[p.id] = []));
  const tally = {};
  const rOf = id => byId[id].r, rdOf = id => byId[id].rd;
  const teamR = ids => (rOf(ids[0]) + rOf(ids[1])) / 2;
  const oppR = ids => (rOf(ids[0]) + rOf(ids[1])) / 2;
  const oppRd = ids => Math.sqrt((rdOf(ids[0]) ** 2 + rdOf(ids[1]) ** 2) / 2);
  for (const rd of payload.rounds) {
    for (const ct of rd.courts) {
      if (ct.ga === "" || ct.gb === "" || ct.ga == null || ct.gb == null) continue;
      const ga = +ct.ga, gb = +ct.gb;
      ct.a.forEach(id => obs[id].push({ oppR: oppR(ct.b), oppRd: oppRd(ct.b), teamR: teamR(ct.a), s: outcome(ga, gb, blend) }));
      ct.b.forEach(id => obs[id].push({ oppR: oppR(ct.a), oppRd: oppRd(ct.a), teamR: teamR(ct.b), s: outcome(gb, ga, blend) }));
      const add = (ids, f, ag) => ids.forEach(id => {
        const t = tally[id] || (tally[id] = { p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0 });
        t.gf += f; t.ga += ag; t.p++; if (f > ag) t.w++; else if (f < ag) t.l++; else t.d++;
      });
      add(ct.a, ga, gb); add(ct.b, gb, ga);
    }
  }
  const nightRows = Object.keys(tally).map(id => { const t = tally[id]; return { id, games: t.gf, diff: t.gf - t.ga }; })
    .sort((x, y) => y.games - x.games || y.diff - x.diff);
  const top = nightRows[0];
  const topGames = top ? top.games : 0;
  const winnerIds = top ? nightRows.filter(r => r.games === topGames).map(r => r.id) : [];
  const isTie = winnerIds.length > 1;
  const podium = nightRows.slice(0, 3);
  const updated = players.map(p => {
    const o = obs[p.id] || [];
    const t = tally[p.id] || { p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0 };
    if (o.length === 0) return { ...p, change: 0, played: false };
    const up = updatePlayer(p.r, p.rd, p.sigma, o);
    return { ...p, r: up.r, rd: up.rd, sigma: up.sigma, change: up.r - p.r, played: true,
      played_total: p.played + t.p, wins: p.wins + t.w, draws: p.draws + t.d, losses: p.losses + t.l,
      gf: p.gf + t.gf, ga: p.ga + t.ga, nightWins: (p.nightWins || 0) + (!isTie && winnerIds[0] === p.id ? 1 : 0) };
  });
  const newRank = {}; [...updated].sort((a, b) => b.r - a.r).forEach((p, i) => (newRank[p.id] = i));
  updated.forEach(p => (p.rankAfter = newRank[p.id] + 1));
  const ranking = nightRows.map(r => ({ id: r.id, games: r.games }));
  return { updated, winnerIds, isTie, topGames, podium, ranking };
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "POST only" });
  try {
    const body = await readBody(req);
    const { rounds = [], week, date, mode = "Balanced", blend = 0.5 } = body;
    const raw = await listAll(TABLES.players);
    const players = raw.map(p => ({
      id: p.id, r: p.fields.Rating ?? 1500, rd: p.fields.RD ?? 350, sigma: p.fields.Volatility ?? 0.06,
      name: p.fields.Name || "", played: p.fields.Played || 0, wins: p.fields.Wins || 0,
      draws: p.fields.Draws || 0, losses: p.fields.Losses || 0,
      gf: p.fields["Games For"] || 0, ga: p.fields["Games Against"] || 0, nightWins: p.fields["Night Wins"] || 0,
    }));
    const nameById = {}; players.forEach(p => (nameById[p.id] = p.name));
    const out = computeNight(players, { rounds, blend });
    const playedIds = out.updated.filter(p => p.played).map(p => p.id);

    // compact games-won summary for the public results page (name + games only)
    const resultsSummary = out.ranking.map(r => ({ n: nameById[r.id] || "\u2014", g: r.games }));

    const [session] = await createRecords(TABLES.sessions, [{
      Label: `Week ${week}`, Date: date || undefined, Week: week, Mode: mode, Status: "Completed",
      "Winner Games": out.topGames, Tiebreak: out.isTie, Winner: out.winnerIds, "Available Players": playedIds,
      Results: JSON.stringify(resultsSummary),
    }]);
    const sessionId = session.id;

    // update player ratings + stats (in place; no per-match or history rows written)
    const playerUpdates = out.updated.filter(p => p.played).map(p => ({
      id: p.id, fields: { Rating: Math.round(p.r), RD: Math.round(p.rd), Volatility: +p.sigma.toFixed(3),
        Played: p.played_total, Wins: p.wins, Draws: p.draws, Losses: p.losses,
        "Games For": p.gf, "Games Against": p.ga, "Night Wins": p.nightWins } }));
    if (playerUpdates.length) await updateRecords(TABLES.players, playerUpdates);

    res.status(200).json({ ok: true, sessionId, result: {
      winnerIds: out.winnerIds, winnerNames: out.winnerIds.map(id => nameById[id] || "\u2014"),
      games: out.topGames, tie: out.isTie,
      podium: out.podium.map(r => ({ id: r.id, name: nameById[r.id] || "\u2014", games: r.games })) } });
  } catch (e) {
    if (e instanceof SetupError) return res.status(200).json({ ok: false, setup: true });
    res.status(500).json({ ok: false, error: String(e.message) });
  }
}
