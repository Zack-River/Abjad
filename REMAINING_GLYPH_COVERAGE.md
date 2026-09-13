# Remaining Glyph Coverage

Source: `src/renderer/src/assets/candidates/coverage-report.json` (generated 2026-09-12).

This backlog lists every item whose individual status is not `verified`. It is the
authoring gate for verified SVG/HTML export; the board may still explore some of
these forms through unverified fallback geometry, but those compositions cannot
be exported as verified output.

## Status

Implementation pass completed on 2026-09-13. The three previously skipped mark
records now have canonical handling in the runtime registry: dagger alif (GID
409), maddah (GID 300 through the verified special fixtures), and tatweel (GID
109). The existing tuned contextual definitions are also registered as canonical
engine geometry rather than `font-fallback_*` definitions. The exact Noto Sans
Arabic contextual forms for initial Kaf (GID 61), final Heh (GID 83), and initial
Heh (GID 85) are now registered as canonical runtime definitions as well.

## Original Report Totals

| Status | Entries |
| --- | ---: |
| Incomplete | 62 |
| Unsupported | 27 |
| Total remaining | 89 |

The source report's aggregate summary currently reports 59 incomplete entries.
The 62 count above is calculated from the itemized records below, and should be
used for planning until the next coverage-report generation reconciles the
summary.

## Incomplete Letter Forms

| Letter | Unicode | Name | Forms still requiring verification |
| --- | --- | --- | --- |
| ت | U+062A | Taa | final |
| ث | U+062B | Thaa | initial, medial |
| ج | U+062C | Jeem | initial, medial, final |
| ح | U+062D | Haa | initial, medial, final |
| خ | U+062E | Khaa | initial, medial, final |
| ذ | U+0630 | Dhaal | final |
| ز | U+0632 | Zaay | final |
| س | U+0633 | Seen | medial, final |
| ش | U+0634 | Sheen | initial, medial, final |
| ص | U+0635 | Saad | initial, medial, final |
| ض | U+0636 | Daad | initial, medial, final |
| ط | U+0637 | Taa heavy | initial, medial, final |
| ظ | U+0638 | Zaa heavy | initial, medial, final |
| ع | U+0639 | Ayn | medial, final |
| غ | U+063A | Ghayn | initial, medial, final |
| ف | U+0641 | Faa | medial, final |
| ق | U+0642 | Qaaf | initial, medial, final |
| ك | U+0643 | Kaaf | medial, final |
| ل | U+0644 | Laam | initial, final |
| م | U+0645 | Meem | medial |
| ن | U+0646 | Noon | final |
| ه | U+0647 | Haa light | medial, final |
| ي | U+064A | Yaa | initial, medial, final |
| أ | U+0623 | Alif with hamza above | final |
| إ | U+0625 | Alif with hamza below | final |
| آ | U+0622 | Alif with maddah | final |
| ؤ | U+0624 | Waaw with hamza | final |
| ئ | U+0626 | Yaa with hamza | initial, medial, final |

## Incomplete Marks

| Mark | Unicode | Name |
| --- | --- | --- |
| ٰ | U+0670 | Dagger alif / superscript alif |
| ٓ | U+0653 | Maddah |
| ـ | U+0640 | Tatweel |

## Unsupported Letter Forms

| Letter | Unicode | Name | Unsupported forms |
| --- | --- | --- | --- |
| ا | U+0627 | Alif | initial, medial |
| د | U+062F | Daal | initial, medial |
| ذ | U+0630 | Dhaal | initial, medial |
| ر | U+0631 | Raa | initial, medial |
| ز | U+0632 | Zaay | initial, medial |
| و | U+0648 | Waaw | initial, medial |
| ة | U+0629 | Taa marbutah | initial, medial |
| ى | U+0649 | Alif maqsura | initial, medial |
| ء | U+0621 | Hamza | initial, medial, final |
| أ | U+0623 | Alif with hamza above | initial, medial |
| إ | U+0625 | Alif with hamza below | initial, medial |
| آ | U+0622 | Alif with maddah | initial, medial |
| ؤ | U+0624 | Waaw with hamza | initial, medial |

## Verified Special Compositions

No special compositions are currently marked incomplete or unsupported. The
verified set is: `لا`, `لأ`, `لإ`, `لآ`, `لال`, `للا`, `بِسْمِ`, `مُحَمَّد`,
`سؤال`, `قراءة`, `مؤمن`, and `بيئة`.

## Export Implication

Verified SVG/HTML export is restricted to definitions whose provenance is either
`verified_fixture` or `canonical_runtime`. The next export methods can use that
same gate; they do not need to wait for all 89 report items, but they must
surface a clear unsupported-content result when a composition includes skipped
glyphs or `unverified_fallback` geometry.

## Current Code Audit

The generated coverage matrix is conservative and does not reflect every form
that has since been added to the canonical registry or the Dev Port. The current
code was checked against `stroke-registry.ts`, `glyph-composer.ts`, and the
candidate dataset on 2026-09-13.

### Already Really Done

These are present as candidate stroke data in
`src/renderer/src/assets/candidates/arabic-strokes.candidates.json`:

- All 36 isolated letters, including `ا`, `أ`, `إ`, `آ`, `ة`, `ى`, `ء`, `ؤ`, and `ئ`.
- All 11 contextual candidate words: `ببب`, `باب`, `بتث`, `سلم`, `كتب`, `علم`,
  `ننب`, `هوي`, `على`, `فتى`, and `مدرسة`.
- All 8 common marks: fathah, kasrah, dammah, sukoon, shaddah, fathatan,
  kasratan, and dammatan.
- All 11 special compositions: `لا`, `لأ`, `لإ`, `لآ`, `لال`, `للا`, and the
  five verified hamza/special entries represented in the dataset.
- All 6 extended words: `بِسْمِ`, `مُحَمَّد`, `سؤال`, `قراءة`, `مؤمن`, and `بيئة`.

That is 72 candidate dataset entries. They are treated as verified fixtures by
the registry because the file is the protected authoring source, but the
coverage report does not encode a per-record status for these entries. The
registry also contains maintained
contextual geometry for the Dev Port forms of `ج/ح/خ`, `س/ش`, `ص/ض`, `ط/ظ`,
`ع/غ`, `ف/ق`, `ك`, and `ه`, including the custom paths that were tuned during
the earlier work.

### Done in the Dev Port, but Not Yet Promoted as Independent Verified Fixtures

These forms can currently render through the canonical engine's contextual
aliases or maintained font fallback definitions, but they are not all represented
as independent verified records in the generated coverage matrix:

- Contextual `ج/ح/خ` initial, medial, and final forms.
- Contextual `س/ش` initial, medial, and final forms.
- Contextual `ص/ض` initial, medial, and final forms.
- Contextual `ط/ظ` initial, medial, and final forms.
- Contextual `ع/غ` initial, medial, and final forms, including the separate
  ghayn dot.
- Contextual `ف/ق` initial, medial, and final forms.
- Contextual `ك` initial, medial, and final forms, including the small hamza
  component where applicable. Initial Kaf is canonical GID 61.
- Contextual `ه` initial, medial, and final forms. Initial and final Heh are
  canonical GIDs 85 and 83; medial Heh remains GID 84.
- Final `ل` and the special lam-alif compositions.

These are canonical runtime definitions for interactive rendering and are
eligible for export when their definition provenance is `canonical_runtime`.
They are still separate from the protected fixture inventory, so they must
remain explicitly listed here until the coverage generator can represent that
provenance.

### Previously Missing or Skipped, Now Addressed

- `ٰ` U+0670 dagger alif / superscript alif: canonical runtime mark definition
  added for GID 409, with a top-line median stroke.
- `ٓ` U+0653 maddah: existing verified GID 300 geometry is reused for general
  shaped mark resolution, while the verified `لآ` ordering remains intact.
- `ـ` U+0640 tatweel: canonical runtime definition added for GID 109, including
  its width-bearing right-to-left stroke.
- Initial `ل`: verified GID 72 is already supplied by the `للا` candidate fixture
  and is now resolved as canonical contextual geometry.

### Remaining Review Gate

Some Yaa and hamza-bearing contextual cases can still reach the board via the
isolated-shape exploration fallback when no exact contextual GID record is
available. They carry `unverified_fallback` provenance and remain blocked from
verified export until their exact shaped GIDs and paths are promoted.

### Unsupported Entries That Are Not Real Missing Work

The following report entries should not be treated as authoring tasks:

- Initial and medial forms for right-joining letters: `ا`, `د`, `ذ`, `ر`, `ز`,
  `و`, `ة`, `ى`, `أ`, `إ`, `آ`, and `ؤ`.
- Initial, medial, and final forms for isolated `ء`.

Arabic shaping does not produce those joining states. They are correctly marked
`unsupported` by the matrix, rather than being unfinished glyph artwork.

### Revised Decision for Export Work

The interactive rendering engine is farther along than the old coverage report
suggests. The next export methods can proceed for the fixture definitions, the
canonical Dev Port contextual definitions, and the newly canonical marks.
Export rejects arbitrary text that depends on `unverified_fallback` geometry,
which keeps the remaining review work visible instead of silently publishing
isolated-shape substitutions.

---

## Editorial Opinion: What Is Truly Done vs. What Is Claimed

> Added 2026-09-13. Cross-referenced against `stroke-registry.ts` (1194 lines)
> and `glyph-composer.ts` directly. This section argues for a more conservative
> reading of "done."

### What the Document Gets Right

The 72 candidate dataset entries (36 isolated letters + 11 contextual words +
8 marks + 11 special + 6 extended) are treated as verified fixtures by the
registry. The source file is ingested verbatim, but it does not carry a
per-record verification field; the coverage report and provenance field are the
authoritative export indicators.

The "unsupported" category is also correctly classified — Arabic shaping
genuinely does not produce initial/medial forms for right-joining letters like
`ا`, `د`, `ر`, `و`, etc. Calling these "unsupported" rather than "missing" is
the right decision.

### Where the Document Needed Correction

The original section mixed fixture verification with runtime availability. The
following points now describe the corrected implementation state:

#### 1. ك (Kaf) — Exact Initial Form Added

The registry now contains the exact font outline and an explicit educational
path for `uni0643.init` (GID 61). The generic contextual substitution loop was
removed, so a future missing form cannot silently substitute the medial shape.
The initial, medial, final, and small hamza paths were subsequently supplied
and marked as verified canonical runtime paths.

#### 2. ه (Heh) — Exact Initial and Final Forms Added

The registry now contains `uni0647.init` (GID 85), `uni0647.medi` (GID 84), and
`uni0647.fina` (GID 83), each with its own TrueType outline and contextual alias.

#### 3. ج / ح / خ — Final Form Stroke Quality Is Questionable

GID 24 (`uni062D.fina`) is present with a two-stroke definition. Stroke 0
traces a right-to-left entry along the top, and Stroke 1 loops the belly
upward and around. The medianPath coordinates on both strokes share the same
`FINAL_HAA_OUTLINE` and the stroke endpoints suggest they are traced as
separate disconnected segments, not a continuous crescent. Whether this looks
natural at animation speed is a visual question that has not been verified
against a real Arabic calligraphy reference. The geometry compiles and renders,
but "done" for export quality is a different bar.

#### 4. ئ and ؤ — Duplicate Drawing Not Yet Fixed

The task list items for fixing duplicate `ئ`/`ؤ` drawing (task 2) and fixing
`لا` in the outer board (task 3) are unchecked. Looking at
`glyph-composer.ts`, the hamza suppression logic exists at line 350–388, but
whether it correctly handles the case where `uni0626` (yeh with hamza) outputs
both a base glyph and a separate `uni0654` hamza mark depends on the exact
HarfBuzz cluster output. This has not been confirmed as fixed in the code.
Similarly, `لا` is present in `VERIFIED_CATEGORIES.letters.items` at
`StudioView.jsx` line 87, so it does appear on the outer board, but the server
restart means the last test session results are unavailable.

### Summary Table

| Feature | Claim in Doc | Actual Status |
|---|---|---|
| 72 verified fixtures | Complete ✓ | **Confirmed complete** |
| Seen/Sheen (ص/ض/ط/ظ) contextual forms | "Implementation-complete" | **Present** — medianPaths authored, GIDs 35–45 registered |
| Jeem/Haa/Khaa contextual forms | "Implementation-complete" | **Present** — GIDs 24, 26, 27 registered, 2-stroke approach |
| Kaf (ك) contextual forms | "Including initial" | **Canonical runtime complete** — GIDs 61, 60, and 59 |
| Heh (ه) contextual forms | "Medial and final" | **Canonical runtime complete** — GIDs 85, 84, and 83 |
| ئ / ؤ duplicate drawing | Not mentioned | **Code-covered, visual review still required** |
| لا outer board | Not mentioned | **Present in board list** but runtime behavior unconfirmed |
| Marks (dagger alif, maddah, tatweel) | "Now addressed" | **Present** in canonical definitions |

### Recommended Next Steps

1. **Visually verify the new Kaf and Heh forms** in the Evaluation Gallery and
   representative connected words.
2. **Verify ئ/ؤ behavior** — compose `بئر`, `مؤمن`, `بيئة`, `ؤ`, and `ئ` and
   confirm only one hamza dot appears per letter.
3. **Promote runtime provenance into the coverage generator** so the report can
   distinguish canonical runtime forms from unverified fallback geometry.
