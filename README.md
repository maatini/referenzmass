# Tauri + SvelteKit

This template should help get you started developing with Tauri and SvelteKit in Vite.

**ReferenzMaß** – Photogrammetry measurement desktop application.

## Recommended IDE Setup

[VS Code](https://code.visualstudio.com/) + [Svelte](https://marketplace.visualstudio.com/items?itemName=svelte.svelte-vscode) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer).

## Testing

### Unit & Component Tests (Vitest)

Fast tests for domain logic and component behavior:

```bash
pnpm test
```

### End-to-End Tests (Playwright)

Real browser tests that exercise the Konva canvas, drawing interactions, calibration and measurement workflows:

```bash
pnpm test:e2e          # headless
pnpm test:e2e:ui       # interactive UI mode (recommended)
pnpm test:e2e:headed   # visible browser window
```

See [e2e/README.md](e2e/README.md) for details and scope.

**Note**: These are frontend E2E tests (run against the Vite dev server). They do not launch the native Tauri binary or real system dialogs (macOS-friendly approach). Native behavior is covered by the Rust unit tests in `src-tauri/`.
