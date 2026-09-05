import { createRecords, updateRecords, readBody, TABLES, SetupError } from "./_lib/airtable.mjs";

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
