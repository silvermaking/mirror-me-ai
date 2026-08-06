# Sprite Rig V5 — Compact Directional Joint Housings

## Verdict

**ART SOURCE PASS.** The selected sheet contains exactly two connected, compact directional housings; equal-size source cells project to the requested L/R 320 px masses without the rig-v4 long-sleeve silhouette pop.

## Selected files

- ImageGen chroma source: `boss-joint-housings-v5-chroma.png`
- Exact-flat packaged chroma proof: `boss-joint-housings-v5-flat-chroma.png`
- Selected official-helper alpha: `boss-joint-housings-v5-alpha.png`
- Equal-cell runtime review frames: `boss-joint-housing-l-runtime-cell.png`, `boss-joint-housing-r-runtime-cell.png`
- 320 composites: `boss-miss-left-v5-composite-320x180.png`, `boss-miss-right-v5-composite-320x180.png`
- LOCK/MISS comparison pairs: `boss-left-lock-vs-miss-v5-640x180.png`, `boss-right-lock-vs-miss-v5-640x180.png`
- Machine-readable measurements: `measurements.json`

## Source and target measurements

The selected sheet is `1536×1024`. Both builder crops are exactly `768×970`; only their x origin changes. With the current deterministic `512×384 → 256×192` build, `BOSS_SCALE=.96`, and the 320 px viewport's `.25` logical scale:

| Variant | Equal source cell | Source alpha bbox | Source anchors (`driver_joint`, `shaft_in`) | Runtime paint bbox | 320 projected bbox | Target | Result |
| --- | --- | --- | --- | --- | --- | --- | --- |
| L | `(0,27,768,970)` | `(187,343,377,316)` | `(224,511)`, `(532,511)` | `75×63` | `18.00×15.12px` | `16–19×15–18px` | PASS |
| R | `(768,27,768,970)` | `(1026,412,266,231)` | `(1058,529)`, `(1264,529)` | `53×46` | `12.72×11.04px` | `10–13×10–13.5px` | PASS |

The L/R source alpha linear ratios are `1.42×` in width and `1.37×` in height. The projected visual masses match their unequal embedded LOCK references more closely than a blind 1.5× resize: v4 evidence measured the embedded cuffs at `17.28×16.56px` (L) and `11.28×11.76px` (R).

Both authored anchor pairs share an exact source y coordinate, so `driver_joint → shaft_in` is horizontal before the immutable LOCK-axis rotation. The anchors sit in the solid soot mounting pad and the sole dark shaft tunnel respectively.

## Visual gate

| Criterion | Result | Evidence |
| --- | --- | --- |
| Exactly two objects | PASS | Alpha connected-component counts at thresholds 8, 128 and 240 are exactly two; one per equal cell. |
| Compact near-square mass | PASS | L `18.00×15.12px`, R `12.72×11.04px`; neither reads as a forearm or secondary barrel at 320. |
| One solid mount + one tunnel | PASS | Each left/body end is closed soot iron; each right/shaft end has one dark opening. No second aperture. |
| Directional rather than mirrored | PASS | L carries a broader upper ivory crown and heavier lower soot flange; R has a tighter side rim and independently arranged cracks. |
| Material match | PASS | Four-value hand-painted cracked ivory and soot-iron treatment is continuous with the approved boss bodies. |
| No forbidden content | PASS | No body, shaft, tip, arm, cannon, debris, shadow, text, guide, HUD, logo or watermark. |
| Chroma / alpha | PASS | All four alpha corners are zero; `2,056` partial pixels and `140,342` opaque pixels; zero green-dominant partial or opaque pixels. |
| 320 body occlusion | PASS | Both MISS composites retain the face, brightest white core, and exactly three plaques. Body-last draw order hides the mount seam. |
| LOCK → MISS continuity | PASS | The comparison pairs show no two-times sleeve pop; L and R housing masses stay within roughly one pixel of the embedded LOCK masses on each axis. |

## Composite interpretation

- Left: the larger authored housing stays behind the collapsed torso, supports the diagonal shaft, and does not cover the white core or three plaques.
- Right: the smaller housing avoids replacing the compact LOCK shoulder with the same oversized cuff used on the opposite side.
- Both: the driver shaft and tip remain separate layers. The housing is only the short visual bridge at the immutable joint; it cannot change targeting or contact.

## Iteration record

1. First ImageGen pass achieved the correct two-object geometry and directional material treatment but exceeded both 320 targets.
2. One scale-only ImageGen repair reduced L and R independently while preserving their painted identity, tunnel count, axes and flat chroma staging.
3. Official chroma removal passed without edge contraction. A deterministic exact-green package was generated only as source-proof; no hand paint-over, tracing, procedural replacement art or runtime primitive was used.

## Adoption note

Implementation should ingest the two equal source cells as distinct `driver-cuff-left` and `driver-cuff-right` frames, preserve the recorded source anchors, and draw `shaft/tip → directional housing → boss body`. Final runtime acceptance still requires an actual scene capture, but this art source itself passes the assignment gate.
