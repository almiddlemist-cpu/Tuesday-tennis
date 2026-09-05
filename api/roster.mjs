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
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "POST only" });
  try {
    const body = await readBody(req);
    const { action } = body;
    if (action === "add") {
      const name = (body.name || "").trim();
      if (!name) return res.status(400).json({ ok: false, error: "name required" });
      const [rec] = await createRecords(TABLES.players, [{
        Name: name, Rating: 1500, RD: 350, Volatility: 0.06, Active: true,
        Played: 0, Wins: 0, Draws: 0, Losses: 0, "Games For": 0, "Games Against": 0, "Night Wins": 0,
      }]);
      return res.status(200).json({ ok: true, id: rec.id });
    }
    if (action === "setActive") {
      const { id, active } = body;
      if (!id) return res.status(400).json({ ok: false, error: "id required" });
      await updateRecords(TABLES.players, [{ id, fields: { Active: !!active } }]);
      return res.status(200).json({ ok: true });
    }
    res.status(400).json({ ok: false, error: "unknown action" });
  } catch (e) {
    if (e instanceof SetupError) return res.status(200).json({ ok: false, setup: true });
    res.status(500).json({ ok: false, error: String(e.message) });
  }
}
