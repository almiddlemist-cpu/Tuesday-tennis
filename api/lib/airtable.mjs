// Thin Airtable REST client. Credentials come from environment variables set in
// Vercel (never hard-coded): AIRTABLE_TOKEN (a personal access token) and
// AIRTABLE_BASE_ID (the base, appHS8TotHpCLuRib).

const API = "https://api.airtable.com/v0";
const TOKEN = () => process.env.AIRTABLE_TOKEN;
const BASE = () => process.env.AIRTABLE_BASE_ID;

export const TABLES = {
  players: "Players",
  sessions: "Sessions",
  matches: "Matches",
  history: "Rating History",
};

export class SetupError extends Error {}

async function req(path, opts = {}) {
  if (!TOKEN() || !BASE()) throw new SetupError("Airtable env vars not set");
  const res = await fetch(`${API}/${BASE()}/${path}`, {
    ...opts,
    headers: {
      Authorization: `Bearer ${TOKEN()}`,
      "Content-Type": "application/json",
      ...(opts.headers || {}),
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Airtable ${res.status}: ${body}`);
  }
  return res.json();
}

export async function listAll(table) {
  let records = [], offset;
  do {
    const q = new URLSearchParams({ pageSize: "100" });
    if (offset) q.set("offset", offset);
    const data = await req(`${encodeURIComponent(table)}?${q}`);
    records = records.concat(data.records);
    offset = data.offset;
  } while (offset);
  return records;
}

// recs: array of plain fields objects
export async function createRecords(table, recs) {
  const out = [];
  for (let i = 0; i < recs.length; i += 10) {
    const chunk = recs.slice(i, i + 10).map(fields => ({ fields }));
    const data = await req(encodeURIComponent(table), {
      method: "POST",
      body: JSON.stringify({ records: chunk }),
    });
    out.push(...data.records);
  }
  return out;
}

// recs: array of { id, fields }
export async function updateRecords(table, recs) {
  const out = [];
  for (let i = 0; i < recs.length; i += 10) {
    const chunk = recs.slice(i, i + 10);
    const data = await req(encodeURIComponent(table), {
      method: "PATCH",
      body: JSON.stringify({ records: chunk }),
    });
    out.push(...data.records);
  }
  return out;
}

export function readBody(req) {
  return new Promise((resolve) => {
    if (req.body) return resolve(typeof req.body === "string" ? JSON.parse(req.body) : req.body);
    let data = "";
    req.on("data", c => (data += c));
    req.on("end", () => { try { resolve(data ? JSON.parse(data) : {}); } catch { resolve({}); } });
  });
}
