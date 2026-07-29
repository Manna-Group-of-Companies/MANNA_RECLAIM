/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string;
  readonly VITE_APP_NAME: string;
  readonly VITE_ENABLE_DEVTOOLS?: string;
  readonly VITE_COSTING_PASSCODE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
