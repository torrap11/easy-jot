/// <reference types="vite/client" />

export type SaveResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

export type SearchResult = {
  id: string;
  content: string;
  type: string;
  score: number;
  created_at: string;
};

export type SearchResponse =
  | { ok: true; results: SearchResult[] }
  | { ok: false; error: string };

declare global {
  interface Window {
    memory: {
      saveEntry: (content: string) => Promise<SaveResult>;
      search: (query: string) => Promise<SearchResponse>;
      hideCapture: () => void;
      hideSearch: () => void;
      copyText: (text: string) => Promise<void>;
      onFocusInput: (cb: () => void) => () => void;
      onOverlayShow: (cb: (text: string) => void) => () => void;
    };
  }
}

export {};
