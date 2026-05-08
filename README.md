# Knoxnet System Designer

Free browser-based PDF markup, device layout, cable estimating, and bid
generator for AV, security, low-voltage, and network system designers.

Drop in architectural, civil, or MEP drawings, calibrate scale, place
devices, run cable, and export a branded deliverable plus a bid. It runs
locally in your browser: no server, no account, and no project data leaving
your machine.

[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)

## Demo

The demo shows the core workflow: install from GitHub, import a PDF plan,
place devices, review coverage, and export branded project documentation.

![Knoxnet System Designer demo](docs/demo.gif)

[Watch the 8-minute startup and quick demo video on YouTube.](https://www.youtube.com/watch?v=HnLf3ZR60c4)

<p align="center">
  <a href="https://www.youtube.com/watch?v=HnLf3ZR60c4">
    <img src="docs/demo/thumbnail-quick-demo.png" alt="Watch the Knoxnet System Designer startup and quick demo video" width="100%">
  </a>
</p>

<p align="center">
  <img src="docs/demo/install-terminal.jpeg" alt="Terminal showing clone, npm install, and npm run dev" width="48%">
  <img src="docs/demo/device-placement.jpeg" alt="Device placement and camera coverage on a PDF drawing" width="48%">
</p>

<p align="center">
  <img src="docs/demo/branded-cover-sheet.jpeg" alt="Branded project cover sheet export" width="72%">
</p>

## What It Does

Knoxnet System Designer turns a PDF plan into a working system-design and
estimating canvas. You can mark up drawings, place devices, run measured
cable paths, keep sheets organized, and generate customer-facing exports
without sending project files to a hosted backend.

Typical workflow:

1. **Create** a project with project number, client, and location.
2. **Add PDFs** from the architect's set.
3. **Calibrate** the first sheet: hit `K`, click two ends of a known
   dimension, and type the real distance.
4. **Place devices**: open the palette (`D`), pick a device, and click the
   sheet. Tags auto-increment.
5. **Run cable** (`C`): choose a cable type, click vertices, and double-click
   to finish. The length pill updates live.
6. **Annotate** with text, callouts, revision clouds, dimensions, arrows,
   rectangles, polygons, and freehand notes.
7. **Open the Bid panel** (`Cmd/Ctrl+B`) to review material, labor, overhead,
   tax, margin, and grand total.
8. **Tune rates** in Settings (`Cmd/Ctrl+,`).
9. **Export** a branded markup PDF, bid PDF, or editable XLSX workbook.

## Who It's For

- AV, security, low-voltage, and network system designers.
- Integrators who need quick plan markup plus a bid from the same drawing.
- Estimators who want device counts, cable schedules, and labor totals while
  they sketch.
- Small teams that prefer a local-first browser tool over an account-based
  hosted app.

## Features

| Capability | Notes |
|---|---|
| Multi-sheet projects | Drag in any number of PDFs; each becomes a navigable sheet with a thumbnail. |
| Scale calibration | Click two points on a known dimension, type the real distance. Per-sheet, recoverable. |
| Distance estimating | Cable runs, dimensions, and the cursor coordinates all read out in feet. |
| Device library | 60+ device types: cameras, access control, network, detection, A/V, audio, lighting, broadcast, site/fiber. |
| Auto-numbering | Devices get tags like CAM-01, AP-03, NID-02 automatically per-sheet. |
| Cable types | Cat6, Cat6A, Cat6 plenum, single/multi-mode fiber, RG6 coax, low-voltage, EMT conduit. Configurable slack %. |
| Markup tools | Select, pan, calibrate, device, cable, dimension, text, callout, revision cloud, rectangle, polygon, arrow, freehand. All vector. |
| Layers | Auto-layered by category: show, hide, or lock independently. |
| Live bid engine | BOM + cable schedule + labor + overhead + tax + margin + grand total. Updates as you draw. |
| Branded PDF export | Cover sheet + every sheet with a custom title block, legend, and bid summary appended. Markups embedded as vectors. |
| Bid exports | Branded PDF (customer or full-detail) and an XLSX workbook (Summary / Devices / Cables / Sheets / Warnings). |
| Local persistence | IndexedDB stores everything. Refresh, close the tab, and your projects come back. |
| Custom branding | Wordmark, tagline, accent color, logo, doc-code prefix; all editable in Settings. |
| UI polish | Dark workspace with dotted grid, glass floating toolbar, command palette, hotkeys, live status bar. |

### Hotkeys

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

### Branding

Open Settings (`Cmd/Ctrl+,`) -> **Branding** to set:

- Wordmark (primary + secondary, two-tone lockup)
- Tagline + full company name
- Accent color for the export accent strip
- Document code prefix, such as `KN` -> `KN-12345-R0`
- Optional logo (PNG / JPG), which replaces the built-in shield monogram

Brand settings stick across projects via `localStorage`, so every new project
starts already on-brand.

### Device And Cable Data

Devices live in [`src/data/devices.ts`](src/data/devices.ts). Each entry looks
like:

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

Path coordinates live in a 24x24 viewBox centered on (12, 12). `currentFill`
and `currentStroke` are remapped to the category color at render time so a
device renders identically in the palette, on the canvas, and in the exported
PDF.

Cables follow the same pattern in [`src/data/cables.ts`](src/data/cables.ts).

### Tech Stack

[React 18](https://react.dev),
[TypeScript](https://www.typescriptlang.org),
[Vite](https://vitejs.dev),
[Tailwind](https://tailwindcss.com),
[PDF.js](https://github.com/mozilla/pdf.js),
[react-konva](https://konvajs.org),
[pdf-lib](https://github.com/Hopding/pdf-lib),
[Zustand](https://github.com/pmndrs/zustand),
[Dexie](https://dexie.org) (IndexedDB),
[SheetJS](https://sheetjs.com), and
[lucide-react](https://lucide.dev).

### Project Structure

```text
.
├── public/
│   └── brand/                    Built-in shield + wordmark SVGs
└── src/
    ├── brand/                    Brand tokens + Wordmark / Monogram
    ├── data/                     devices, cables, defaults - pure data
    ├── store/                    Zustand project store
    ├── persist/                  Dexie IndexedDB layer
    ├── lib/                      pdfjs init, geometry, ingest, bid engine
    ├── components/               Workspace shell + editor + panels
    ├── hooks/                    Global hotkeys
    └── export/                   pdf-lib markup PDF, XLSX + bid PDF
```

## Quick Start

Requires Node.js 18+ and npm 9+.

```bash
git clone https://github.com/PhillipAlexanderYoung/knoxnet-system-designer.git
cd knoxnet-system-designer
npm install
npm run dev
```

Open the local Vite URL shown in the terminal, usually
`http://127.0.0.1:5173`, and click **Import PDFs** to begin.

For a production build:

```bash
npm run build         # outputs to dist/
npm run preview       # serves the build for verification
```

The build is a single static app. Drop `dist/` on any static host: Netlify,
Vercel, GitHub Pages, Cloudflare Pages, S3, or your own nginx. There is no
backend.

## Privacy / Local First

Everything stays local. Projects, PDFs, branding, and bid settings are stored
in your browser's IndexedDB. The app does not require an account and does not
track usage.

The only network requests are the two web-font CDN fetches in `index.html`
(Inter and JetBrains Mono). You can self-host both if you'd rather not hit a
CDN.

## Roadmap

- Keep expanding the device and cable catalogs from real-world AV, security,
  low-voltage, and network workflows.
- Improve export polish for customer-facing markup and bid packages.
- Add refinements based on installer, estimator, and designer feedback.

## Feedback / Contributions

PRs are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for local development
notes and contribution guidance.

If you run into a workflow issue, a short recording or screenshot is especially
helpful.

## License

[Apache License 2.0](LICENSE) - free for commercial and personal use, modify
and redistribute as you like, just keep the notice. See [NOTICE](NOTICE) and
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for the full attribution
detail.
