/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL of the Schema-Watch API. Empty in dev, where Vite proxies /api. */
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
