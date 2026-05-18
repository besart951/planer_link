# Besmir Spitex Einsatzplanung

SvelteKit SSR and Tauri app served under `/besmir`. It provides simplified Spitex scheduling with employees, client templates, concrete appointments, PDF/Excel export and authenticated sync.

## Development

```sh
pnpm install
pnpm dev
```

Open `http://localhost:5173/besmir`.

## Production

The app uses `@sveltejs/adapter-node` and listens on port `3000` in Docker. The root `Caddyfile` routes `cloud.besi94.ch/besmir*` to this service.

## Windows Installer

Build the Tauri app on Windows with:

```sh
pnpm tauri:build:windows
```

The newest NSIS installer is staged to `releases/besmir-spitex-einsatzplanung-windows.exe`.
The `/besmir/windows-download` endpoint serves that file after the configured password is posted.
