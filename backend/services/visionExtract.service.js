const fs = require('fs');
const axios = require('axios');

/**
 * Vision-based extraction for SCANNED / handwritten assessment PDFs that have
 * no text layer (e.g. the Manual Test Intake Sheet).
 *
 * The regular pdf-parse path returns an empty string for these, so we hand the
 * raw PDF to Gemini — which reads PDFs (including scans/handwriting) natively —
 * and ask it to transcribe the sheet into a clean, structured text block that
 * looks just like the text the rest of the pipeline already consumes.
 *
 * We deliberately send the PDF as inline data (mimeType application/pdf) instead
 * of rasterising it, so the server needs no image tooling (poppler/ghostscript).
 */

const VISION_PROMPT = `You are transcribing a sports-science physical assessment sheet from a scanned or photographed document. It may be handwritten.

Transcribe EXACTLY what is on the sheet. Do not interpret, diagnose, or add commentary. Rules:
- Read every test row. For each, capture the Left value, the Right value, and the unit exactly as written.
- Handwritten numbers must be read carefully (distinguish e.g. 1 vs 7, 0 vs 6, 4 vs 9). If a value is genuinely illegible, write "illegible" — never guess.
- If a cell is blank, write "—" for that side.
- Also capture header fields: Athlete Name, Sport/Squad, Date, Age, Academy, Tested By.
- Capture anything written in "Additional Observations".

Return ONLY a JSON object in exactly this shape (no markdown, no prose):
{
  "assessmentType": "Manual Test Intake Sheet",
  "header": {
    "athleteName": "", "sport": "", "date": "", "age": "", "academy": "", "testedBy": ""
  },
  "tests": [
    { "test": "Hip Internal Rotation", "left": "32", "right": "27", "unit": "°", "notes": "" }
  ],
  "additionalObservations": ""
}`;

/**
 * Turn the model's JSON into the plain-text block the prompt builder expects,
 * so downstream reasoning/writing stages treat it like any other extracted data.
 */
const jsonToText = (data) => {
  const h = data.header || {};
  const lines = [];
  lines.push(`ASSESSMENT: ${data.assessmentType || 'Manual Test Intake Sheet'}`);
  lines.push(
    `HEADER: Name=${h.athleteName || 'N/A'}; Sport=${h.sport || 'N/A'}; ` +
    `Date=${h.date || 'N/A'}; Age=${h.age || 'N/A'}; Academy=${h.academy || 'N/A'}; ` +
    `TestedBy=${h.testedBy || 'N/A'}`
  );
  lines.push('');
  lines.push('TEST RESULTS (Left / Right / Unit):');
  (data.tests || []).forEach(t => {
    const note = t.notes ? `  [${t.notes}]` : '';
    lines.push(`- ${t.test}: Left ${t.left ?? '—'}, Right ${t.right ?? '—'} ${t.unit || ''}${note}`.trimEnd());
  });
  if (data.additionalObservations) {
    lines.push('');
    lines.push(`ADDITIONAL OBSERVATIONS: ${data.additionalObservations}`);
  }
  return lines.join('\n');
};

const stripFences = (s) => s.replace(/```json\s*|\s*```/g, '').trim();

/**
 * @returns {Promise<{ text: string, header: object, structured: object }>}
 */
const transcribeScannedPdf = async (filePath) => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      'This looks like a scanned/handwritten sheet, which needs vision extraction, ' +
      'but GEMINI_API_KEY is not set. Add it to the backend environment to process scanned uploads.'
    );
  }

  const model = process.env.GEMINI_VISION_MODEL || process.env.GEMINI_MODEL || 'gemini-3.6-flash';
  const base64 = fs.readFileSync(filePath).toString('base64');

  const response = await axios.post(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      contents: [{
        role: 'user',
        parts: [
          { inlineData: { mimeType: 'application/pdf', data: base64 } },
          { text: VISION_PROMPT }
        ]
      }],
      generationConfig: {
        temperature: 0,                         // transcription must be deterministic
        responseMimeType: 'application/json',
        maxOutputTokens: 4000
      }
    },
    {
      headers: { 'x-goog-api-key': apiKey, 'Content-Type': 'application/json' },
      timeout: 60000
    }
  );

  const candidate = response.data?.candidates?.[0];
  if (!candidate) throw new Error('Vision extraction returned no result.');
  if (candidate.finishReason === 'MAX_TOKENS') {
    throw new Error('Vision extraction was cut off before finishing. The sheet may have too many rows.');
  }

  const raw = candidate.content?.parts?.[0]?.text || '';
  let structured;
  try {
    structured = JSON.parse(stripFences(raw));
  } catch (e) {
    throw new Error('Vision extraction did not return valid JSON. Raw start: ' + raw.slice(0, 120));
  }

  return {
    text: jsonToText(structured),
    header: structured.header || {},
    structured
  };
};

module.exports = { transcribeScannedPdf };