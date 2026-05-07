# Contributing

Thanks for considering a contribution. This project is fully free and
open under the Apache-2.0 license — bug reports, feature requests, and
pull requests are welcome.

## Run the dev server

```bash
git clone https://github.com/PhillipAlexanderYoung/knoxnet-system-designer.git
cd knoxnet-system-designer
npm install
npm run dev          # http://127.0.0.1:5173
```

You'll need Node.js 18+ and npm 9+.

## Where things live

| Area | Path |
|---|---|
| App entry | [`src/main.tsx`](src/main.tsx), [`src/App.tsx`](src/App.tsx) |
| Workspace shell + canvas | [`src/components/`](src/components/) |
| Device library (add devices here) | [`src/data/devices.ts`](src/data/devices.ts) |
| Cable types (add cables here) | [`src/data/cables.ts`](src/data/cables.ts) |
| Coverage / lens presets | [`src/data/coveragePresets.ts`](src/data/coveragePresets.ts), [`src/data/lenses.ts`](src/data/lenses.ts) |
| Rack hardware library | [`src/data/rackDevices.ts`](src/data/rackDevices.ts) |
| Default bid + project settings | [`src/data/defaults.ts`](src/data/defaults.ts) |
| Brand tokens + defaults | [`src/brand/tokens.ts`](src/brand/tokens.ts), [`src/lib/branding.ts`](src/lib/branding.ts) |
| State (Zustand store) | [`src/store/projectStore.ts`](src/store/projectStore.ts) |
| Persistence (Dexie / IndexedDB) | [`src/persist/db.ts`](src/persist/db.ts) |
| Bid engine | [`src/lib/bid.ts`](src/lib/bid.ts), [`src/lib/pricing.ts`](src/lib/pricing.ts) |
| PDF / XLSX export | [`src/export/`](src/export/) |
| Hotkeys | [`src/hooks/`](src/hooks/) |

## Adding a device

Edit [`src/data/devices.ts`](src/data/devices.ts) and add an entry like:

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

## Pull request guidelines

- Keep changes focused — one logical change per PR.
- Match the surrounding code style (Prettier defaults, no enforced
  linter yet).
- Add a short note to the PR description about what changed and why.
- For bug fixes, include the reproduction steps; for features, a screen
  recording or screenshot is great.

By submitting a contribution, you agree that it is licensed under the
Apache License, Version 2.0 — same as the rest of the project. See
[LICENSE](LICENSE) for the full text.

## Code of conduct

Be kind. Assume good faith. Disagree on the design, not on the person.

## License

Apache-2.0 — see [LICENSE](LICENSE) and [NOTICE](NOTICE).
