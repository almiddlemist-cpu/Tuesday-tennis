// TEMPORARY diagnostic. Add as api/diag.mjs, visit /api/diag, then delete it.
// It never reveals your full token — only its length and first 3 characters.
export default async function handler(req, res) {
  const rawToken = process.env.AIRTABLE_TOKEN || "";
  const rawBase = process.env.AIRTABLE_BASE_ID || "";
  const token = rawToken.trim();
  const base = rawBase.trim();

  const out = {
    env: {
      tokenPresent: !!rawToken,
      tokenLength: rawToken.length,
      tokenStartsWith: rawToken ? rawToken.slice(0, 3) : null,
      tokenHadWhitespace: rawToken !== token,
      baseIdPresent: !!rawBase,
      baseIdValue: rawBase,
      baseIdLength: rawBase.length,
      baseIdHadWhitespace: rawBase !== base,
      baseIdExpected: "appHS8TotHpCLuRib",
      baseIdMatchesExpected: base === "appHS8TotHpCLuRib",
    },
    tokenCanSeeTheseBases: null,
    directReadOfYourBase: null,
  };

  // Which bases can this token reach? (needs schema.bases:read; if missing, shows the status)
  try {
    const r = await fetch("https://api.airtable.com/v0/meta/bases", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const text = await r.text();
    let parsed; try { parsed = JSON.parse(text); } catch { parsed = text; }
    out.tokenCanSeeTheseBases = {
      httpStatus: r.status,
      bases: parsed && parsed.bases
        ? parsed.bases.map(b => ({ id: b.id, name: b.name, permission: b.permissionLevel }))
        : parsed,
    };
  } catch (e) {
    out.tokenCanSeeTheseBases = { error: String(e.message) };
  }

  // Direct read of the configured base's Players table (the real test)
  try {
    const r = await fetch(`https://api.airtable.com/v0/${base}/Players?maxRecords=1`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    out.directReadOfYourBase = { httpStatus: r.status, body: (await r.text()).slice(0, 300) };
  } catch (e) {
    out.directReadOfYourBase = { error: String(e.message) };
  }

  res.status(200).json(out);
}
