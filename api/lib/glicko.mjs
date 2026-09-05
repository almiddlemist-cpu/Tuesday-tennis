// Glicko-2, doubles-adapted. One rating period per night, each match one equal
// observation, outcome = win/draw/loss blended with games-won proportion, and
// the TEAM rating drives the expectation so carried wins gain little.
// This is the same engine verified numerically before the app was built.

const TAU = 0.5, SCALE = 173.7178;
const gphi = (phi) => 1 / Math.sqrt(1 + (3 * phi * phi) / (Math.PI * Math.PI));

export function updatePlayer(r, rd, sigma, obs) {
  const mu = (r - 1500) / SCALE, phi = rd / SCALE;
  if (obs.length === 0) {
    const phiStar = Math.sqrt(phi * phi + sigma * sigma);
    return { r, rd: phiStar * SCALE, sigma };
  }
  let vInv = 0, deltaSum = 0;
  for (const o of obs) {
    const muOpp = (o.oppR - 1500) / SCALE, phiOpp = o.oppRd / SCALE;
    const teamMu = (o.teamR - 1500) / SCALE;
    const g = gphi(phiOpp);
    const e = 1 / (1 + Math.exp(-g * (teamMu - muOpp)));
    vInv += g * g * e * (1 - e);
    deltaSum += g * (o.s - e);
  }
  const v = 1 / vInv, delta = v * deltaSum;
  const a = Math.log(sigma * sigma);
  const f = (x) => {
    const ex = Math.exp(x);
    return (ex * (delta * delta - phi * phi - v - ex)) /
      (2 * Math.pow(phi * phi + v + ex, 2)) - (x - a) / (TAU * TAU);
  };
  let A = a, B;
  if (delta * delta > phi * phi + v) B = Math.log(delta * delta - phi * phi - v);
  else { let k = 1; while (f(a - k * TAU) < 0) k++; B = a - k * TAU; }
  let fa = f(A), fb = f(B);
  while (Math.abs(B - A) > 1e-6) {
    const C = A + ((A - B) * fa) / (fb - fa);
    const fc = f(C);
    if (fc * fb <= 0) { A = B; fa = fb; } else { fa = fa / 2; }
    B = C; fb = fc;
  }
  const sigmaNew = Math.exp(A / 2);
  const phiStar = Math.sqrt(phi * phi + sigmaNew * sigmaNew);
  const phiNew = 1 / Math.sqrt(1 / (phiStar * phiStar) + 1 / v);
  const muNew = mu + phiNew * phiNew * deltaSum;
  return { r: muNew * SCALE + 1500, rd: phiNew * SCALE, sigma: sigmaNew };
}

// outcome in [0,1]: blend of win/draw/loss with games-won proportion
export function outcome(gf, ga, blend = 0.5) {
  const t = gf + ga, prop = t ? gf / t : 0.5;
  const res = gf > ga ? 1 : gf < ga ? 0 : 0.5;
  return blend * res + (1 - blend) * prop;
}
