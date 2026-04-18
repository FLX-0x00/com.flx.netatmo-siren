# Netatmo Community — Homey Pro App

A community-built Homey Pro (SDK v3) integration for **Netatmo Security** devices.
The focus is on making every useful Netatmo event reachable from Homey Flow so
you can actually automate your home around it.

> This app only uses the **public Netatmo Connect API** and the standard
> `read_camera` / `write_camera` / `read_presence` / `write_presence` scopes.
> No `access_*` whitelist is required. Anyone with a Netatmo developer account
> can run this.

## Supported devices

| Device                       | Netatmo type | Monitoring on/off | Floodlight | Events |
|------------------------------|--------------|-------------------|------------|--------|
| Smart Indoor Camera (Welcome) | `NACamera`   | ✅                 | —          | motion, person, unknown person, person left/came home, connect/disconnect, monitoring on/off |
| Smart Outdoor Camera (Presence) | `NOC`      | ✅                 | on/off/auto | human, vehicle, animal, motion, siren start/stop (read-only), floodlight changed, daily summary, connect/disconnect, monitoring on/off |
| Smart Video Doorbell         | `NDB`        | —                 | —          | rang, call accepted, call missed, motion |

### What the app cannot do

- **Trigger the siren.** Netatmo's `/api/setstate` endpoint does not accept
  `siren_status` for third-party apps — controlling the siren requires the
  `access_*` scope whitelist that Netatmo only grants to contracted partners.
  The app can still *observe* the siren (`Siren started/stopped sounding` triggers).
- **Live video.** Same reason: `vpn_url` / `local_url` access is gated by
  `access_*` scopes.

## Flow cards

### Triggers (when…)

- **Any camera / doorbell** — *motion detected*, *camera came online / went offline*
- **Indoor camera** — *person detected* (with autocomplete), *unknown person detected*,
  *person left home*, *person came home*, *monitoring turned on / off*
- **Outdoor camera** — *human / vehicle / animal detected*, *siren started / stopped sounding*,
  *floodlight mode changed*, *daily summary ready*, *monitoring turned on / off*
- **Doorbell** — *doorbell was pressed*, *call accepted*, *call missed*

### Conditions (and…)

- Monitoring is on
- Floodlight mode is on/off/auto
- Siren is sounding
- Person is home (with autocomplete)

### Actions (then…)

- Turn monitoring on / off (indoor + outdoor camera)
- Set floodlight to on / off / auto (outdoor camera)
- Mark person as home / away (indoor camera)
- Mark home as empty

## Architecture

```
┌──────────────┐   OAuth2   ┌───────────────────┐
│  Homey App   │──────────▶ │  api.netatmo.com  │
└──────┬───────┘            └─────────┬─────────┘
       │                              │
       │   every 20 s:                │
       │   GET /api/homestatus        │
       │   GET /api/getevents         │
       │                              │
       ▼                              │
┌──────────────────┐                  │
│ NetatmoHomePoller│◀─────────────────┘
│  (one per home)  │
└──────┬───────────┘
       │ emit 'device' / 'event'
       ▼
┌──────────────────┐
│   Device (per    │  → updates capabilities
│   module)        │  → fires Flow triggers
└──────────────────┘
```

No webhook registration is required; the app polls `/homestatus` +
`/getevents` at a configurable interval (default 20 s). Events already
present at startup are seeded into a "seen" set so you don't get a
flood of historical triggers on first run.

## Setup

1. Create a Netatmo app at <https://dev.netatmo.com/apps> and set the
   redirect URI to the one Homey displays on the OAuth2 login screen.
2. In Homey → Apps → Netatmo Community → **Settings**: paste the
   *Client ID* and *Client Secret*. The app auto-restarts.
3. Pair any camera / doorbell via the normal "Add device" flow.

## Tech stack

- Homey SDK **v3**, `homey-oauth2app` v3.4
- **pnpm** (`pnpm@10.33.0`, `node-linker=hoisted`)
- Icons: [Phosphor Icons](https://phosphoricons.com) (MIT)

## Scripts

```sh
pnpm install
homey app validate --level debug
homey app run
```

## License

MIT.
