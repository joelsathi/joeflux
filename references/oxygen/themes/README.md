# Oxygen theme references

Unmodified source files from [WSO2 Oxygen UI](https://github.com/wso2/oxygen-ui/tree/c5bd93c5ec810c4759f8e04e66dd6e1f38485fec/packages/oxygen-ui/src/styles/Themes), pinned at `c5bd93c5ec810c4759f8e04e66dd6e1f38485fec` (retrieved 2026-09-23). Copyright 2025–2026 WSO2 LLC. Apache-2.0; full license in `../LICENSE`. `manifest.json` records source hashes.

`packages/presets/src/oxygen-themes.js` adapts these definitions to the harness's Canvas renderer: primary/text/paper/divider colors, radial stops, centers, light/dark schemes and background blend modes. `AcrylicBaseTheme.ts` supplies the common Acrylic palette. Pale Indigo and Gray provide flat backgrounds. The WSO2 source supplies its own orange and navy values, separate from the preserved legacy harness palette.

Adaptations: CSS custom properties resolve to the selected mode's literal colors; radial circles use CSS farthest-corner geometry; duplicate descending CSS stop positions resolve to their clamped equivalent. WSO2's single-color linear background is treated as a solid color. Local Inter is used for offline video typography. Particle and border fallback colors are harness choices. Acrylic surface alpha is retained; this does not import MUI component behavior or its backdrop-blur effects.

These are static backgrounds. No animated-gradient library is claimed or bundled. Theme additions do not modify the existing `light-blue` and `wso2-dark` definitions.
