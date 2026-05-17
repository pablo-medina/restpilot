# RestPilot

RestPilot is a lightweight, local-first desktop REST API client with a minimal, calm interface.

- Low footprint desktop app powered by Tauri.
- No account, cloud sync, or online workspace required.
- Cross-platform target: Windows, Linux, and macOS.
- Native HTTP execution, so requests are not limited by browser CORS.
- Simple request builder with headers, body, status, timing, response body, and response headers.

The Windows executable is **`rp.exe`**.

## Author

Pablo Medina

## License

MIT

## Development

```bash
npm install
npm run tauri:dev
```

## Tests

```bash
npm test
```

Runs unit tests locally (Vitest). There is no CI workflow on push.

## Build

```bash
npm run tauri:build
```
