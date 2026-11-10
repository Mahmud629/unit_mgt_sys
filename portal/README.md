# 5 SIG BN — Unit Systems Portal

One home page for the unit's systems: crest, a scrolling ribbon of **daily activities
pictures** (from the `activities` folder), and one tile per module — five UMS modules and the
inventory. Click a tile or press **1**–**6**. Live Bangladesh date and time, **EN / বাংলা**,
dark / light mode, a green / red dot per system (running or not) and a "last used" mark.
Works fully offline on the LAN and on phones.

## How it starts

Start everything with **START-ALL.bat** in the folder above (see the main README).
It runs `node portal\serve.mjs`, which:

| Does | Port |
|---|---|
| serves this page | 8080 |
| serves the built UMS (`../ums/out`; installs and builds it the first time) | 8081 |
| starts the inventory server (`npm run start:portal` in `../inventory`; installs and builds it the first time) | 8082 |

`node portal\serve.mjs --rebuild` (REBUILD-ALL.bat) rebuilds both systems first.
Ctrl+C stops all of them.

## config.js

Everything is in **config.js** — names (English and Bangla), colours,
`url` (keep `{host}` so the same file works on every computer) and an optional `logo` picture
(put the file in `assets/`). Save and refresh the page — nothing to build.

- `tiles` — the tiles of each system (name, Bangla name, icon or logo, colour, `path` added to the url).
  UMS tiles use `go/?to=<module>`: personnel, parade, training, officers, daily, admin.
- `activities` — folder of the pictures, how many to show (`max`) and the speed (`secondsPerPicture`).
- `serve: { folder, port, build }` — a system that is a folder of built pages (UMS).
- `run: { folder, script, port }` — a system with its own Node server (inventory).
- A system with neither is only linked; start it yourself.

## Pictures

Put .jpg / .png / .webp files in `activities\`, named like `2026-10-25 Annual Firing.jpg`.
`serve.mjs` lists them at `/activities.json` (newest first). If the page is opened some other way,
list the file names in config.js: `activities: { list: ["a.jpg", "b.jpg"] }`.
