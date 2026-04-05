import { useEffect, useState } from 'react';
import { Capture } from './Capture';
import { Search } from './Search';
import { Overlay } from './Overlay';

function getMode(): 'capture' | 'search' | 'overlay' {
  const h = window.location.hash.replace(/^#/, '');
  if (h === 'search') return 'search';
  if (h === 'overlay') return 'overlay';
  return 'capture';
}

export function App() {
  const [mode, setMode] = useState(getMode);

  useEffect(() => {
    const onHash = () => setMode(getMode());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  if (mode === 'search') return <Search />;
  if (mode === 'overlay') return <Overlay />;
  return <Capture />;
}
