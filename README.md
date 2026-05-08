# Knoxnet System Designer

> A free, browser-based PDF markup, device layout, and bid generator for
> AV / security / network system designers. Drop in any architectural,
> civil, or MEP drawing, calibrate scale, place devices, run cable, and
> export a fully branded deliverable plus a real bid — all locally, no
> server, no account, no data leaving your machine.

[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)

<p align="center">
  <a href="https://www.youtube.com/watch?v=HnLf3ZR60c4">
    <img src="docs/demo/thumbnail-quick-demo.png" alt="Watch the Knoxnet System Designer startup and quick demo video" width="100%">
  </a>
</p>

## Demo preview

[Watch the 8-minute startup and quick demo video on YouTube.](https://www.youtube.com/watch?v=HnLf3ZR60c4)

Install from GitHub, open the local browser app, mark up a PDF plan with
devices and coverage, then export a branded customer deliverable.

<p align="center">
  <img src="docs/demo/install-terminal.jpeg" alt="Terminal showing clone, npm install, and npm run dev" width="48%">
  <img src="docs/demo/device-placement.jpeg" alt="Device placement and camera coverage on a PDF drawing" width="48%">
</p>

<p align="center">
  <img src="docs/demo/branded-cover-sheet.jpeg" alt="Branded project cover sheet export" width="72%">
</p>

## Quick start

```bash
git clone https://github.com/PhillipAlexanderYoung/knoxnet-system-designer.git
cd knoxnet-system-designer
npm install
npm run dev
```

Open http://127.0.0.1:5173 and click **Import PDFs** to begin. Requires
Node.js 18+ and npm 9+.

## What it does

| Capability | Notes |
|---|---|
| Multi-sheet projects | Drag in any number of PDFs; each becomes a navigable sheet with a thumbnail. |
| Scale calibration | Click two points on a known dimension, type the real distance. Per-sheet, recoverable. |
| Distance estimating | Cable runs, dimensions, and the cursor coordinates all read out in feet. |
| Device library | 60+ device types: cameras, access control, network, detection, A/V, audio, lighting, broadcast, site/fiber. |
| Auto-numbering | Devices get tags like CAM-01, AP-03, NID-02 automatically per-sheet. |
| Cable types | Cat6, Cat6A, Cat6 plenum, single/multi-mode fiber, RG6 coax, low-voltage, EMT conduit. Configurable slack %. |
| Markup tools | Select, pan, calibrate, device, cable, dimension, text, callout, revision cloud, rectangle, polygon, arrow, freehand. All vector. |
| Layers | Auto-layered by category — show / hide / lock independently. |
| Live bid engine | BOM + cable schedule + labor + overhead + tax + margin + grand total. Updates as you draw. |
| Branded PDF export | Cover sheet + every sheet with a custom title block, legend, and bid summary appended. Markups embedded as vectors. |
| Bid exports | Branded PDF (customer or full-detail) and an XLSX workbook (Summary / Devices / Cables / Sheets / Warnings). |
| Local persistence | IndexedDB stores everything. Refresh, close the tab, your projects come back. |
| Custom branding | Wordmark, tagline, accent color, logo, doc-code prefix — all editable in Settings. |
| UI polish | Dark workspace with dotted grid, glass floating toolbar, command palette, hotkeys, live status bar. |

## Workflow

1. **Create** a project — fill in project number / client / location.
2. **Add PDFs** from the architect's set.
3. **Calibrate** the first sheet: hit `K`, click two ends of a known
   dimension, type the real distance.
4. **Place devices** — open the palette (`D`), pick a device, click the
   sheet. Tags auto-increment.
5. **Run cable** (`C`). Pick a cable type from the toolbar. Click vertices,
   double-click to finish. Length pill updates live.
6. **Annotate** — text, callouts, revision clouds, dimensions.
7. **Open the Bid panel** (`Cmd/Ctrl+B`) — material, labor, overhead,
   tax, margin, and grand total update live.
8. **Tune rates** in Settings (`Cmd/Ctrl+,`).
9. **Export**:
   - **Branded markup PDF** — cover + every sheet with title block,
     legend, and BOM appended.
   - **Bid PDF** — single-page customer or full-detail summary.
   - **Bid XLSX** — full workbook the office can edit.

## Hotkeys

| Key | Tool |
|---|---|
| `V` | Select |
| `H` | Pan |
| `K` | Calibrate Scale |
| `D` | Place Device |
| `C` | Cable Run |
| `M` | Dimension |
| `T` | Text |
| `L` | Callout |
| `O` | Revision Cloud |
| `R` | Rectangle |
| `P` | Polygon |
| `A` | Arrow |
| `F` | Freehand |
| `Cmd/Ctrl+K` | Command Palette |
| `Cmd/Ctrl+B` | Bid Panel |
| `Cmd/Ctrl+,` | Settings |
| `Esc` | Cancel current tool gesture / clear selection |
| `Delete` | Delete selected markups |
| Hold `Space` | Temporary pan |

## Customize your brand

Open Settings (`Cmd/Ctrl+,`) → **Branding** to set:

- Wordmark (primary + secondary, two-tone lockup)
- Tagline + full company name
- Accent color (drives the amber bar / accent strip across the export)
- Document code prefix (e.g. `KN` → `KN-12345-R0`)
- Optional logo (PNG / JPG) — replaces the built-in shield monogram
  everywhere

Your brand settings stick across projects via `localStorage`, so every
new project you create starts already on-brand.

## Add devices and cables

Devices live in [`src/data/devices.ts`](src/data/devices.ts). Each
entry looks like:

```ts
{
  id: "cam-something",
  label: "Display Name",
  shortCode: "CAM",
  category: "cameras",
  defaultCost: 425,
  laborHours: 1.25,
  icon: { paths: [{ d: "M2 12 a10 10 0 0 1 20 0 z", fill: "currentFill" }] },
}
```

Path coordinates live in a 24x24 viewBox centered on (12, 12).
`currentFill` and `currentStroke` are remapped to the category color at
render time so a device renders identically in the palette, on the
canvas, and in the exported PDF.

Cables follow the same pattern in
[`src/data/cables.ts`](src/data/cables.ts).

## Architecture

```
.
├── public/
│   └── brand/                    Built-in shield + wordmark SVGs
└── src/
    ├── brand/                    Brand tokens + Wordmark / Monogram
    ├── data/                     devices, cables, defaults — pure data
    ├── store/                    Zustand project store
    ├── persist/                  Dexie IndexedDB layer
    ├── lib/                      pdfjs init, geometry, ingest, bid engine
    ├── components/               Workspace shell + editor + panels
    ├── hooks/                    Global hotkeys
    └── export/                   pdf-lib markup PDF, XLSX + bid PDF
```

## Tech stack

[React 18](https://react.dev) ·
[TypeScript](https://www.typescriptlang.org) ·
[Vite](https://vitejs.dev) ·
[Tailwind](https://tailwindcss.com) ·
[PDF.js](https://github.com/mozilla/pdf.js) ·
[react-konva](https://konvajs.org) ·
[pdf-lib](https://github.com/Hopding/pdf-lib) ·
[Zustand](https://github.com/pmndrs/zustand) ·
[Dexie](https://dexie.org) (IndexedDB) ·
[SheetJS](https://sheetjs.com) ·
[lucide-react](https://lucide.dev)

## Production build

```bash
npm run build         # outputs to dist/
npm run preview       # serves the build for verification
```

The build is a single HTML page (~600 kB gzipped JS plus ~5 kB CSS).
Drop `dist/` on any static host — Netlify, Vercel, GitHub Pages,
Cloudflare Pages, S3, or your own nginx — and it works. There is no
backend.

## Privacy

Everything stays local. Projects, PDFs, branding, and bid settings are
stored in your browser's IndexedDB. The app does not phone home, does
not require an account, and does not track usage. The only network
requests are the two web-font CDN fetches in `index.html` (Inter and
JetBrains Mono); you can self-host both if you'd rather not hit a CDN.

## Contributing

PRs welcome — see [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[Apache License 2.0](LICENSE) — free for commercial and personal use,
modify and redistribute as you like, just keep the notice. See
[NOTICE](NOTICE) and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)
for the full attribution detail.
