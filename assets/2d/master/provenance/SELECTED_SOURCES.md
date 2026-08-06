# Selected sprite master provenance

Only the approved masters named by `assets/2d/strips/sprites.json` are retained.
The deterministic builder crops, Lanczos-resizes, and packs those pixels; it
does not generate or repair artwork.

| Set | Retained masters | Runtime role |
| --- | --- | --- |
| rig-v2 | `player-idle-authority-alpha.png`, `player-contact-body-alpha.png`, `player-blade-only-alpha.png`, `boss-idle-authority-alpha.png`, `boss-shaft-tip-kit-alpha.png` | player body/blade, boss idle, shaft/tip |
| rig-v4 | `boss-body-left-armfree-alpha.png`, `boss-body-right-armfree-alpha.png` | directional LOCK/MISS bodies |
| rig-v5 | `boss-joint-housings-v5-alpha.png` | directional MISS housings |

The manifest records each source SHA-256, source rectangle, and named anchor.
The exact rig-v5 ImageGen prompt record, review, and measured housing anchors
are retained in `provenance/rig-v5/`.
