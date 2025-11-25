// api/reset-original.js
//
// Ripristina il campo BODY all'immagine originale salvata
// in un altro campo di Airtable (es. "BODY ORIGINALE").
//
// Usa le stesse env di api/record.js:
//   AIRTABLE_TOKEN
//   AIRTABLE_BASE_ID
//
// ATTENZIONE: cambia ORIGINAL_FIELD se il tuo campo si chiama diversamente.

const TABLE_NAME = "CASI CLINICI";
const ORIGINAL_FIELD = "BODY ORIGINALE"; // <-- CAMBIA IL NOME SE SERVE
const BODY_FIELD = "BODY";

export default async function handler(req, res) {
  const { AIRTABLE_TOKEN, AIRTABLE_BASE_ID } = process.env;

  if (!AIRTABLE_TOKEN || !AIRTABLE_BASE_ID) {
    res.status(500).json({ ok: false, error: "Missing Airtable env vars" });
    return;
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    res.status(405).json({ ok: false, error: "Method not allowed" });
    return;
  }

  try {
    const { recordId } = req.body || {};
    if (!recordId) {
      res.status(400).json({ ok: false, error: "recordId is required" });
      return;
    }

    const tableName = encodeURIComponent(TABLE_NAME);

    // 1) Leggo il record per prendere l'immagine originale
    const getUrl = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${tableName}/${recordId}`;
    const recRes = await fetch(getUrl, {
      headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` },
    });

    if (!recRes.ok) {
      const text = await recRes.text();
      res
        .status(recRes.status)
        .json({ ok: false, error: "Airtable GET failed: " + text });
      return;
    }

    const recData = await recRes.json();
    const fields = recData.fields || {};
    const original = fields[ORIGINAL_FIELD];

    if (!original || !Array.isArray(original) || original.length === 0) {
      res
        .status(400)
        .json({ ok: false, error: "Nessuna immagine originale nel campo '" + ORIGINAL_FIELD + "'" });
      return;
    }

    // 2) Aggiorno il campo BODY con l'allegato originale
    const patchUrl = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${tableName}/${recordId}`;
    const patchRes = await fetch(patchUrl, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${AIRTABLE_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        fields: {
          [BODY_FIELD]: original,
        },
      }),
    });

    if (!patchRes.ok) {
      const text = await patchRes.text();
      res
        .status(patchRes.status)
        .json({ ok: false, error: "Airtable PATCH failed: " + text });
      return;
    }

    const first = original[0];

    res.status(200).json({
      ok: true,
      imageUrl: first.url,
      filename: first.filename || "originale.png",
    });
  } catch (err) {
    console.error("[reset-original] error", err);
    res.status(500).json({ ok: false, error: err.message || "Server error" });
  }
}
