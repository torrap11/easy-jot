import { useCallback, useEffect, useRef, useState } from 'react';

export function Capture() {
  const ta = useRef<HTMLTextAreaElement>(null);
  const [status, setStatus] = useState('');

  useEffect(() => {
    const off = window.memory.onFocusInput(() => {
      queueMicrotask(() => ta.current?.focus());
    });
    queueMicrotask(() => ta.current?.focus());
    return off;
  }, []);

  const submit = useCallback(async () => {
    const text = ta.current?.value ?? '';
    if (!text.trim()) return;
    const res = await window.memory.saveEntry(text);
    if (res.ok) {
      if (ta.current) ta.current.value = '';
      setStatus('Saved');
      window.setTimeout(() => setStatus(''), 1200);
      window.memory.hideCapture();
    } else {
      setStatus(res.error ?? 'Error');
    }
  }, []);

  return (
    <div className="panel capture">
      <textarea
        ref={ta}
        className="input"
        placeholder="Remember… (Enter save · Shift+Enter newline · Esc close)"
        rows={4}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            window.memory.hideCapture();
            return;
          }
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            void submit();
          }
        }}
      />
      {status ? <div className="hint">{status}</div> : null}
    </div>
  );
}
