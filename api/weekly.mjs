// GET /api/weekly — every saved week's games-won per player, for the public weekly-scores table.
const API = "https://api.airtable.com/v0";
const TOKEN = () => process.env.AIRTABLE_TOKEN;
const BASE = () => process.env.AIRTABLE_BASE_ID;
class SetupError extends Error {}

async function atReq(path) {
  if (!TOKEN() || !BASE()) throw new SetupError("Airtable env vars not set");
  const res = await fetch(`${API}/${BASE()}/${path}`, {
    headers: { Authorization: `Bearer ${TOKEN()}`, "Content-Type": "application/json" },
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

export default async function handler(req, res) {
  try {
    const [sessions, players] = await Promise.all([listAll("Sessions"), listAll("Players")]);
    // exception players (ticked "Exclude From Ladder") are left off every public table;
    // checked by name so it also covers nights saved before the flag existed
    const hidden = new Set(players.filter(p => p.fields["Exclude From Ladder"] === true).map(p => p.fields.Name));

    const weeks = sessions.filter(s => (s.fields.Week || 0) > 0).sort((a, b) => a.fields.Week - b.fields.Week);
    if (!weeks.length) return res.status(200).json({ ok: true, noResults: true });

    const byPlayer = {};
    weeks.forEach(s => {
      let rows = [];
      try { rows = JSON.parse(s.fields.Results || "[]"); } catch { rows = []; }
      rows.forEach(r => {
        if (hidden.has(r.n) || r.e === false) return;
        (byPlayer[r.n] = byPlayer[r.n] || {})[s.fields.Week] = r.g;
      });
    });

    const weekNums = weeks.map(s => s.fields.Week);
    const table = Object.keys(byPlayer).map(name => {
      const scores = weekNums.map(w => (byPlayer[name][w] ?? null));
      const total = scores.reduce((a, b) => a + (b || 0), 0);
      return { name, scores, total, played: scores.filter(x => x !== null).length };
    }).sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));

    res.status(200).json({ ok: true, weeks: weekNums, table });
  } catch (e) {
    if (e instanceof SetupError) return res.status(200).json({ ok: false, setup: true });
    res.status(500).json({ ok: false, error: String(e.message) });
  }
}
