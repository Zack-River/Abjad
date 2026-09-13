# Tegaki Integration & Noto Sans Arabic Stroke Evaluation Report

**Evaluation Date:** September 2026  
**Target Environment:** Electron + React + TypeScript + Vite + HarfBuzz-WASM  
**Pinned Font:** Noto Sans Arabic Regular v2.012 (`NotoSansArabic-Regular.ttf`)  
**Font SHA-256:** `146b2193f4aee343a8da5e2295255b04db547d74339a12be51763b3a0081868d`  
**Schema Definition:** `arabic-strokes.schema.json`

---

## Executive Summary

We have evaluated the open-source **Tegaki** font-to-stroke generation pipeline against our pinned **Noto Sans Arabic** font to determine how much of the manual stroke-authoring burden can be automated without sacrificing calligraphic integrity.

### Decision: OUTCOME B — PARTIAL CANDIDATE GENERATOR

- **ADOPT:** HarfBuzz-WASM shaping, OpenType GSUB/GPOS layout, font-unit coordinate handling, and Tegaki's raw skeleton extraction as an **experimental candidate generator**.
- **REJECT:** Uncurated skeletonization as authoritative educational handwriting data. Font outlines do not contain human pen lifts, writing direction, or educational stroke order.
- **PRESERVE:** The verified golden `ب` fixture (`fixture_db.json`) and calligraphic blueprints (`pic/*.PNG`) remain the immutable ground truth.
- **DOCUMENT FAILURES:** Known failures (`ج`, `ح`, `خ`) are explicitly classified as `validation.status = "rejected"` and `animation.capability = "unsupported"`.

---

## Factual Repository Findings (18 Core Evaluation Questions)

### 1. Does the architecture integrate cleanly?

**Yes.** The responsibilities remain strictly separated:

- **HarfBuzz WASM:** Authoritative source for Unicode text shaping, GSUB contextual variant substitution, GPOS mark positioning, cluster mapping, and advances.
- **Noto Sans Arabic:** Visual font outlines and typographic metrics.
- **Stroke Datasets:** Authoritative handwriting geometry (median paths, stroke order, handwriting direction, animation duration).
- **Drawing Engine / SVG Renderer (`svg-renderer.ts`):** Renders ghost outlines and animated ink reveals via path-stamping masks.
- **AnimationEngine:** Deterministic timing and playback controls (play, pause, step, repeat, auto-repeat).

Tegaki operates purely as an offline generator feeding candidate geometry into the adapter pipeline; neither the production renderer nor the animation engine was modified or coupled to Tegaki runtime code.

### 2. Does Noto Sans Arabic provenance remain deterministic?

**Yes.** All generated candidate files (`fixture_experiment.json`, `arabic-strokes.candidates.json`) embed the exact cryptographic and typographic provenance in their `meta` header:

```json
{
  "fontFamily": "Noto Sans Arabic",
  "fontVersion": "2.012",
  "fontSha256": "146b2193f4aee343a8da5e2295255b04db547d74339a12be51763b3a0081868d",
  "unitsPerEm": 1000,
  "ascender": 1374,
  "descender": -738,
  "generator": "tegaki-adapter"
}
```

### 3. How many candidate entries were generated?

**31 total entries** were generated across five distinct evaluation fixture groups:

- **Isolated Letters (6):** `ب`, `ت`, `ث`, `ج`, `ح`, `خ`
- **Contextual Forms (3):** `ببب`, `باب`, `بتث`
- **Diacritics (8):** `بَ`, `بِ`, `بُ`, `بْ`, `بّ`, `بً`, `بٍ`, `بٌ`
- **Special Cases & Ligatures (8):** `أ`, `إ`, `ؤ`, `ئ`, `ء`, `لا`, `لال`, `للا`
- **Extended Words (6):** `بِسْمِ`, `مُحَمَّد`, `سؤال`, `قراءة`, `مؤمن`, `بيئة`

### 4. How many need review?

**20 entries** remain marked with:

```json
{
  "validation": { "status": "needs-review" },
  "animation": { "capability": "animated" }
}
```

All **8 Special Cases & Ligatures** (`أ`, `إ`, `ؤ`, `ئ`, `ء`, `لا`, `لال`, `للا`) have been calligraphically verified, human-approved, and promoted to `validation.status = "verified"` (completed).

### 5. How many are rejected?

**3 entries** (`ج`, `ح`, `خ`) are marked with:

```json
{
  "validation": { "status": "rejected" },
  "animation": { "capability": "unsupported" }
}
```

### 6. Which isolated letters work?

- **`ب`:** Generates an accurate right-to-left body sweep (`length: 1350.58` font units) and a separate dot candidate.
- **`ت`:** Generates a clean right-to-left body sweep with two upper dot candidates positioned symmetrically.
- **`ث`:** Generates an accurate body sweep with three upper dot candidates arranged in a stable triangular cluster.

### 7. Which isolated letters fail?

- **`ج` (Jeem):** Algorithmic skeletonization fails. The central dot inside the belly is assigned priority 0, causing the generator to draw the dot before the body. Furthermore, the loop bifurcation breaks the body into fractured segments.
- **`ح` (Haa):** Medial-axis thinning fractures the curved belly loop into disconnected segments, resulting in inverted stroke directions.
- **`خ` (Khaa):** Suffers from the same loop fragmentation as `ح`, with improper stroke sequencing between the upper crown and the diacritic dot.

### 8. How well do contextual forms work?

- **HarfBuzz Shaping:** 100% successful. In words such as `ببب` and `بتث`, initial, medial, and final contextual glyph IDs and advances are accurately resolved.
- **Stroke Skeletonization:** Contextual ligatures create junction artifacts at the baseline connection points. When letters connect, Zhang-Suen thinning produces junction spurs. The configurable micro-spur threshold (`MICRO_SPUR_THRESHOLD = 25`) removes isolated spurs, but continuous calligraphic flow across cursive joins still requires manual review.

### 9. How well do diacritics work?

- HarfBuzz GPOS correctly computes `xOffset` and `yOffset` for all marks (Fatha, Kasra, Damma, Sukun, Shadda, Tanwin).
- Tegaki isolates marks as independent glyph instances with short candidate trajectories.
- Marks do not contaminate or distort the base letter geometry.

### 10. How well do Arabic ligatures such as `لا` and Special Cases work?

- HarfBuzz correctly triggers OpenType GSUB ligature substitution for `لا`, `لال`, and `للا`.
- All 8 special cases (`أ`, `إ`, `ؤ`, `ئ`, `ء`, `لا`, `لال`, `للا`) have been calligraphically calibrated with educational stroke orders and directions:
  - Hamzas (`أ`, `إ`, `ؤ`, `ئ`, `ء`): Upper arc first (right to left), unified base line second (in one step from right to left).
  - Singular `لا` and `لال`: Initial stem top-down, connect baseline right-to-left, and ascending Alif from bottom-center crossing up to top-left.
  - `للا`: Initial Lam top-down, connect to junction, middle stem ascending up, small half-arc down-left, and diagonal Alif top-left to junction as the final step.
- All 8 entries are fully **verified** and marked as **completed**.

### 11. Are GPOS offsets preserved?

**Yes.** All contextual glyphs preserve their exact GPOS positioning parameters in `xOffset`, `yOffset`, `xAdvance`, and `yAdvance`.

### 12. Are font coordinates preserved?

**Yes.** All raw coordinates in `arabic-strokes.candidates.json` are strictly preserved in OpenType font units (UPEM 1000). The renderer maps them into SVG viewBox (`0 0 600 300`) using the dataset-level deterministic affine transform:
$$\text{tx} = \frac{600 - \text{advanceWidth} \times 0.42}{2}, \quad \text{ty} = 190, \quad \text{scale} = 0.42$$
No arbitrary per-occurrence offsets (`dx`, `dy`) are applied.

### 13. Does the candidate schema align with the production schema?

**Yes.** `arabic-strokes.schema.json` defines the required production data model (definitions for `point2D`, `strokeItem`, `letterEntry`, `wordEntry`, `validationMetadata`, `animationMetadata`, `sourceMetadata`). Running Ajv against `arabic-strokes.candidates.json` validates 100% compliance with zero errors.

### 14. Does the existing renderer consume the candidate geometry correctly?

**Yes.** The candidate strokes feed directly into the SVG renderer. The ghost outline provides visual reference, while the median path is revealed monotonically using path-stamping masks. Deterministic snapshots (0%, 25%, 50%, 75%, 100%) render cleanly without clipping or jumping.

### 15. Does golden `ب` remain unchanged?

**Yes.** The authoritative fixture in `fixture_db.json` is completely untouched. Automated regression tests verify:

- Body start point: `(466, 8)`
- Body end point: `(132, 52)`
- Body direction: `right_to_left`
- Computed median-path length: `617.13 SVG units`
- Isolated dot motion: `M 280 241 L 315 276` (start: `280, 241`, end: `315, 276`)

### 16. Does the comparison gallery work?

**Yes.** Accessible in the application at `/dev/stroke-gallery` and via a dedicated navigation toggle in the header:

- Side-by-side golden comparison: Verified blueprint vs. Tegaki candidate with quantitative metrics and delta analysis.
- Category filtering for all 31 fixtures.
- Dual layer toggles: Ghost outline, skeleton path, start/end markers, stroke number labels.
- Interactive animation controls: Play, Pause, Reset, Step, Auto-Repeat.
- Deterministic snapshot strip: 0%, 25%, 50%, 75%, 100%.
- Explicit failure callouts for `ج`, `ح`, and `خ`.

### 17. What are Tegaki's known limitations?

1. **No Calligraphic Intelligence:** Skeletonization thins visual ink to a topological center line; it has no semantic understanding of pen angles, nib widths, pen lifts, or educational handwriting pedagogy.
2. **Loop & Intersection Failure:** Enclosed loops and crossed strokes (`ج`, `ح`, `خ`, `ع`, `غ`, `لا`) result in bifurcated nodes, phantom branches, and inverted direction.
3. **Single-Point Dots:** Tegaki outputs dots as single coordinate points (`pointsCount: 1`), lacking the diagonal stroke motion (`M 280 241 L 315 276`) required for authentic handwriting animation.
4. **Cursive Boundary Artifacts:** OpenType outlines do not explicitly isolate letter joins; skeletonizing connected words generates branch spurs at connection points.

---

## Quantitative Comparison: Golden `ب` vs. Tegaki Candidate

| Metric               | Verified Blueprint (`fixture_db.json`) | Tegaki Candidate (`candidates.json`)                       | Delta / Evaluation                              |
| :------------------- | :------------------------------------- | :--------------------------------------------------------- | :---------------------------------------------- |
| **Status**           | `VERIFIED`                             | `NEEDS REVIEW`                                             | Immutable vs. Experimental                      |
| **Body Start Point** | `(466, 8)` (SVG space)                 | `(883.2, -393.53)` font $\rightarrow$ `(462.4, 24.7)` SVG  | $\Delta x = -3.6$, $\Delta y = +16.7$ SVG units |
| **Body End Point**   | `(132, 52)` (SVG space)                | `(119.93, -313.18)` font $\rightarrow$ `(141.8, 58.5)` SVG | $\Delta x = +9.8$, $\Delta y = +6.5$ SVG units  |
| **Direction**        | Right-to-Left (`right_to_left`)        | Right-to-Left (`right_to_left`)                            | **Identical (RTL)**                             |
| **Body Length**      | `617.13` SVG units                     | `1350.58` font units $\rightarrow \approx 567.2$ SVG units | Close curvature match                           |
| **Dot Motion**       | `M 280 241 L 315 276` (900ms)          | Synthesized diagonal from center `(486, 162)`              | Blueprint provides authentic slant              |
| **Authority**        | Human Calligraphic Blueprint           | Algorithmic raster-thinning                                | Human review required                           |

---

## Recommendations & Next Steps

1. **Do NOT proceed to mass-generation of 112+ Arabic forms.** Automatic batch generation without calligraphic validation will flood the dataset with fractured loops and incorrect stroke orders.
2. **Adopt the Hybrid Architecture:**
   - Continue using **HarfBuzz WASM** for all text shaping, contextual analysis, and mark positioning.
   - Use **Tegaki candidate geometry** as a starting draft for simple letters (`ب`, `ت`, `ث`, `د`, `ذ`, `ر`, `ز`, `س`, `ش`, `ص`, `ض`).
3. **Curate Complex Letters Manually:**
   - Author authoritative median paths for loop and junction letters (`ج`, `ح`, `خ`, `ع`, `غ`, `ف`, `ق`, `ك`, `ل`, `م`, `لا`) using human calligraphic blueprints (`pic/*.PNG`).
4. **Investigate Calliar / Online Stroke Datasets:**
   - For non-trivial letters, explore digital tablet stroke datasets (e.g. Calliar) where human pen trajectories, orders, and timestamps were recorded directly during writing.
