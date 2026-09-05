import { updatePlayer, outcome } from "./glicko.mjs";

// players: [{id, r, rd, sigma, played, wins, draws, losses, gf, ga, nightWins}]
// payload: { rounds: [{ courts: [{a:[id,id], b:[id,id], ga, gb}], byes:[id] }], blend }
// Returns everything the handler needs to write to Airtable.
export function computeNight(players, payload) {
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

  // winner of the night: most games won. Ties are flagged, not resolved.
  const nightRows = Object.keys(tally).map(id => {
    const t = tally[id];
    return { id, games: t.gf, diff: t.gf - t.ga };
  }).sort((x, y) => y.games - x.games || y.diff - x.diff);
  const top = nightRows[0];
  const topGames = top ? top.games : 0;
  const winnerIds = top ? nightRows.filter(r => r.games === topGames).map(r => r.id) : [];
  const isTie = winnerIds.length > 1;
  const podium = nightRows.slice(0, 3);

  const oldRank = {};
  [...players].sort((a, b) => b.r - a.r).forEach((p, i) => (oldRank[p.id] = i));

  const updated = players.map(p => {
    const o = obs[p.id] || [];
    const t = tally[p.id] || { p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0 };
    if (o.length === 0) return { ...p, change: 0, played: false };
    const up = updatePlayer(p.r, p.rd, p.sigma, o);
    return {
      ...p, r: up.r, rd: up.rd, sigma: up.sigma, change: up.r - p.r, played: true,
      played_total: p.played + t.p, wins: p.wins + t.w, draws: p.draws + t.d,
      losses: p.losses + t.l, gf: p.gf + t.gf, ga: p.ga + t.ga,
      nightWins: (p.nightWins || 0) + (!isTie && winnerIds[0] === p.id ? 1 : 0),
      tallyGames: t.gf,
    };
  });
  const newRank = {};
  [...updated].sort((a, b) => b.r - a.r).forEach((p, i) => (newRank[p.id] = i));
  updated.forEach(p => (p.rankAfter = newRank[p.id] + 1));

  return { updated, tally, winnerIds, isTie, topGames, podium, oldRank, newRank };
}
