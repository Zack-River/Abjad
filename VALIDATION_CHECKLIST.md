# Arabic Stroke Validation Checklist

Current decision: the Evaluation Gallery letter and glyph coverage is verified.
Export and animation gates remain tracked separately below.

## Automated And Static Results

| Check | Result |
| --- | --- |
| TypeScript typecheck | PASS |
| Electron/Vite production build | PASS |
| Protected candidate files modified | NO |
| Initial Kaf GID 61 registered | PASS |
| Medial Kaf GID 60 preserved | PASS |
| Final Kaf GID 59 preserved | PASS |
| Initial Heh GID 85 registered | PASS |
| Medial Heh GID 84 preserved | PASS |
| Final Heh GID 83 registered | PASS |
| Generic contextual substitution removed | PASS |
| Export provenance gate added | PASS |
| Automated tests/lint | NOT RUN, per user instruction |

## Evaluation Gallery Checklist

Test each case in isolated, initial, medial, and final contexts where
applicable.

| Case | Input | Expected result | Status |
| --- | --- | --- | --- |
| Kaf isolated | `ك` | Correct isolated shape and hamza component | VERIFIED |
| Kaf initial | `كب` | User-supplied canonical path applied to GID 61 | VERIFIED PATH |
| Kaf medial | `كككك` | User-supplied canonical path applied to GID 60 | VERIFIED PATH |
| Kaf final | `بك` | User-supplied canonical path applied to GID 59 | VERIFIED PATH |
| Kaf hamza mark | `ك` in contextual editor | User-supplied canonical path applied to GID 357 | VERIFIED PATH |
| Heh isolated | `ه` | Correct isolated form | VERIFIED |
| Heh initial | `هب` | GID 85 initial form connects correctly | VERIFIED |
| Heh medial | `ههه` | GID 84 medial form connects on both sides | VERIFIED |
| Heh final | `به` | GID 83 final form connects correctly | VERIFIED |
| Heh mixed | `بهب` | Final and initial transitions are both correct | VERIFIED |
| Repeated letters | `كككك`, `هههه` | No skipped, duplicated, or substituted forms | VERIFIED |
| Hamza above | `ؤ`, `مؤمن` | One hamza rendered only once | VERIFIED |
| Yaa hamza | `ئ`, `بيئة`, `بئر` | Base and hamza do not duplicate | VERIFIED |
| Standalone hamza | `ء` | Correct isolated hamza only | VERIFIED |
| Lam-alif | `لا`, `لال`, `للا` | Correct drawing order and complete shadow | VERIFIED |
| Lam-alif marks | `لأ`, `لإ`, `لآ` | Hamza or maddah appears after the body | VERIFIED |
| Allah forms | `اللَّهُ`, `اللَّٰهُ`, `ٱللَّٰهُ` | Supported marks render without corruption | VERIFIED |
| Dagger alif | `ٰ` | GID 409 draws correctly | VERIFIED |
| Maddah | `آ`, `لآ` | Maddah is the final mark step | VERIFIED |
| Tatweel | `ـ` | Width-bearing stroke renders correctly | VERIFIED |
| Wasla | `ٱ` | Canonical GID 580 is preserved and animated as a base glyph | VERIFIED |
| Maddah duplication | `آ` | Composite maddah is rendered once | VERIFIED |
| Final Baa editor | `كب` | Evaluation Gallery exposes the final ب median path | VERIFIED |
| Repeated Heh editor | `هههه` | Evaluation Gallery exposes initial, medial, and final ه paths | VERIFIED |
| Taa marbuta editor | `هبة` | Evaluation Gallery exposes the ة path | VERIFIED |
| Final Heh editor | `هبه` | Evaluation Gallery exposes the final ه path | VERIFIED |

## Previously Verified Letter Coverage

The existing letter and contextual-form coverage, including the newly requested
editor cases, is marked verified per the current manual review status.

| Coverage | Status |
| --- | --- |
| Arabic isolated letters and their verified dots | VERIFIED |
| Existing initial, medial, and final contextual forms | VERIFIED |
| Existing `ف`, `ق`, `ع`, `غ`, `ط`, and `ظ` contextual forms | VERIFIED |
| Existing `ك` contextual paths and hamza editor | VERIFIED PATH |
| Existing special-case and diacritic coverage | VERIFIED |

## Export Checklist

| Case | Expected result | Status |
| --- | --- | --- |
| Verified fixture text | SVG/HTML export enabled | IMPLEMENTED |
| Canonical Kaf/Heh forms | SVG/HTML export enabled | IMPLEMENTED |
| Text using isolated fallback | Export blocked with clear message | STATIC PASS |
| Unknown glyph or mark | Skipped and reported | STATIC PASS |
| PNG | Rasterized from canonical SVG snapshot | IMPLEMENTED |
| GIF | Full canonical timeline converted through FFmpeg | IMPLEMENTED |
| MP4 | Full canonical timeline converted through FFmpeg/H.264 | IMPLEMENTED |
| Downloaded SVG/HTML file | Opens with the same geometry and layers | PENDING |

## Animation Checklist

- [ ] Shadow is visible before playback.
- [ ] Ink layer is empty before drawing.
- [ ] Body strokes draw before dots.
- [ ] Dots draw after the letter body.
- [ ] Diacritics draw after dots.
- [ ] Repeat step cancels the previous step.
- [ ] Reset returns to shadow-only state.
- [ ] Next Letter works only in letter mode.
- [ ] Connected-letter mode disables letter queue controls.
- [ ] No stroke draws twice.
- [ ] No completed stroke is erased by a later stroke.
- [ ] Final step reaches 100% without missing tails or marks.

## Completion Rule

The document can be marked complete only after the Kaf, Heh, hamza,
special-case, export, and animation rows pass in the Evaluation Gallery.
