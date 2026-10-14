# FF Print

A desktop slicer built for one printer: the **Creality Ender-3 V3 SE**, printing from an SD card.

Instead of hundreds of settings for every machine, FF Print has a handful of plain-language choices
(quality, strength, supports, adhesion) tuned for this printer, with everything else one search away
under More settings. It slices with a headless [OrcaSlicer](https://github.com/SoftFever/OrcaSlicer)
engine and saves straight to the printer's SD card.

- Real-scale V3 SE bed with its plate markings; move, rotate, scale, lay flat and arrange models
- Opens STL, OBJ and 3MF, including Creality Print and Orca projects (their print settings come along)
- Live slicing progress, a layer-by-layer toolpath preview with a feature legend
- Filament library, saved setups, history with real print times that correct future estimates
- Light and dark themes
- A local MCP server so Claude Code (or any MCP client) can drive everything the app can do

## Run it

Windows, Node 22+, pnpm.

```bash
pnpm install
pnpm fetch-engine   # downloads the OrcaSlicer 2.4.2 portable build into engine/ (git-ignored)
pnpm dev
```

`pnpm build:win` makes an installer in `release/`. `pnpm test` runs the unit and engine tests;
`node scripts/e2e.mjs` runs the end-to-end suite against `pnpm build` output.

## Stack

Electron, electron-vite, Vue 3, TypeScript, three.js. Slicing runs the OrcaSlicer CLI in a child
process (`src/main/engine`); the automation server is in `src/main/automation`.

## Credits

The bed model, plate artwork, filament presets and print tuning come from Creality Print, and the
slicing engine and its printer profiles are OrcaSlicer's. Both are AGPL-3.0 projects. Creality and
Ender are trademarks of Creality. FF Print is an independent project, not affiliated with either.
