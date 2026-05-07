# Third-party notices

Knoxnet System Designer is built on top of a number of excellent
open-source libraries. This file lists every direct runtime and build
dependency along with its license. All licenses are permissive
(MIT / Apache-2.0 / ISC / BSD) and compatible with the project's
own Apache-2.0 license.

When you build the app with `npm run build`, code from these libraries
is bundled into the `dist/` output. If you redistribute that build, you
should retain this file (or an equivalent attribution) alongside it.

## Runtime dependencies

| Package | License | Project |
|---|---|---|
| react | MIT | https://github.com/facebook/react |
| react-dom | MIT | https://github.com/facebook/react |
| zustand | MIT | https://github.com/pmndrs/zustand |
| dexie | Apache-2.0 | https://github.com/dexie/Dexie.js |
| konva | MIT | https://github.com/konvajs/konva |
| react-konva | MIT | https://github.com/konvajs/react-konva |
| pdfjs-dist | Apache-2.0 | https://github.com/mozilla/pdf.js |
| pdf-lib | MIT | https://github.com/Hopding/pdf-lib |
| xlsx (SheetJS Community Edition) | Apache-2.0 | https://github.com/SheetJS/sheetjs |
| lucide-react | ISC | https://github.com/lucide-icons/lucide |

## Build / dev dependencies

| Package | License | Project |
|---|---|---|
| typescript | Apache-2.0 | https://github.com/microsoft/TypeScript |
| vite | MIT | https://github.com/vitejs/vite |
| @vitejs/plugin-react | MIT | https://github.com/vitejs/vite-plugin-react |
| tailwindcss | MIT | https://github.com/tailwindlabs/tailwindcss |
| postcss | MIT | https://github.com/postcss/postcss |
| autoprefixer | MIT | https://github.com/postcss/autoprefixer |
| @types/react | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped |
| @types/react-dom | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped |

## Fonts loaded at runtime from CDNs

The shipped `index.html` references the following web fonts via public
CDNs. They are not bundled with this repository — your browser fetches
them when the page loads.

- **Inter** by Rasmus Andersson — SIL Open Font License 1.1.
  https://rsms.me/inter/
- **JetBrains Mono** by JetBrains — SIL Open Font License 1.1.
  https://www.jetbrains.com/lp/mono/

## License texts

The full text of the Apache License 2.0 is included in [LICENSE](LICENSE).

For the full text of the MIT, ISC, and BSD licenses governing the
dependencies above, see the `LICENSE` file inside each package's
directory under `node_modules/` after running `npm install`. Each
package's `package.json` `license` field is the authoritative source for
the license that applies to it.

If you spot an attribution mistake or missing entry, please open an
issue or pull request.
