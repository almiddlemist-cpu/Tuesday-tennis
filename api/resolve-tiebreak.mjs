import { listAll, updateRecords, readBody, TABLES, SetupError } from "./_lib/airtable.mjs";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "POST only" });
  try {
    const { sessionId, winnerId } = await readBody(req);
    if (!sessionId || !winnerId) return res.status(400).json({ ok: false, error: "sessionId and winnerId required" });

    // bump the winner's night-win count
    const players = await listAll(TABLES.players);
    const winner = players.find(p => p.id === winnerId);
    const current = winner ? (winner.fields["Night Wins"] || 0) : 0;

    await updateRecords(TABLES.sessions, [{ id: sessionId, fields: { Winner: [winnerId], Tiebreak: false } }]);
    await updateRecords(TABLES.players, [{ id: winnerId, fields: { "Night Wins": current + 1 } }]);

    res.status(200).json({ ok: true });
  } catch (e) {
    if (e instanceof SetupError) return res.status(200).json({ ok: false, setup: true });
    res.status(500).json({ ok: false, error: String(e.message) });
  }
}
