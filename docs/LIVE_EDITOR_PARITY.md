# Live editor parity checklist

New live component editors follow the existing Mini Quiz / shared-control pattern. They are not a new authoring schema. Heineken (or any client) is configuration on records, never a hardcoded editor skin.

Baseline: `packages/admin/src/pages/MiniQuizEditor.tsx` plus `HexField`, `BgUploadRow`, `CollapsibleSection`, `ComponentMetadataFields`.

## Reused controls

| Convention | Mini Poll | Fill Game | Live Flow join screen |
| --- | --- | --- | --- |
| Component details first (title, client, sub-URL) | Yes | Yes | Flow uses experience title/slug (existing) |
| `ComponentMetadataFields` (project/design, archive) | Yes | Yes | Existing experience metadata |
| Favicon + Powered by | Yes | Yes | N/A on join card |
| Save / Saving… / error / Delete | Yes | Yes | Existing Save / Publish / Delete |
| `HexField` for every colour | Yes (`LiveSurfaceBrandingFields`) | Yes, plus team/fill HexFields | Yes |
| `BgUploadRow` for images | Yes | Yes | Yes |
| `CollapsibleSection` for advanced backgrounds/fonts | Yes | Yes (also mask placement) | Custom fonts |
| Font **file** upload → `{ url, family }` + CSS stack | Heading / body / button | Same | Same |
| Runtime `@font-face` from upload URL | `applyUploadedFonts` in `theme.ts` | Same | Same |
| Live preview of **unsaved** changes | Iframe `preview=1` + `postMessage` | Same | Flow preview remains saved-tab (existing experience behaviour) |
| Debounced config push + Refresh preview | Yes (80ms, Mini Quiz pattern) | Yes | N/A |

## Justified live-only differences

- **Presenter / phone backgrounds**, not Mini Quiz desktop/tablet/mobile. Live has two surfaces (audience screen and join phones), not three layout breakpoints.
- **Preview state selector** (poll: ready / open / tallying / revealed; fill: ready / in progress / winner). Needed because live components have host-driven phases. Toggles are local to the iframe.
- **Preview never touches a live run.** `packages/player/src/live/preview.ts` does not call `live-run`, `live-join`, `live-action`, or `live-control`. Votes and fill answers in preview are inert. Saved-slug `/mini-poll/:slug` still loads **saved** library JSON via `public-wheel` only.
- **Fill mask placement** is a live gameplay control, collapsed as the fill window. Percentages are of the meter artboard; **0 is valid** and must survive save/reload (`Number(x) || default` is not used). Optional overlay (`foregroundUrl`) sits on the same canvas as the mask. Not a keg-specific control.
- **Landing / interstitial Flow nodes** stay not live-capable (`isLiveCapableType`). Experience editor lists skipped types; they are not silently treated as live.

## Explicitly not claimed

- Thumbnail upload is not on Mini Quiz either; not added as a dummy control.
- Desktop/tablet/mobile breakpoint backgrounds are not used on live components.
- Heineken artwork, bar-staff copy, and Figma skins are content — not editor chrome.

## Verification (authoring)

Exercise create → save → reload for Mini Poll and Fill: client, Hex colours, Presenter/phone backgrounds, font uploads, and preview of unsaved edits without a live run changing.
