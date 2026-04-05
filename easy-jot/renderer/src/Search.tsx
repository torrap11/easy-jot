import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import type { SearchResult } from './vite-env';

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function highlightText(text: string, query: string): ReactNode {
  const terms = query
    .trim()
    .split(/\s+/)
    .filter((w) => w.length >= 2);
  if (terms.length === 0) return text;
  const re = new RegExp(`(${terms.map(escapeRegex).join('|')})`, 'gi');
  const nodes: ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  const r = new RegExp(re.source, re.flags);
  while ((m = r.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    nodes.push(
      <mark key={`${m.index}-${m[0]}`} className="hl">
        {m[0]}
      </mark>,
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return <>{nodes}</>;
}

function formatRelativeTime(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '';
  const diff = Math.max(0, Date.now() - t);
  const sec = Math.floor(diff / 1000);
  if (sec < 45) return 'just now';
  if (sec < 90) return '1 minute ago';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} minutes ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} hour${hr === 1 ? '' : 's'} ago`;
  const d = Math.floor(hr / 24);
  return `${d} day${d === 1 ? '' : 's'} ago`;
}

export function Search() {
  const input = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [sel, setSel] = useState(0);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const off = window.memory.onFocusInput(() => {
      queueMicrotask(() => input.current?.focus());
    });
    queueMicrotask(() => input.current?.focus());
    return off;
  }, []);

  const run = useCallback(async (query: string) => {
    if (!query.trim()) {
      setResults([]);
      setErr(null);
      return;
    }
    const res = await window.memory.search(query);
    if (res.ok) {
      setErr(null);
      setResults(res.results);
      setSel(0);
    } else {
      setErr(res.error);
      setResults([]);
    }
  }, []);

  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => {
      void run(q);
    }, 180);
    return () => {
      if (debounce.current) clearTimeout(debounce.current);
    };
  }, [q, run]);

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      window.memory.hideSearch();
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSel((i) => Math.min(i + 1, Math.max(0, results.length - 1)));
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSel((i) => Math.max(i - 1, 0));
      return;
    }
    if (e.key === 'Enter' && results.length > 0) {
      e.preventDefault();
      const row = results[sel];
      if (row) void window.memory.copyText(row.content);
    }
  };

  return (
    <div className="panel search">
      <input
        ref={input}
        className="query"
        type="search"
        placeholder="Semantic search…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={onKeyDown}
        autoComplete="off"
      />
      {err ? <div className="error">{err}</div> : null}
      <ul className="results" role="listbox" aria-activedescendant={results[sel]?.id}>
        {results.map((r, i) => (
          <li
            key={r.id}
            id={r.id}
            className={i === sel ? 'row active' : 'row'}
            role="option"
            aria-selected={i === sel}
          >
            <span className="type">{r.type}</span>
            <span className="snippet">{highlightText(r.content, q)}</span>
            <span className="when">{formatRelativeTime(r.created_at)}</span>
            <span className="score">{r.score.toFixed(3)}</span>
          </li>
        ))}
      </ul>
      <div className="hint">↑↓ select · Enter copy · Esc close</div>
    </div>
  );
}
