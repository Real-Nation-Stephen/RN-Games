# Event pin board (isolated prototype)

Digital pin board for live events: guests submit photos or sticky notes via QR; staff approve items onto a shared wall with random placement and tilt.

Built in isolation first (like flip-cards Dada test). Data syncs via **localStorage** per `?event=` id until studio/API integration.

## Local dev

From repo root:

```bash
npm run dev -w @rngames/player
```

| Surface | URL |
|--------|-----|
| Config lab | http://localhost:5173/play/pinboard-lab.html?event=demo |
| Live board | http://localhost:5173/play/pinboard-board.html?event=demo |
| Mobile submit | http://localhost:5173/play/pinboard-submit.html?event=demo |
| Moderator | http://localhost:5173/play/pinboard-moderate.html?event=demo |

Use the **same** `event` query in all tabs. Open board + moderator on a laptop and submit on a phone (or another browser tab).

## Demo flow

1. Open **Config lab** — tweak branding, save.
2. Open **Live board** on the venue screen.
3. Open **Moderator** on a staff device.
4. Scan the board QR (or open **Mobile submit**) — take a photo or write a note, submit.
5. In moderator **Queue**, approve or reject. Approved items appear on the board with slight random rotation.
6. **On board** tab — remove individual pins if needed.
7. **Clear board** — double confirmation; removes approved items only (pending queue stays).

## Features (prototype)

- **Board:** header/subhead colours, optional background image toggle, brand logo (corner), QR bottom-right (no Powered by badge), polaroid option on photos, random placement with overlap control that relaxes as the board fills.
- **Submit:** selfie (camera/upload) → **photo editor** (optional frames &amp; stickers: drag, pinch to scale, twist to rotate), sticky notes (type or draw) composited onto brand sticky PNGs.
- **Studio setting:** `photoPublishMode` — board shows raw photo, uniform frame, or guest’s edited composite (see config lab).
- **Moderator:** approve/reject queue, per-item removal, clear board with confirmation.
- **Lab:** game details (title, client, slug, favicon) plus surface branding fields.

## Storage keys

- `rngames-pinboard-config:{eventId}`
- `rngames-pinboard-state:{eventId}`

## Next steps (studio)

- `gameType: "pinboard"` in admin + Netlify API
- Real uploads instead of data URLs
- WebSocket or polling for multi-device sync without localStorage
