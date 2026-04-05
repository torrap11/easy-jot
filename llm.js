const { OpenAI } = require('openai');
const { getLLMClientConfig } = require('./config');

function getConfig() {
  const { apiKey, model, baseURL } = getLLMClientConfig();
  return { apiKey, model, baseURL };
}

const STRUCTURED_SYSTEM_PROMPT = `You are an action-planning assistant for a sticky-note app.
Given the user's instruction and their context (notes, scheduled reminders),
respond with ONLY a valid JSON array of action objects.

Available action types:
  {"type":"search",               "payload":{"query":"<search term>"}}
  {"type":"create_note",          "payload":{"content":"<note text>"}}
  {"type":"create_folder",        "payload":{"name":"<folder name>"}}
  {"type":"move_note_to_folder",  "payload":{"noteId":<id>,"folderId":<id>}}
  {"type":"organize_into_folders","payload":[{"folderName":"<name>","noteIds":[<id>,...]}]}
  {"type":"list_reminders",       "payload":{}}
  {"type":"search_reminders",     "payload":{"query":"<search term>"}}
  {"type":"toggle_reminder",      "payload":{"id":<id>}}
  {"type":"delete_reminder",      "payload":{"id":<id>}}

Rules:
- Return ONLY the JSON array — no prose, no markdown fences, no explanation.
- Use only the IDs provided in the context (notes, reminders).
- For organize_into_folders you may create new folder names if appropriate.
- If the request is purely informational with no actions, return [{"type":"search","payload":{"query":"<rephrased query>"}}].
- To query scheduled reminders, use list_reminders or search_reminders.`;

function tryParseJsonArray(str) {
  try {
    const v = JSON.parse(str);
    if (Array.isArray(v) && v.length >= 0) return v;
  } catch (_) {}
  return null;
}

function fixCommonJsonIssues(str) {
  return str.replace(/,(\s*[}\]])/g, '$1');  // trailing commas
}

function extractJsonArray(raw) {
  let trimmed = raw.trim();

  // Strip common LLM prefixes
  const prefixes = [
    /^here (?:is|are) (?:the )?(?:json|actions?)(?:\s*:)?\s*/i,
    /^the (?:json|actions?)(?:\s*:)?\s*/i,
    /^```(?:json)?\s*/i,
    /^sure[.!]?\s*/i,
    /^certainly[.!]?\s*/i,
  ];
  for (const re of prefixes) {
    trimmed = trimmed.replace(re, '').trim();
  }
  trimmed = trimmed.replace(/\s*```\s*$/g, '').trim();

  // Direct parse
  let v = tryParseJsonArray(trimmed);
  if (v) return v;

  // Code-fence extraction
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) {
    v = tryParseJsonArray(fence[1].trim());
    if (v) return v;
    v = tryParseJsonArray(fixCommonJsonIssues(fence[1].trim()));
    if (v) return v;
  }

  // Find array literal — match balanced brackets
  const arrMatch = trimmed.match(/\[[\s\S]*\]/);
  if (arrMatch) {
    v = tryParseJsonArray(arrMatch[0]);
    if (v) return v;
    v = tryParseJsonArray(fixCommonJsonIssues(arrMatch[0]));
    if (v) return v;
  }

  // Last resort: try fixing the whole string
  v = tryParseJsonArray(fixCommonJsonIssues(trimmed));
  if (v) return v;

  throw new Error('LLM response did not contain a valid JSON array of actions.');
}

/**
 * Call the LLM with a system prompt, user message, and optional notes context.
 * @param {string} systemPrompt
 * @param {string} userMessage
 * @param {Array<{id: number, content: string}>} notesContext
 * @returns {Promise<string>} raw text response
 * @throws {Error} on missing key or API failure
 */
async function callLLM(systemPrompt, userMessage, notesContext = []) {
  const { apiKey, model, baseURL } = getConfig();
  const useOllama = baseURL && baseURL.includes('11434');

  if (!useOllama && !apiKey) {
    throw new Error(
      'No LLM configured. Add openaiApiKey to config.json, set EASY_JOT_OPENAI_API_KEY, ' +
      'or enable Ollama with {"useOllama": true} in config.json.'
    );
  }

  const client = new OpenAI({ apiKey: apiKey || 'ollama', ...(baseURL ? { baseURL } : {}) });

  // Build notes context — image notes become placeholders so LLM knows they exist
  let fullUserMessage = userMessage;
  if (notesContext.length > 0) {
    const notesBlock = notesContext
      .map(n => n.content.startsWith('data:image/')
        ? `[Note ${n.id}]\n(image note)`
        : `[Note ${n.id}]\n${n.content.substring(0, 500)}`)
      .join('\n\n---\n\n');
    fullUserMessage = `${userMessage}\n\n===\nJots:\n\n${notesBlock}`;
  }

  const completion = await client.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user',   content: fullUserMessage },
    ],
  });

  return completion.choices[0].message.content;
}

/**
 * Call the LLM requesting a JSON array of actions.
 * @param {string} userMessage
 * @param {Array<{id: number, content: string}>} notesContext
 * @param {Array<{id: number, content: string, schedule_type: string, scheduled_time: string}>} remindersContext
 * @returns {Promise<Array<{type: string, payload: any}>>}
 * @throws {Error} on API failure or invalid JSON
 */
async function callLLMWithStructuredOutput(userMessage, notesContext = [], remindersContext = []) {
  const { apiKey, model, baseURL } = getConfig();
  const useOllama = baseURL && baseURL.includes('11434');

  if (!useOllama && !apiKey) {
    throw new Error(
      'No LLM configured. Add openaiApiKey to config.json, set EASY_JOT_OPENAI_API_KEY, ' +
      'or enable Ollama with {"useOllama": true} in config.json.'
    );
  }

  const client = new OpenAI({ apiKey: apiKey || 'ollama', ...(baseURL ? { baseURL } : {}) });

  let fullUserMessage = userMessage;

  // Notes context — image notes become placeholders
  if (notesContext.length > 0) {
    const notesBlock = notesContext
      .map(n => n.content.startsWith('data:image/')
        ? `[Note ${n.id}]\n(image note)`
        : `[Note ${n.id}]\n${n.content.substring(0, 500)}`)
      .join('\n\n---\n\n');
    fullUserMessage += `\n\n===\nNotes:\n\n${notesBlock}`;
  }

  // Scheduled reminders context
  if (remindersContext.length > 0) {
    const remindersBlock = remindersContext
      .map(r => `[Reminder ${r.id}] ${r.schedule_type} at ${r.scheduled_time} active:${r.active}\n${r.content.substring(0, 500)}`)
      .join('\n\n---\n\n');
    fullUserMessage += `\n\n===\nScheduled Reminders:\n\n${remindersBlock}`;
  }

  const completion = await client.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: STRUCTURED_SYSTEM_PROMPT },
      { role: 'user',   content: fullUserMessage },
    ],
  });

  const raw = completion.choices[0].message.content;
  try {
    return extractJsonArray(raw);
  } catch (_) {
    // Fallback: LLM returned prose or malformed JSON — treat as search
    const query = userMessage.slice(0, 80).replace(/"/g, '').trim() || 'notes';
    return [{ type: 'search', payload: { query } }];
  }
}

/**
 * User-facing agent / LLM error text (no secrets).
 * @param {unknown} err
 * @param {{ useOllama?: boolean, ollamaBaseURL?: string }} cfg from getConfig()
 */
function describeLLMError(err, cfg = {}) {
  const msg = (err && err.message) ? err.message : String(err);
  const useOllama = !!cfg.useOllama;
  const ollamaURL = cfg.ollamaBaseURL || 'http://localhost:11434/v1';

  if (/No LLM configured/i.test(msg)) return msg;

  const status = err && err.status;
  if (status === 401) {
    return 'LLM API rejected the key (401). Verify openaiApiKey in config.json or env EASY_JOT_OPENAI_API_KEY.';
  }
  if (status === 429) {
    return 'LLM rate limit (429). Wait and retry or switch model.';
  }

  const code = err && (err.code || (err.cause && err.cause.code));
  if (code === 'ECONNREFUSED') {
    return useOllama
      ? `Cannot reach Ollama (connection refused). Start the Ollama app or run \`ollama serve\`; expected ${ollamaURL}`
      : 'Connection refused to the LLM endpoint. Check firewall, VPN, or corporate proxy.';
  }
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') {
    return 'DNS lookup failed — check network connectivity.';
  }
  if (code === 'ETIMEDOUT' || code === 'UND_ERR_CONNECT_TIMEOUT') {
    return 'Connection timed out. Check network or VPN.';
  }

  if (/Connection error/i.test(msg) || /fetch failed/i.test(msg)) {
    return useOllama
      ? `${msg} (Ollama: ensure the server is running and ollamaBaseURL matches.)`
      : `${msg} (OpenAI: check internet access and that api.openai.com is reachable.)`;
  }

  return msg;
}

module.exports = { callLLM, callLLMWithStructuredOutput, describeLLMError };
