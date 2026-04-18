# Netatmo Siren — Homey Pro App

Fast and exclusive control of **Netatmo Smart Indoor Siren (NIS)** and
**Netatmo Smart Outdoor Camera with siren (NOC)** from Homey Pro — local
and cloud. Built on SDK v3 + `homey-oauth2app`.

---

## 1. Prerequisites

- Homey Pro (SDK v3, firmware ≥ 5.0)
- Node.js ≥ 16
- [pnpm](https://pnpm.io) ≥ 9 — `corepack enable` or `npm i -g pnpm`
- Homey CLI: `pnpm add -g homey`
- A Netatmo developer account + a registered app at
  <https://dev.netatmo.com/apps>
  - **Redirect URI** must be `https://callback.athom.com/oauth2/callback`

## 2. Install

```bash
pnpm install
```

This pulls `homey-oauth2app` (and `source-map-support` for nicer stack traces).

## 3. Configure credentials in the app settings

Credentials are entered by the end-user through the app's Settings page
(no `.env` required). After installing the app on your Homey:

1. Open the Homey app → *More* → *Apps* → *Netatmo Siren* → *Configure app*
2. Paste your **Client ID** and **Client Secret** from
   <https://dev.netatmo.com/apps>
3. Press **Save** — the OAuth2 client is re-configured live

Values are persisted via Homey's `ManagerSettings` (local & encrypted at
rest on Homey Pro). Saving new credentials automatically clears any
previous Netatmo session; re-pair your devices afterwards.

```bash
homey app run
# or, for an installed build:
homey app install
```

## 4. Pair a device

1. Homey app → *Add device* → *Netatmo Siren*
2. Select *Smart Indoor Siren* or *Outdoor Camera Siren*
3. The OAuth2 login view opens — sign in with your Netatmo account
4. Discovered sirens are filtered by type (`NIS` / `NOC`) from
   `/api/homesdata` and listed for pairing

## 5. Project layout

```
com.flx.netatmo-siren/
├── app.js                          # OAuth2App bootstrap
├── app.json                        # Homey manifest (drivers, flow, images)
├── api.js                          # Settings → /reconfigure endpoint
├── settings/
│   └── index.html                  # Settings UI (Client ID / Secret)
├── lib/
│   ├── NetatmoOAuth2Client.js      # OAuth2 client + Netatmo API helpers
│   ├── NetatmoBaseDriver.js        # Shared pairing / homesdata filter
│   └── NetatmoBaseDevice.js        # onoff listener, setstate, timeouts
└── drivers/
    ├── standalone_siren/           # NIS
    │   ├── driver.js
    │   └── device.js
    └── outdoor_camera_siren/       # NOC
        ├── driver.js
        └── device.js
```

## 6. Required assets & icon guidance

You still need to drop SVG/PNG assets into the expected locations before
publishing. Suggested visual direction:

### App icon — `/assets/icon.svg` (+ `images/{small,large,xlarge}.png`)
- **Concept:** A stylised bell or horn emitting three sound arcs on a
  rounded-square badge.
- **Palette:**
  - Background: Netatmo Dark Grey `#2B2B2B`
  - Primary glyph: Warning Gold `#F5A623`
  - Accent arcs: Netatmo Orange `#FF7A00`
- **Style:** Flat, 2-px stroke, 24-px safe area padding, no gradients.

### `drivers/standalone_siren/assets/icon.svg` (NIS)
- A minimalist **indoor siren speaker** (circle + horn slot + LED dot).
- Dark-grey body, orange LED, gold sound wave.

### `drivers/outdoor_camera_siren/assets/icon.svg` (NOC)
- An **outdoor camera silhouette** with a tiny speaker symbol overlay
  on the lower right.
- Same dark-grey base, orange camera lens ring, gold speaker accent.

Export each SVG additionally as `small.png` (75×75), `large.png` (500×500)
and `xlarge.png` (1000×1000) into the matching `assets/images/` folder,
as required by the Homey manifest.

## 7. Flow cards (English copy)

| Type      | ID                  | Title                              |
|-----------|---------------------|------------------------------------|
| Trigger   | `siren_turned_on`   | The siren was activated            |
| Trigger   | `siren_turned_off`  | The siren was deactivated          |
| Condition | `is_siren_sounding` | The siren !{{is\|is not}} sounding |
| Action    | `sound_the_alarm`   | Sound the alarm                    |
| Action    | `silence_the_alarm` | Silence the alarm                  |

## 8. Notes

- Siren state is set via the (undocumented but widely used) endpoint
  `POST /api/setstate` with `siren_status: "sound" | "no_sound"` — the
  helper `NetatmoOAuth2Client#setSirenState()` wraps this.
- Access-token refresh is handled automatically by `homey-oauth2app`;
  device code only ever calls `this.oAuth2Client.*`.
- All API calls are wrapped with a 15 s timeout to prevent hanging flows
  on Netatmo cloud hiccups.
