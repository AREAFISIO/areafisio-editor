// api/record.js

export default async function handler(req, res) {
  const {
    AIRTABLE_TOKEN,
    AIRTABLE_BASE_ID,
    SUPABASE_URL,
    SUPABASE_SERVICE_KEY,
    SUPABASE_BUCKET,
  } = process.env;

  if (
    !AIRTABLE_TOKEN ||
    !AIRTABLE_BASE_ID ||
    !SUPABASE_URL ||
    !SUPABASE_SERVICE_KEY ||
    !SUPABASE_BUCKET
  ) {
    res.status(500).json({ error: "Missing environment variables" });
    return;
  }

  // ------- GET: leggo l'immagine dal record Airtable -------
  if (req.method === "GET") {
    const { recordId } = req.query;

    if (!recordId) {
      res.status(400).json({ error: "recordId is required" });
      return;
    }

    const tableName = encodeURIComponent("CASI CLINICI");
    const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${tableName}/${recordId}`;

    const airtableRes = await fetch(url, {
      headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` },
    });

    if (!airtableRes.ok) {
      const text = await airtableRes.text();
      res.status(airtableRes.status).json({ error: text });
      return;
    }

    const data = await airtableRes.json();
    const body = data.fields && data.fields["BODY"];

    if (!body || !body.length) {
      res.status(200).json({ imageUrl: null, filename: null });
      return;
    }

    const att = body[0];

    res.status(200).json({
      imageUrl: att.url,
      filename: att.filename || "image.png",
    });
    return;
  }

  // ------- POST: salvo la NUOVA immagine modificata -------
  if (req.method === "POST") {
    const { recordId, dataURL, filename } = req.body || {};

    if (!recordId || !dataURL) {
      res.status(400).json({ error: "recordId and dataURL are required" });
      return;
    }

    // 1) dataURL -> buffer PNG
    const base64 = dataURL.split(",")[1];
    const buffer = Buffer.from(base64, "base64");

    // creo SEMPRE un nome univoco per evitare cache strane
    const nowTs = Date.now();
    const safeRecordId = String(recordId).replace(/[^a-zA-Z0-9_-]/g, "_");
    const originalName = filename || "image.png";
    const storageFilename = `${safeRecordId}_${nowTs}_${originalName}`;
    const path = `edited/${storageFilename}`;

    // 2) Upload su Supabase (sovrascrive se esiste ma il path è univoco)
    const uploadUrl = `${SUPABASE_URL}/storage/v1/object/${SUPABASE_BUCKET}/${path}`;
    const uploadRes = await fetch(uploadUrl, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
        "Content-Type": "image/png",
        "x-upsert": "true",
      },
      body: buffer,
    });

    if (!uploadRes.ok) {
      const text = await uploadRes.text();
      res
        .status(uploadRes.status)
        .json({ error: "Supabase upload failed: " + text });
      return;
    }

    // URL pubblico DEFINITIVO della nuova immagine
    const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/${SUPABASE_BUCKET}/${path}`;

    // 3) aggiorno Airtable (BODY + MODIFICATO IL) con il NUOVO URL
    const tableName = encodeURIComponent("CASI CLINICI");
    const patchUrl = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${tableName}/${recordId}`;

    const tsHuman = new Date()
      .toLocaleString("it-IT", { hour12: false })
      .replace(",", "");

    const patchRes = await fetch(patchUrl, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${AIRTABLE_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        fields: {
          BODY: [
            {
              url: publicUrl,
              filename: originalName,
            },
          ],
          "MODIFICATO IL": tsHuman,
        },
      }),
    });

    if (!patchRes.ok) {
      const text = await patchRes.text();
      res
        .status(patchRes.status)
        .json({ error: "Airtable update failed: " + text });
      return;
    }

    res.status(200).json({ ok: true, publicUrl });
    return;
  }

  // ------- Metodi non consentiti -------
  res.setHeader("Allow", ["GET", "POST"]);
  res.status(405).end("Method not allowed");
}
