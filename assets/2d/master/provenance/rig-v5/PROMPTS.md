# Sprite Rig V5 — Exact ImageGen Prompts

Both calls used the built-in `image_gen.imagegen` tool. No CLI/API fallback or native-transparency mode was used.

## 1. Directional housing sheet — first pass

References:

1. `../sprite-rig-v4/boss-body-left-armfree-alpha.png` — approved left body, identity/material/embedded LOCK-cuff reference.
2. `../sprite-rig-v4/boss-body-right-armfree-alpha.png` — approved right body, identity/material/embedded LOCK-cuff reference.
3. `/private/tmp/mirror-me-rig-v4-captures/left-lock-vs-miss-320.png` — runtime scale failure evidence.
4. `/private/tmp/mirror-me-rig-v4-captures/right-lock-vs-miss-320.png` — runtime scale failure evidence.

```text
Use case: stylized-concept
Asset type: rig-ready hand-painted 2D game sprite source sheet containing exactly two compact directional boss joint housings
Input images: Images 1 and 2 are the approved boss identity, material, quarter-view lighting, and embedded LOCK-cuff mass references. Images 3 and 4 show the runtime failure: the long MISS sleeve is forbidden; the tiny embedded LOCK housing is the target visual mass.
Primary request: On one wide landscape source sheet, create exactly TWO isolated compact near-square joint housings, one centered in the left half and one centered in the right half. There is no divider and no label. LEFT object is the down-left LOCK-direction variant and must have about 1.5 times the linear size of the RIGHT object. The two halves will be cropped as equal-size cells, so make the left painted object approximately 380 by 350 source pixels and the right painted object approximately 250 by 235 source pixels on a roughly 1536 by 1024 sheet. Each object is a very short, thick, almost-square armored shoulder joint housing, not a limb.
Geometry for each object: the body-facing LEFT side is a solid soot-dark irregular mounting pad with no hole. The shaft-facing RIGHT side has exactly ONE small deep dark tunnel that accepts a separate shaft. The named visual axis driver_joint to shaft_in is perfectly horizontal. Width is at most 1.18 times height. The tunnel occupies less than one third of the object height. No extended middle tube: mounting pad, cracked armor shell, and tunnel rim are packed into one compact mass.
Directional distinction: LEFT variant exposes a little more upper-facing cracked ivory plate and a heavier lower soot flange, matching the down-left LOCK pose. RIGHT variant is independently painted, slightly more side-facing with a tighter soot rim and smaller ivory cap, matching the down-right LOCK pose. Do not mirror one into the other. Both keep the same restrained upper-left light.
Style/medium: hard-edged opaque hand-painted gouache/digital-brush game sprite part matching the references; four large value groups; soot-dark charcoal iron anatomy under broken warm cracked ivory ceramic plates; asymmetrical chipped silhouette; authored 2D illustration, not a rendered model.
Scene/backdrop: perfectly flat solid #00ff00 chroma-key background edge-to-edge, exactly uniform with no gradient, texture, horizon, floor, shadow, reflection, glow, scenery, or lighting variation. Do not use #00ff00 inside either object. Generous clear green separation around both objects.
Composition: wide landscape sheet, two equal invisible cells; one object only in each half; both axes exactly horizontal left-to-right; entire objects visible with generous padding; no overlap.
Constraints: exactly two connected opaque objects total; compact near-square silhouettes; one solid left mounting pad and exactly one right tunnel per object; L object about 1.5x R linear size; no full boss body, no arm, no forearm, no sleeve, no cannon, no barrel, no shaft, no impact tip, no drill, no hand, no claw, no cable, no plaque, no core, no detached bolt, no debris, no cast shadow, no contact shadow, no second tunnel, no text, letters, numbers, labels, arrows, guides, frames, HUD, icon, logo, or watermark.
Avoid: long v4 sleeve, two-times silhouette pop, cylinders, tubes, primitives, clay render, glossy PBR, 3D render, clean vector outlines, symmetric barrel, green spill, floating fragments, extra objects.
```

Built-in output: `/Users/hippoync/.codex/generated_images/019fd553-d249-7883-ae2e-83a0baa8e59e/exec-1390d327-0bff-4318-9307-d13f4182b6d0.png`

The shapes were accepted but both objects were too large for the locked 320 px targets, so one scale-only repair followed.

## 2. Scale-only local repair — selected

Reference: the immediately preceding generated image, passed through `num_last_images_to_include: 1` as the sole edit target.

```text
Use case: precise-object-edit
Asset type: corrected rig-ready two-object joint-housing source sheet
Input image: the immediately previous generated wide green sheet is the sole edit target and absolute authority for both painted housings, their directional differences, materials, brushwork, lighting, horizontal axes, one-tunnel geometry, and flat green background.
Primary request: Make exactly one change: reduce the LEFT housing uniformly to about 72% of its current linear size and reduce the RIGHT housing uniformly to about 70% of its current linear size. Keep each object centered in its own invisible equal-size half of the sheet. Target visible painted bounding boxes on the 1536×1024 source: LEFT approximately 380×330 pixels; RIGHT approximately 250×225 pixels. Do not distort either object and do not redesign or repaint any part.
Absolute invariants: preserve exactly two objects; left remains about 1.5 times the right in linear size; each stays compact and near-square; solid soot-dark mounting pad on the left, exactly one dark shaft tunnel on the right, horizontal driver_joint-to-shaft_in axis; preserve the cracked ivory and soot iron surfaces, asymmetry, upper-left lighting and all edge detail.
Scene/backdrop: preserve the perfectly flat uniform #00ff00 chroma-key background edge-to-edge, no gradient, texture, floor, shadow, reflection or scenery; fill all newly exposed area with exactly the same flat green.
Constraints: no new object, no deletion, no crop, no overlap, no long sleeve, forearm, cannon, barrel, shaft, tip, body, debris, detached bolt, second tunnel, text, label, guide, divider, frame, logo or watermark. No rotation, mirroring, nonuniform scaling, perspective change, material change, green spill, clay, vector or 3D-render restyle.
```

Selected built-in output: `/Users/hippoync/.codex/generated_images/019fd553-d249-7883-ae2e-83a0baa8e59e/exec-184de8ce-0ba6-4c2b-899f-bbaa5d96aecc.png`

Workspace copy: `boss-joint-housings-v5-chroma.png`.

## Official alpha extraction

```text
PYTHONPATH=/private/tmp/mirror-me-pillow /usr/bin/python3 \
  /Users/hippoync/.codex/skills/.system/imagegen/scripts/remove_chroma_key.py \
  --input boss-joint-housings-v5-chroma.png \
  --out boss-joint-housings-v5-alpha.png \
  --auto-key border \
  --soft-matte \
  --transparent-threshold 12 \
  --opaque-threshold 220 \
  --despill
```

The selected ImageGen source sampled `#0de929`; the official helper produced the final alpha. `boss-joint-housings-v5-flat-chroma.png` is a deterministic review/source-package copy with only the already-transparent background normalized to exact `#00ff00`. Its second official-helper proof is `boss-joint-housings-v5-flat-helper-alpha.png`; it is not the selected runtime alpha.
