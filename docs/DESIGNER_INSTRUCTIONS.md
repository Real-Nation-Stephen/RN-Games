# Designer Instructions — Real Nation Game Studio

This guide is for **designers and producers** who build games in Studio. You only need the editor — no coding required.

Each game type has its own section below, using the same four-part structure. When new games or editor panels are added, this document is updated to match.

---

## Using Studio (all games)

| Action | What it does |
|--------|----------------|
| **Save** | Stores your changes so the public game URL uses them. |
| **Save + thumbnail** | Saves, then captures a preview image for the game list in Studio. |
| **Live preview** | Shows the game in an embedded window. Updates as you edit (may need **Refresh preview**). Preview changes are **not** live for players until you **Save**. |
| **Open public game** | Opens the real player URL in a new tab — best for final checks. |
| **Embed code** | HTML snippet to place the game on a client website. |

**Tips**

- Upload **PNG with transparency** for sprites and logos when you need see-through areas.
- Keep image files reasonably small (under ~3 MB each) so uploads stay fast.
- **Desktop / tablet / mobile** backgrounds are chosen automatically based on the player’s device — upload all three for best results.
- **Hex colour fields** accept values like `#ffffff`. Use your brand palette; the game fills in matching UI automatically.
- If something looks wrong on phone, check the **mobile** background and asset sizes first.

---

## Catch game

A timed arcade game: the player moves a **catcher** left and right to collect falling **positive items** (points) and avoid **negative items** (penalties).

### 01 — Components and structure

What the player sees, in order:

| Screen | Required? | Purpose |
|--------|-----------|---------|
| **Name entry** | Optional | Shown only if a **linked leaderboard** is set **and** **Collect player name before play** is enabled. Player enters initials/name for the leaderboard. |
| **Intro / info** | Yes | Explains which items to catch and which to avoid. Shows each item sprite and its point value. |
| **Start + swipe hint** | Yes | Brief “ready” moment. Shows your swipe hint text and a movement animation. Player taps or swipes to begin. |
| **Countdown** | Yes | 3‑2‑1 on screen, then the round starts. |
| **Game** | Yes | Banner (logo), score, timer, falling items, and the catcher. Player swipes or drags to move. |
| **End screen** | Yes | Final score, optional logo/headline, **Play again**, and optional **link button**. |

**Always on during play:** top **banner** (brand bar + logo), **score** (top left), **timer** (top right).

**Optional in-game chrome:** mute button (bottom corner). No fullscreen button on Catch (Runner has one).

---

### 02 — Assets

| Asset | Required? | Recommended specs | What it’s for |
|-------|-----------|-------------------|---------------|
| **Banner logo** | Optional | PNG/SVG, transparent background; wide logo works best | Brand mark in the top bar throughout the game |
| **Catcher sprite** | Recommended | PNG with transparency; roughly square art | The basket/hand/character the player moves |
| **Positive item sprite(s)** | At least one | PNG, transparent; square art (~1:1) | Collectibles that **add points** (and optionally **add time** if that mode is on) |
| **Negative item sprite(s)** | Optional | Same as positive | Penalty items — **hidden entirely** if **Positive items only** is enabled |
| **Game background — desktop** | Optional | **1920×1080** landscape | Fills screen height, centred horizontally on large screens |
| **Game background — tablet** | Optional | **1536×2048** portrait | Used on medium portrait devices |
| **Game background — mobile** | Optional | **1080×1920** portrait | Used on phones |
| **Fallback colour** | Yes (default set) | Hex colour | Shown if no background image is uploaded for that device |
| **End screen logo** | Optional | PNG/SVG | Logo on the results screen |
| **End screen backgrounds** | Optional | Same sizes as game backgrounds | Behind the end screen (can differ from in-game art) |
| **Tab icon (favicon)** | Optional | PNG, ICO, or SVG; small square | Browser tab icon |
| **Positive catch SFX** | Optional | Short audio file | Sound when catching a good item |
| **Negative catch SFX** | Optional | Short audio file | Sound when catching a bad item |
| **End of round SFX** | Optional | Short audio file | Sound when time runs out |
| **Background music** | Optional | Looping audio | Plays during the round (respects mute) |
| **Custom fonts** | Optional | WOFF, WOFF2, TTF, or OTF | **heading**, **body**, and **score** text styles |

**Sprite behaviour notes**

- **Falling items** are drawn as **squares**; size is controlled by **Item size** in Gameplay (default 72 px).
- **Catcher** art is scaled to fit **Catcher width** × **Catcher height**; hit detection matches what you see.
- You can add **multiple variants** of positive or negative items (e.g. “+1” and “+5” bottles) — the game picks randomly among uploaded sprites.

---

### 03 — Editor components overview

| Panel | Purpose |
|-------|---------|
| **Game details** | Title, client name, public URL (slug), reporting, favicon, “Powered by” credit |
| **Banner** | Top bar colour, logo, logo alignment |
| **Gameplay** | Round length, difficulty ramp, items, intro copy, leaderboard/name settings |
| **Sprites** | Catcher and all falling item artwork |
| **Game backgrounds** | In-game backdrop per device type + fallback colour |
| **HUD colours** | Score, timer, and label text colours |
| **Audio** | Catch sounds, end sound, music, music volume |
| **Fonts** | Optional custom typefaces |
| **End screen** | Results layout, copy, colours, optional link, end backgrounds |
| **Live preview** | Test the game, copy embed code, open public URL |
| **Save / Delete** | Persist or remove the game |

---

### 04 — Editor components detail (glossary)

#### Game details

| Input | What it does |
|-------|----------------|
| **Title** | Internal and public game name (browser title, embed title). |
| **Client** | Client or campaign name (for your records in Studio). |
| **Sub-URL (slug)** | The URL path players use, e.g. `yoursite.com/catch/my-game`. Use lowercase, no spaces. Changing this breaks old links. |
| **Enable reporting** | Turns on play analytics for this game (internal use). |
| **Tab icon** | Small icon in the browser tab. |
| **Show “Powered by Real Nation”** | Toggles the credit logo on the public page. |

#### Banner

| Input | What it does |
|-------|----------------|
| **Banner colour** | Background colour of the top brand bar. |
| **Logo** | Image shown in the banner. |
| **Logo alignment** | Left, centred, or right within the banner. |

#### Gameplay

| Input | What it does |
|-------|----------------|
| **Round duration (seconds)** | Length of each round (10–300 s). Timer counts down to zero, then the end screen shows. |
| **Item size (px)** | Display size of falling sprites (32–160). **Larger** = easier to see and hit; may feel crowded if too big. |
| **Fall speed start** | How fast items fall at the **beginning** of the round (px per second). **Higher** = harder immediately. |
| **Fall speed end** | Fall speed at the **end** of the round. Usually **higher than start** so difficulty ramps up. |
| **Spawn interval start (ms)** | Time between new items at round **start**. **Higher** = fewer items, calmer start. |
| **Spawn interval end (ms)** | Time between spawns at round **end**. **Lower** = more items, busier finish. |
| **Positive item % start** | Chance a spawn is a **positive** item at round start (0–100%). |
| **Positive item % end** | Chance at round end. Often **lower** than start to make the end harder (more penalties). |
| **Swipe hint text** | Short instruction on the pre-start screen (e.g. “Swipe to move”). |
| **Positive item line** | Intro heading above good items. |
| **Negative item line** | Intro heading above bad items (hidden if positive-only mode). |
| **Next button label** | Text on the button that leaves the intro (e.g. “Next”). |
| **Positive items only** | When on: no negative items spawn and the negative intro block is hidden. |
| **Points add/remove time** | When on: catching an item changes the clock by its **point value** in seconds (+5 pts → +5 s, −3 pts → −3 s). |
| **Linked leaderboard** | Sends scores to a leaderboard you’ve already created in Studio. Choose **None** to disable. |
| **Collect player name before play** | Shows the name screen when a leaderboard is linked. |
| **Name character limit** | Max letters for the player name (1–32). |

#### Sprites

| Input | What it does |
|-------|----------------|
| **Catcher sprite** | Image for the player-controlled catcher. |
| **Catcher width / height (px)** | Box the sprite fits inside (40–420 each). Wider/taller = bigger hit area. |
| **Positive items** | Upload one or more good item sprites. Set **pts** per variant (1–99). Add rows with **Add positive item**. |
| **Negative items** | Upload penalty sprites. **penalty** is how many points are lost (1–99). Remove variants with **Remove** if more than one row. |

#### Game backgrounds

| Input | What it does |
|-------|----------------|
| **Fallback colour** | Solid colour if no image is set for the player’s device type. |
| **Desktop / Tablet / Mobile** | Background images; see asset table for recommended pixel sizes. Images scale to **fit screen height** and centre horizontally. |

#### HUD colours

| Input | What it does |
|-------|----------------|
| **Score hex** | Colour of the score number. |
| **Timer hex** | Colour of the countdown timer. |
| **Label hex** | Colour of the small “Score” / “Time” labels. |

#### Audio

| Input | What it does |
|-------|----------------|
| **Positive / Negative catch SFX** | Short sounds on catch. |
| **End of round SFX** | Plays when the timer hits zero. |
| **Background music** | Loops during play. |
| **Music volume (0–1)** | Loudness of music (0 = silent, 1 = full). Player mute button still applies. |

#### Fonts

| Input | What it does |
|-------|----------------|
| **heading** | Font for large titles (intro, end headline). |
| **body** | General UI text. |
| **score** | Score and timer numerals (falls back to body if empty). |

#### End screen

| Input | What it does |
|-------|----------------|
| **Logo** | Optional image above the headline. |
| **Headline / Subhead** | Main and secondary messages (e.g. “Time’s up!” / “Nice catching.”). |
| **Score prefix** | Text before the number (e.g. “Score:” → “Score: 42”). |
| **Play again label** | Button to restart (returns to intro, not name entry). |
| **Headline / Subhead / Button hex** | Text and button colours. |
| **Show optional link button** | Adds a second button (e.g. “Learn more”). |
| **Link button label / URL** | Button text and destination (full `https://` URL). |
| **Link button hex / text hex** | Link button styling. |
| **End screen desktop / tablet / mobile BG** | Optional backgrounds behind the end card (same size hints as game backgrounds). |

#### Live preview & actions

| Input | What it does |
|-------|----------------|
| **Refresh preview** | Pushes your current editor settings into the preview iframe. |
| **Open public game** | Opens the saved public URL (save first). |
| **Embed code** | Copy-paste iframe snippet for client sites. |
| **Save** | Writes all settings to the server. |
| **Save + thumbnail** | Save and update the catalogue thumbnail from the preview. |
| **Delete game** | Permanently removes this game and its URL. |

---

## Suggested sections for future updates

When adding new games, consider including these if they apply:

1. **Pre-launch checklist** — save, test mobile + desktop, verify leaderboard, check audio muted/unmuted.
2. **Player controls** — touch, keyboard, or controller (Runner documents this separately).
3. **Difficulty / ramping** — any start-vs-end values explained in plain language.
4. **Troubleshooting** — common mistakes (wrong slug, missing save, transparent PNG exported as JPEG, etc.).
5. **Brand / legal** — favicon, powered-by credit, client sign-off.

---

## Other game types

| Game | Status |
|------|--------|
| **Runner** | Guide not yet added — use this document’s structure when ready. |
| **Catch** | Complete (above). |
| *Others* | Added here as Studio grows. |

*Last updated: Catch game — matches Studio editor as of June 2026.*
