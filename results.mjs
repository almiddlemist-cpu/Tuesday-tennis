// GET /api/results — the latest week's games-won summary, for the public results page.
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
    const sessions = await listAll("Sessions");
    const withWeek = sessions.filter(s => (s.fields.Week || 0) > 0);
    if (!withWeek.length) return res.status(200).json({ ok: true, noResults: true });
    const latest = withWeek.sort((a, b) => (b.fields.Week || 0) - (a.fields.Week || 0))[0];

    let raw = [];
    try { raw = JSON.parse(latest.fields.Results || "[]"); } catch { raw = []; }
    // "e" marks a normal, publicly-shown player; an exception player (e:false, e.g. a
    // county-level player — see "Exclude From Ladder" on Players) still played and still
    // counts internally, but is left off this public page entirely, not just out of the
    // winner pick. Older saved nights without "e" at all default to shown.
    const results = raw
      .filter(r => r.e !== false)
      .map(r => ({ name: r.n, games: r.g }))
      .sort((a, b) => b.games - a.games);

    if (!results.length) {
      return res.status(200).json({ ok: true, noResults: true, week: latest.fields.Week });
    }

    const topGames = results[0].games;
    const winnerNames = results.filter(r => r.games === topGames).map(r => r.name);

    res.status(200).json({
      ok: true,
      week: latest.fields.Week || 0,
      date: latest.fields.Date || null,
      tiebreak: !!latest.fields.Tiebreak,
      winnerNames,
      winnerGames: topGames,
      results,
    });
  } catch (e) {
    if (e instanceof SetupError) return res.status(200).json({ ok: false, setup: true });
    res.status(500).json({ ok: false, error: String(e.message) });
  }
}
