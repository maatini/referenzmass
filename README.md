# ReferenzMaß

Desktop-App für photogrammetrische Maße: Foto laden, kalibrieren, Strecken messen, als CSV exportieren.

- **Line-Kalibrierung** — Referenzstrecke mit bekannter realer Länge
- **Plane-Kalibrierung** — 4 Punkte + Homographie für perspektivische Ebenen
- Messlinien mit Label/Notizen, Loupe, Zoom/Pan
- Projekt speichern/laden (JSON über Tauri)

Version `0.1.0` · Identifier `de.referenzmass.app` · Status: nutzbar, Persistenz noch nicht produktionsreif (siehe unten).

## Stack

Tauri 2 · Svelte 5 (Runes) · SvelteKit (`adapter-static`) · Konva 10 · Vitest · Playwright · Rust (dünnes IPC)

Domain liegt in `src/lib/` (kein UI). Canvas-UI in `CalibrationCanvas.svelte`.

## Setup

Voraussetzung: [devbox](https://www.jetify.com/devbox) **oder** Node 20, pnpm 9.12.3, Rust stable, Tauri-Systemdeps.

```bash
devbox shell          # Node, pnpm, rustup, clippy/rustfmt
pnpm install
pnpm tauri dev        # oder: devbox run dev
```

Ohne Devbox: [Tauri-Prerequisites](https://v2.tauri.app/start/prerequisites/) + `pnpm install`.

## Befehle

| Befehl | Was |
|---|---|
| `pnpm tauri dev` | Native App + Vite auf Port 1420 |
| `pnpm test` | Vitest, einmalig (`vitest run`) |
| `pnpm test:watch` | Vitest Watch |
| `pnpm check` | `svelte-kit sync` + `svelte-check` (derzeit 4 vorbestehende Fehler) |
| `pnpm test:rust` | `cargo test` in `src-tauri` |
| `pnpm check:all` | check + Vitest + Rust |
| `pnpm test:e2e` | Playwright gegen Vite (kein natives Tauri) |

## Bekannte Lücken (P0)

Serde-camelCase, Restore der Referenzgeometrie und Originalpixel-Koordinaten sind erledigt. Offen: Messungs-Drag nutzt noch `dist * calibration.scale` statt `measure()` (Plane falsch); Delete/Backspace löscht Messungen auch in Inputs. Details: [`AGENTS.md`](./AGENTS.md), Stand: [`HANDOFF.md`](./HANDOFF.md).

## Docs

| Datei | Rolle |
|---|---|
| [`AGENTS.md`](./AGENTS.md) | Regeln für Agenten (Stack, Befehle, P0, Constraints) |
| [`HANDOFF.md`](./HANDOFF.md) | Session-Stand, nächster Schritt |
| [`e2e/README.md`](./e2e/README.md) | Playwright-Scope |
| `docs/status-2026-05-23.md` | Historischer Sprint-Stand |
| `docs/improvement-plan.md` | Historischer Plan (teilweise erledigt, nicht das Backlog) |
| `docs/edge-detection-plan.md` | Geplantes Canny/Snap — nicht vor P0 |

IDE: VS Code + Svelte + Tauri + rust-analyzer (siehe `.vscode/extensions.json`).
