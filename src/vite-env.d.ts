/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_BRIDGETHING_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
