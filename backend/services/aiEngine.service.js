const axios = require('axios');

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// 429 = rate limited, 503 = model overloaded ("high demand") — both are
// transient and worth retrying with backoff. Anything else (bad key, bad
// request, etc.) fails immediately since retrying won't help.
const isRetryableStatus = (status) => status === 429 || status === 503;

const withRetry = async (fn, { retries = 3, baseDelayMs = 1000, label = 'API' } = {}) => {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const status = error.response?.status;
      if (!isRetryableStatus(status) || attempt === retries) throw error;
      const delay = baseDelayMs * 2 ** attempt; // 1s, 2s, 4s...
      console.log(`${label} returned ${status} (overloaded/rate limited) — retrying in ${delay}ms (attempt ${attempt + 1}/${retries})...`);
      await sleep(delay);
    }
  }
  throw lastError;
};

/**
 * Calls Groq API (Llama 3.3 70B)
 */
const callGroq = async (systemPrompt, userPrompt) => {
  try {
    const response = await withRetry(
      () => axios.post(
        'https://api.groq.com/openai/v1/chat/completions',
        {
          model: 'llama-3.3-70b-versatile',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          response_format: { type: 'json_object' },
          max_tokens: 5000,
          temperature: 0.2
        },
        {
          headers: {
            Authorization: `Bearer ${process.env.GROQ_API_KEY}`
          },
          timeout: 60000
        }
      ),
      { label: 'Groq' }
    );

    return response.data.choices[0].message.content;
  } catch (error) {
    throw new Error(`Groq API error: ${error.response?.data?.error?.message || error.message}`);
  }
};

/**
 * Calls Claude API (Sonnet 4)
 */
const callClaude = async (systemPrompt, userPrompt) => {
  try {
    const response = await withRetry(
      () => axios.post(
        'https://api.anthropic.com/v1/messages',
        {
          model: 'claude-sonnet-4-20250514',
          max_tokens: 5000,
          system: systemPrompt,
          messages: [
            { role: 'user', content: userPrompt }
          ]
        },
        {
          headers: {
            'x-api-key': process.env.CLAUDE_API_KEY,
            'anthropic-version': '2023-06-01'
          },
          timeout: 60000
        }
      ),
      { label: 'Claude' }
    );

    return response.data.content[0].text;
  } catch (error) {
    throw new Error(`Claude API error: ${error.response?.data?.error?.message || error.message}`);
  }
};

/**
 * Calls Gemini API (2.5 Pro)
 */
const callGemini = async (systemPrompt, userPrompt) => {
  const GEMINI_MAX_OUTPUT_TOKENS = 16000;
  try {
    const model = process.env.GEMINI_MODEL || 'gemini-2.5-pro';

    const response = await withRetry(
      () => axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
          generationConfig: {
            temperature: 0.2,
            responseMimeType: 'application/json',
            maxOutputTokens: GEMINI_MAX_OUTPUT_TOKENS
          }
        },
        {
          headers: {
            'x-goog-api-key': process.env.GEMINI_API_KEY,
            'Content-Type': 'application/json'
          },
          timeout: 60000
        }
      ),
      { label: 'Gemini' }
    );

    const candidate = response.data.candidates[0];
    if (candidate.finishReason === 'MAX_TOKENS') {
      throw new Error(
        `Gemini response was cut off (hit the ${GEMINI_MAX_OUTPUT_TOKENS}-token output limit) before the JSON was complete. ` +
        `Try again, or shorten the report scope — this is not a parsing bug, the response itself is incomplete.`
      );
    }

    return candidate.content.parts[0].text;
  } catch (error) {
    throw new Error(`Gemini API error: ${error.response?.data?.error?.message || error.message}`);
  }
};

/**
 * Routes to correct AI provider based on environment variable
 */
const generateReport = async (systemPrompt, userPrompt) => {
  const provider = process.env.AI_PROVIDER || 'groq';

  console.log(`Generating report with ${provider}...`);

  try {
    let response;
    if (provider === 'claude') {
      response = await callClaude(systemPrompt, userPrompt);
    } else if (provider === 'gemini') {
      response = await callGemini(systemPrompt, userPrompt);
    } else {
      response = await callGroq(systemPrompt, userPrompt);
    }

    return response;
  } catch (error) {
    throw error;
  }
};

module.exports = {
  generateReport,
  callGroq,
  callClaude,
  callGemini
};