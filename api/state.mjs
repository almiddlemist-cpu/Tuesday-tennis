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

export default async function handler(req, res) {
  try {
    const [players, sessions] = await Promise.all([listAll(TABLES.players), listAll(TABLES.sessions)]);
    const nameById = {}; players.forEach(p => (nameById[p.id] = p.fields.Name || ""));
    const outPlayers = players.map(p => ({
      id: p.id, name: p.fields.Name || "", r: p.fields.Rating ?? 1500, rd: p.fields.RD ?? 350,
      sigma: p.fields.Volatility ?? 0.06, active: !!p.fields.Active, played: p.fields.Played || 0,
      wins: p.fields.Wins || 0, draws: p.fields.Draws || 0, losses: p.fields.Losses || 0,
      gf: p.fields["Games For"] || 0, ga: p.fields["Games Against"] || 0, nightWins: p.fields["Night Wins"] || 0,
    }));
    const nights = sessions.map(s => ({
      id: s.id, week: s.fields.Week || 0, date: s.fields.Date || null,
      winnerIds: s.fields.Winner || [], winnerNames: (s.fields.Winner || []).map(id => nameById[id] || "\u2014"),
      games: s.fields["Winner Games"] || 0, tiebreak: !!s.fields.Tiebreak,
    })).sort((a, b) => b.week - a.week);
    const week = (nights[0]?.week || 0) + 1;
    res.status(200).json({ ok: true, players: outPlayers, nights, week });
  } catch (e) {
    if (e instanceof SetupError) return res.status(200).json({ ok: false, setup: true });
    res.status(500).json({ ok: false, error: String(e.message) });
  }
}
