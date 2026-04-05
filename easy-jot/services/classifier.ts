export type EntryType = 'task' | 'note' | 'idea';

const TASK_RE = /\b(email|call|schedule|send)\b/i;

/**
 * MVP: keyword + prefix rules — no LLM.
 */
export function classifyEntry(text: string): EntryType {
  const t = text.trim();
  if (/^idea\s*:/i.test(t)) return 'idea';
  if (TASK_RE.test(t)) return 'task';
  return 'note';
}

/**
 * Very small time hints → ISO remind_at (local-ish via Date).
 */
export function extractRemindAt(text: string): string | null {
  const t = text.toLowerCase();
  const now = new Date();
  if (/\btomorrow\b/.test(t)) {
    const d = new Date(now);
    d.setDate(d.getDate() + 1);
    d.setHours(9, 0, 0, 0);
    return d.toISOString();
  }
  if (/\bnext week\b/.test(t)) {
    const d = new Date(now);
    d.setDate(d.getDate() + 7);
    d.setHours(9, 0, 0, 0);
    return d.toISOString();
  }
  if (/\blater\b/.test(t)) {
    return new Date(now.getTime() + 3 * 60 * 60 * 1000).toISOString();
  }
  return null;
}
