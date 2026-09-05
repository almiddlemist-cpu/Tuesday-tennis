import { listAll, createRecords, updateRecords, readBody, TABLES, SetupError } from "./_lib/airtable.mjs";
import { computeNight } from "./_lib/logic.mjs";

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

    // who played tonight (had at least one observation)
    const playedIds = out.updated.filter(p => p.played).map(p => p.id);

    // 1) create the session
    const [session] = await createRecords(TABLES.sessions, [{
      Label: `Week ${week}`,
      Date: date || undefined,
      Week: week,
      Mode: mode,
      Status: "Completed",
      "Winner Games": out.topGames,
      Tiebreak: out.isTie,
      Winner: out.winnerIds,
      "Available Players": playedIds,
    }]);
    const sessionId = session.id;

    // 2) create the matches
    const matchRecs = [];
    rounds.forEach((rd, ri) => rd.courts.forEach((ct, ci) => {
      if (ct.ga === "" || ct.gb === "" || ct.ga == null || ct.gb == null) return;
      matchRecs.push({
        Label: `W${week} R${ri + 1} C${ci + 1}`,
        Round: ri + 1, Court: ci + 1,
        "Games A": +ct.ga, "Games B": +ct.gb,
        "Team A": ct.a, "Team B": ct.b, Session: [sessionId],
      });
    }));
    if (matchRecs.length) await createRecords(TABLES.matches, matchRecs);

    // 3) update player ratings + stats
    const playerUpdates = out.updated.filter(p => p.played).map(p => ({
      id: p.id,
      fields: {
        Rating: Math.round(p.r), RD: Math.round(p.rd), Volatility: +p.sigma.toFixed(3),
        Played: p.played_total, Wins: p.wins, Draws: p.draws, Losses: p.losses,
        "Games For": p.gf, "Games Against": p.ga, "Night Wins": p.nightWins,
      },
    }));
    if (playerUpdates.length) await updateRecords(TABLES.players, playerUpdates);

    // 4) rating history snapshots
    const historyRecs = out.updated.filter(p => p.played).map(p => ({
      Label: `${nameById[p.id]} \u00b7 Week ${week}`,
      "Rating After": Math.round(p.r), "RD After": Math.round(p.rd),
      "Rating Change": +p.change.toFixed(1), "Rank After": p.rankAfter,
      Player: [p.id], Session: [sessionId],
    }));
    if (historyRecs.length) await createRecords(TABLES.history, historyRecs);

    res.status(200).json({
      ok: true, sessionId,
      result: {
        winnerIds: out.winnerIds,
        winnerNames: out.winnerIds.map(id => nameById[id] || "\u2014"),
        games: out.topGames, tie: out.isTie,
        podium: out.podium.map(r => ({ id: r.id, name: nameById[r.id] || "\u2014", games: r.games })),
      },
    });
  } catch (e) {
    if (e instanceof SetupError) return res.status(200).json({ ok: false, setup: true });
    res.status(500).json({ ok: false, error: String(e.message) });
  }
}
