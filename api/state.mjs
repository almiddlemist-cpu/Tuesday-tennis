import { listAll, TABLES, SetupError } from "./_lib/airtable.mjs";

export default async function handler(req, res) {
  try {
    const [players, sessions] = await Promise.all([
      listAll(TABLES.players),
      listAll(TABLES.sessions),
    ]);
    const nameById = {};
    players.forEach(p => (nameById[p.id] = p.fields.Name || ""));

    const outPlayers = players.map(p => ({
      id: p.id,
      name: p.fields.Name || "",
      r: p.fields.Rating ?? 1500,
      rd: p.fields.RD ?? 350,
      sigma: p.fields.Volatility ?? 0.06,
      active: !!p.fields.Active,
      played: p.fields.Played || 0,
      wins: p.fields.Wins || 0,
      draws: p.fields.Draws || 0,
      losses: p.fields.Losses || 0,
      gf: p.fields["Games For"] || 0,
      ga: p.fields["Games Against"] || 0,
      nightWins: p.fields["Night Wins"] || 0,
    }));

    const nights = sessions
      .map(s => ({
        id: s.id,
        week: s.fields.Week || 0,
        date: s.fields.Date || null,
        winnerIds: s.fields.Winner || [],
        winnerNames: (s.fields.Winner || []).map(id => nameById[id] || "—"),
        games: s.fields["Winner Games"] || 0,
        tiebreak: !!s.fields.Tiebreak,
      }))
      .sort((a, b) => b.week - a.week);

    const week = (nights[0]?.week || 0) + 1;
    res.status(200).json({ ok: true, players: outPlayers, nights, week });
  } catch (e) {
    if (e instanceof SetupError) {
      return res.status(200).json({ ok: false, setup: true });
    }
    res.status(500).json({ ok: false, error: String(e.message) });
  }
}
