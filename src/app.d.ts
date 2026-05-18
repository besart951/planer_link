declare global {
  namespace App {}

  interface ImportMetaEnv {
    readonly VITE_BUILD_TARGET?: 'web' | 'desktop';
  }
}

export {};
