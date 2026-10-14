# FF Print — Plan v1

A desktop slicer for one machine: Fakhrul's **Creality Ender-3 V3 SE**, printing from SD card, no
network. It replaces Creality Print, which is cluttered, generic (hundreds of printers, hundreds of
knobs), cloud-minded and ships profiles that disagree with this printer's firmware.

FF Print does **not** implement slicing. OrcaSlicer's engine runs headless underneath; FF Print owns
everything around it: the bed, the models, a small set of settings that matter, filament library,
preview, file handling and the SD card. Hardware integration (USB / host) is a later project; the
architecture leaves room for a second "send" target next to "Save to SD".

## 1. Engine (verified 2026-10-14)

- OrcaSlicer **2.4.2** portable (`engine/orca/`, git-ignored, fetched by `scripts/fetch-engine.mjs`).
- Invocation, proven on this machine:

  ```
  orca-slicer.exe --arrange 0 --slice 0
    --load-settings "machine.json;process.json" --load-filaments filament.json
    --outputdir <dir> scene.3mf
  ```

  -> `<dir>/plate_1.gcode`. A 20 mm cube slices in ~1 s. Exit code 0 = success; negative codes are the
  CLI's `cli_errors` table (e.g. -17 process not compatible with printer).
- **Profiles must be flattened** (inherits resolved) and marked `"from": "system"`. The CLI matches the
  process's `compatible_printers` against the machine **name** only when the machine is a system
  preset; a user preset is matched by its `inherits`, which a flattened file no longer has -> -17.
- **`--arrange 0` is required.** Without it the CLI re-arranges a plain 3MF and ignores our placement.
  With it, build-item transforms (translate, rotate, non-uniform scale) are honoured exactly.
- The G-code starts with `;FLAVOR:Marlin` `;TIME:` `;Filament used:` `;Layer height:` — exactly the
  header the stock V3 SE screen reads. Footer carries `; filament used [mm|cm3|g]`,
  `; estimated printing time (normal mode)`, and the full config as `; key = value`.
- Feature types appear as `;TYPE:<name>`, layers as `;LAYER_CHANGE` + `;Z:` + `;HEIGHT:`.

## 2. Machine facts that shape the defaults (docs research, reports/Ender 3 V3 SE software stack.md)

- Bed 220 x 220, Z 250. Marlin 2.0.8-based stock firmware (V1.0.6 on C13 boards).
- Firmware limits: accel 2500 default / 4000 max, max feed X/Y 500, **Z 5 mm/s**, E 30,
  junction deviation 0.1, input shaping on (X 42 / Y 40 Hz), **linear advance compiled out**
  (pressure advance in the slicer does nothing), firmware retraction off, G2/G3 arcs on, M600 on.
- Bed mesh: 4x4, re-enabled by the firmware after every `G28` -> start G-code needs no G29/M420.
- Auto Z-offset (strain gauge, `M8015`) is a firmware/screen routine — **never** in start G-code.
- Screen ignores thumbnails (disabled in firmware) -> FF Print writes none.
- Stock/Orca purge line uses absolute E without `M82` -> after a cancelled print left the printer in
  relative mode it extrudes 45 mm. FF Print's start G-code sets `G90` + `M82` before the purge and
  `M83` after (Orca emits relative E).
- Creality Print's machine profile exceeds the firmware (5000 accel, Z 30). FF Print clamps every
  motion setting to the firmware limits above.

## 3. Stack

Same proven base as Cubby, different look:
Electron 44 + electron-vite 5 + Vue 3.5 + TypeScript, three.js (viewport + preview), fflate (3MF zip),
zod at the IPC boundary. JSON files in userData for state (small, human-readable). pnpm, hoisted.

```
src/shared/      contract.ts (IPC API), machine.ts (V3 SE constants), settings.ts (settings catalogue
                 + presets + mapping to Orca keys), types.ts
src/main/        index.ts, ipc.ts, store.ts (atomic JSON), engine/{profiles,threemf,slice,gcode}.ts,
                 sd.ts (removable drives, write, eject), files.ts (open/save, projects, recent),
                 history.ts
src/preload/     typed bridge: invoke + events + pathForFile
src/renderer/    App shell, ui/ primitives, viewport/, panels/, preview/, pages/
```

Data flow: renderer loads a model file (bytes over IPC) -> three.js geometry (STL/OBJ/3MF loaders) ->
scene objects with transforms. **Slice** sends unique meshes (triangle soup Float32Array) + instance
matrices + resolved settings -> main writes `scene.3mf`, writes the three flattened profiles with
overrides applied, runs the engine (cancellable), parses stats, returns the G-code path. Preview parses
the G-code in a Web Worker.

## 4. Product

### Layout (one window, two modes)
- **Top bar**: file actions (Open, Save project, recent), mode switch **Prepare | Preview**, settings.
- **Left**: object list (name, size, visibility) + transform panel for the selection
  (position, rotation, scale in mm and %, uniform lock, lay flat, drop to bed, centre).
- **Centre**: 3D viewport of the real 220 x 220 x 250 volume. Drag-drop files anywhere.
- **Right**: Print panel — Filament, Quality, Strength, Supports, Adhesion, then *More settings*.
- **Bottom right**: Slice -> result card (time, filament m/g/cost, layers) -> **Save to SD**.

### Viewport
Orbit/pan/zoom, fixed views (iso/top/front/left/right), bed with grid + printable-area edge, select
(click, ctrl/shift multi, box-free), move by drag on the bed plane, gizmo for rotate/scale, lay flat
(click a face), auto-orient later, arrange (2D packing of footprints with spacing), duplicate,
delete, out-of-bounds / below-bed / overlap warnings (object turns red, Slice explains why).

### Settings — the core fix
- **Quality**: Draft 0.24 · Standard 0.20 · Optimal 0.16 · Fine 0.12 (Orca's V3 SE process bases).
- **Strength**: Light · Standard · Strong · Solid — sets walls, top/bottom layers, infill density and
  pattern; numbers visible and editable inline.
- **Supports**: Off · Auto (tree, from build plate only toggle) · Everywhere; overhang angle.
- **Adhesion**: Skirt · Brim · None.
- **More settings**: ~40 curated settings in groups (Layers & walls, Infill, Speed, Temperature,
  Cooling, Retraction, Supports, Adhesion, Seam, Special: ironing, fuzzy skin, spiral vase). Each has a
  label, one-line help, unit, range, and the Orca key it maps to. Changed values are marked and
  resettable. Anything not in the catalogue keeps Orca's V3 SE default.
- **Saved setups**: save the current settings as a named setup ("Functional", "Miniatures").
- **Filament library**: the spools Fakhrul owns — name, brand, material, colour, nozzle/bed temps
  (first layer + rest), flow ratio, max volumetric speed, fan, density, diameter, price per kg (RM).
  Seeded with PLA / PLA High Speed / PETG / TPU / ABS / ASA from Orca's Creality V3 SE bases.
- **Machine** (Settings page): nozzle 0.4 (0.2/0.6/0.8), firmware limits (shown, editable behind an
  "I changed my firmware" switch), start/end G-code (editable, with reset), time correction factor.

### Preview
Layer slider (range + current), feature-type colours with legend toggles (outer wall, inner wall,
infill, solid, top, bridge, support, skirt/brim, travel off by default), per-layer time, play-through.

### Files
- Open STL / OBJ / 3MF (dialog, drag-drop, recent, double-click association later).
- **Project** `.ffprint` = zip of scene.json + model files + settings: reopen exactly.
- **Save to SD**: detect removable drives, show which is the printer card, clean ASCII file name
  (`<model>_<quality>_<filament>.gcode`, de-duplicated), write, verify size, eject. Save as... fallback.
- **History**: every saved job — thumbnail, stats, settings snapshot, models -> Reprint / Open.
  Enter the real print time once -> FF Print learns a time correction factor.

### UI direction
Professional, neutral, quiet: a tool, not a brand piece. Neutral grey surfaces, one blue accent for
primary actions and selection, no gradients, no glass, no decorative type. System UI font
(Segoe UI Variable on Windows) for crisp 1x rendering. Whole-px type scale 11/12/13/14/16/20 only,
weights 400/500/600, antialiased smoothing only on 2x screens. Light and dark themes (follow system).
Dense but calm: 32 px controls, 8 px grid, clear section headers, tooltips for every setting.

## 5. Out of scope for v1
Per-object settings/modifiers, support painting, multi-plate, cut tool, USB/host printing
(the hardware project), firmware changes.

## 6. Verification
- Unit (vitest): profile flattening + overrides, 3MF writer round trip, G-code stats/parser, file
  naming, settings mapping clamps to firmware limits.
- Real engine: slice fixtures through the CLI, assert placement, header lines, start G-code fix.
- App: Playwright `_electron` e2e — open model, slice, preview renders, save to a temp "SD" folder.
- Visual pass on the 1x 1080p monitor (DPR 1) and dark/light.
