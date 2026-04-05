import { useEffect, useState } from 'react';

export function Overlay() {
  const [text, setText] = useState('');

  useEffect(() => {
    const prevBody = document.body.style.background;
    const prevRoot = document.documentElement.style.background;
    document.body.style.background = 'transparent';
    document.documentElement.style.background = 'transparent';
    return () => {
      document.body.style.background = prevBody;
      document.documentElement.style.background = prevRoot;
    };
  }, []);

  useEffect(() => {
    return window.memory.onOverlayShow((t) => setText(t));
  }, []);

  return (
    <div className="overlay-wrap">
      <div className="overlay-card">
        <div className="overlay-text">{text}</div>
      </div>
    </div>
  );
}
