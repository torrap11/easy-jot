'use strict';

/**
 * voice.js – Speech-to-text transcription (main process only).
 *
 * Uses **Smallest AI Pulse** only (`smallestAiKey` / SMALLEST_AI_KEY).
 * OpenAI is reserved for the agent LLM (GPT) and intent parsing — not for STT.
 *
 * Docs: https://waves-docs.smallest.ai/
 */

const { getConfig } = require('./config');

// Smallest AI Pulse STT endpoint
const PULSE_ENDPOINT = 'https://waves-api.smallest.ai/api/v1/pulse/get_text';
const STT_TIMEOUT_MS = 30_000;

/**
 * Transcribe audio using Smallest AI Pulse.
 * Returns { transcript, words } where words is an array of timed tokens.
 *
 * @param {Buffer} audioBuffer  – WebM/Opus audio from MediaRecorder
 * @param {string} apiKey
 * @param {string} language     – BCP-47 code, e.g. "en"
 * @returns {Promise<{ transcript: string, words: Array }>}
 */
async function transcribeWithPulse(audioBuffer, apiKey, language = 'en') {
  const params = new URLSearchParams({
    language,
    word_timestamps: 'true',
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), STT_TIMEOUT_MS);

  try {
    const response = await fetch(`${PULSE_ENDPOINT}?${params}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type':  'audio/webm',
      },
      body: audioBuffer,
      signal: controller.signal,
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`Pulse STT ${response.status}: ${body.slice(0, 200)}`);
    }

    const data = await response.json();

    if (data.status && data.status !== 'success') {
      throw new Error(`Pulse STT failed: ${data.message || JSON.stringify(data)}`);
    }

    return {
      transcript: (data.transcription || '').trim(),
      words:      data.words || [],
    };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Transcribe a raw audio Buffer via Smallest AI Pulse.
 *
 * @returns {Promise<{ transcript: string, words: Array, provider: 'pulse' }>}
 */
async function transcribeAudio(audioBuffer) {
  const cfg = getConfig();

  if (!cfg.smallestAiKey) {
    throw new Error(
      'Voice input needs a Smallest AI key.\n' +
      'Set smallestAiKey in config.json or SMALLEST_AI_KEY / EASY_JOT_SMALLEST_AI_KEY in the environment.\n' +
      '(OpenAI is used only for the GPT agent, not speech-to-text.)'
    );
  }

  const { transcript, words } = await transcribeWithPulse(
    audioBuffer,
    cfg.smallestAiKey,
    cfg.sttLanguage,
  );
  return { transcript, words, provider: 'pulse' };
}

module.exports = { transcribeAudio };
