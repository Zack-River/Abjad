# Tegaki Integration Review Context

## Repository Paths

- `fixture_db.json`: `src/renderer/src/assets/fixture_db.json`
- candidate dataset: `data/tegaki/candidates/arabic-strokes.candidates.json`
- raw experiment: `data/tegaki/raw/fixture_experiment.json`
- schema: not found under `arabic-stroke/`; current validator does not load a JSON schema file
- conversion report: `data/tegaki/candidates/conversion-report.json`
- adapter: `scripts/tegaki-to-schema.ts`
- validator: `scripts/validate-arabic-strokes.ts`
- AnimationEngine: `src/renderer/src/engine/animation/animation-engine.ts`
- App.jsx: `src/renderer/src/App.jsx`
- App.css: `src/renderer/src/App.css`
- renderer consumption path inspected: `src/renderer/src/engine/data/stroke-db.ts`, `src/renderer/src/engine/renderer/svg-renderer.ts`, `src/renderer/src/engine/index.ts`

## Golden `ب`

Source: `fixture_db.json` -> `letters.ba.forms.isolated`.

- `startPoint`: `{ "x": 466, "y": 8, "semanticAnchor": "upper_right_sinna_external_entry" }`
- `endPoint`: `{ "x": 132, "y": 52, "semanticAnchor": "left_terminal_top" }`
- `medianPath`: `M 466 8 C 460 14 454 20 450 26 C 456 48 467 78 468 105 C 469 131 456 153 431 170 C 388 190 312 195 239 194 C 185 193 148 187 130 174 C 118 164 116 145 120 122 C 123 94 126 71 132 52`
- `pathLength`: no stored `pathLength` field is present on the golden body stroke; computed median path length with `svg-path-properties` is approximately `617.1343732827035`
- `direction`: `right_to_left`
- dot geometry:
  - `dotGroupId`: `ba_isolated_dots_01`
  - `order`: `2`
  - `count`: `1`
  - `position`: `below`
  - `relationToBody`: `below_main_body`
  - `outlineComponentOffset`: `{ "x": 410, "y": -23 }`
  - `startPoint`: `{ "x": 280, "y": 241, "semanticAnchor": "dot_upper_left" }`
  - `endPoint`: `{ "x": 315, "y": 276, "semanticAnchor": "dot_lower_right" }`
  - `maskReveal.direction`: `top_left_to_bottom_right`
  - `appearanceMotion`: `{ "kind": "diagonal_dot_stroke", "durationMs": 900, "delayAfterBodyMs": 220 }`
- dot `medianPath`: `M 280 241 L 315 276`

Both dot paths exist in the repository data:

- `M 280 241 L 315 276`: `letters.ba.forms.isolated.dots[0]`
- `M 270 241 L 305 276`: `letters.ba.forms.final.dots[0]`

## Candidate Status

- total candidate entries: `31`
- section counts: `letters=6`, `contextual=3`, `diacritics=8`, `special=8`, `extended=6`
- marked `generated` by `validation.status`: `0`
- marked `needs-review`: `28`
- marked `rejected`: `3`
- marked `unsupported` by `validation.status`: `0`
- marked `verified`: `0`
- `source.generator === "tegaki"`: `6` isolated letter entries
- `animation.capability === "unsupported"`: `3`

## Fixtures

- isolated: `ب`, `ت`, `ث`, `ج`, `ح`, `خ`
- contextual: `ببب`, `باب`, `بتث`
- diacritics: `بَ`, `بِ`, `بُ`, `بْ`, `بّ`, `بً`, `بٍ`, `بٌ`
- special: `أ`, `إ`, `ؤ`, `ئ`, `ء`, `لا`, `لال`, `للا`
- extended: `بِسْمِ`, `مُحَمَّد`, `سؤال`, `قراءة`, `مؤمن`, `بيئة`

## Known Failures

The candidate data marks `ج`, `ح`, and `خ` as `validation.status: "rejected"` and `animation.capability: "unsupported"`.

The conversion report also lists:

- `ج`: dot assigned priority 0 inside belly and drawn before body; body fractured
- `ح`: body fractured into disconnected fragments with incorrect stroke direction
- `خ`: body fractured into disconnected fragments with incorrect stroke direction

## Schema Structure

No `arabic-strokes.schema.json` file was found in the stated repository root, and the validator does not perform JSON Schema validation. The actual candidate JSON structure contains:

- identity: top-level letter entries include `id`, `char`, `unicode`; glyph entries include `glyphId`, `cluster`, and `char`
- forms: no explicit `forms` object in the candidate dataset; forms are separated into top-level arrays: `letters`, `contextual`, `diacritics`, `special`, `extended`
- outline: isolated entries use `outlinePath`; contextual/diacritic/special/extended glyphs also use `outlinePath`
- strokes: each stroke has `order`, `originalOrder`, `priority`, `isCandidateDot`, `direction`, `length`, `durationMs`, `delayMs`, `startPoint`, `endPoint`, `medianPath`, `points`, and `pointsWithWidth`
- connection: contextual forms include shaped glyph metadata: `glyphCount`, `glyphs`, `xAdvance`, `yAdvance`, `xOffset`, `yOffset`, `cluster`
- capability: isolated entries include `animation.capability` and `animation.notes`
- status: entries use `validation.status` and `validation.notes`
- provenance: top-level `meta` includes font/generator details; isolated letter entries include `source.generator`, `source.font`, `source.fontVersion`, and `source.fontSha256`
- shaping metadata: raw/candidate contextual glyphs include HarfBuzz-like glyph metadata (`glyphId`, `cluster`, advances, offsets)

## Adapter Behavior

`scripts/tegaki-to-schema.ts`:

- reads `data/tegaki/raw/fixture_experiment.json`
- writes `data/tegaki/candidates/arabic-strokes.candidates.json`
- writes `data/tegaki/candidates/conversion-report.json`
- preserves Tegaki/font coordinate data as `coordinateSpace: "font-units"`; it does not apply a coordinate transform
- converts each raw stroke point list to an SVG `medianPath` using `M ... L ...`
- converts one-point strokes, or negative-priority strokes, into candidate dots by synthesizing a diagonal path from center minus/plus `18` font units; direction becomes `upper_left_to_lower_right`
- filters multi-point strokes shorter than `MICRO_SPUR_THRESHOLD = 25` as micro-spurs, omits them from clean strokes, and records them in cleanup logs
- assigns top-level provenance in `meta` and per-isolated-letter provenance in `source`
- assigns `validation.status: "rejected"` and `animation.capability: "unsupported"` for `ج`, `ح`, `خ`
- assigns `validation.status: "needs-review"` and `animation.capability: "animated"` for other isolated letters
- assigns `validation.status: "needs-review"` for contextual, diacritic, special, and extended entries, without per-entry `source` or `animation`
- emits top-level arrays: `letters`, `contextual`, `diacritics`, `special`, `extended`

## Validator Behavior

`scripts/validate-arabic-strokes.ts` currently checks:

- schema validity: no; it does not load or apply a JSON schema
- NaN/Infinity: yes, for selected geometry fields in candidate strokes (`startPoint`, `endPoint`, `pointsWithWidth.x/y/width`)
- path validity: no SVG path parsing/validation is performed
- stroke ordering: yes, isolated candidate letter strokes must be sequential from `0`
- monotonicity: yes, `pointsWithWidth[].t` must not decrease
- provenance: partially; top-level candidate `meta` must include `fontSha256`, `unitsPerEm`, `fontVersion`; isolated candidate `letter.source.generator` must be `tegaki`
- golden `ب`: partially; validates existence, body direction, body start `(466, 8)`, body end `(132, 52)`
- golden dot path: partially; only checks that `dots[0].medianPath` includes the substring `270 241`, which conflicts with the actual isolated golden dot path `M 280 241 L 315 276`

## Important Discrepancies

- Required schema artifact `arabic-strokes.schema.json` is absent under `arabic-stroke/`.
- The current validation pipeline does not use JSON Schema despite the requested schema artifact and schema-validation review requirement.
- The validator's golden dot regression expects a path near `270 241`, while the actual immutable isolated golden `ب` dot path is `M 280 241 L 315 276`.
- The alternate `M 270 241 L 305 276` path exists on `letters.ba.forms.final.dots[0]`, so both dot path variants exist in repository data.
- Candidate entries are not marked with `validation.status: "generated"`; generated provenance appears through `meta.generator`, isolated `source.generator`, and status `needs-review`/`rejected`.
- Contextual, diacritic, special, and extended candidate entries do not carry the same per-entry `source` or `animation.capability` structure as isolated letters.
- The live app/renderer consumes `src/renderer/src/assets/fixture_db.json`, not the Tegaki candidate JSON.
