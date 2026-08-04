# Authored 2D source art

`characters.svg` holds local-space, hand-authored whole-body poses. The player has `idle`, `move`, `dash`, and a complete `attack-windup` → `attack-contact` → `attack-recoil` sequence; all feet sit on the local floor anchor at `y=60`. The attack poses retain only the hand and hilt: the one tapered boundary blade is runtime geometry. The Cartographer has asymmetric ivory map-robes around an ink interior in `idle`, `watch`, `lock`, `stamp`, `open`, and `recoil` poses. His compass crown and compass-stamp remain attached to the body in each state.

`relics.svg` contains the one repeatable memory plaque (render it exactly three times for the three core samples), plus the fixed LOCK seal, blank core, danger decal, and compass driver. The renderer, not the source art, owns their world coordinates and layering.

Run `node tools/build-2d-sprites.mjs` after modifying source SVGs. It derives the renderer-facing six-frame `player-sheet.svg` (`idle`, `move`, `dash`, `attack-windup`, `attack-contact`, `attack-recoil`) and four-frame `boss-sheet.svg` (`idle`, `lock`, `stamp`, `open`) from the original source poses, then writes source-id, bounds, and anchor metadata. Every generated cell is clipped to its own 64 × 64 frame and references exactly one pose id. There is no generated-concept or raster artwork in this pipeline.
