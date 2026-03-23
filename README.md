# Videogame Atlas

Static videogame catalog app built from system and per-system game exports.

The first pass is shaped around RetroAchievements-style source files because that source already exposes the exact hierarchy we want: all systems, then all games for each system. The generated bundle is intentionally normalized so we can enrich it later with the same media and metadata providers Batocera exposes in its scraper settings.

## Open the app

Open `index.html` in a browser. The app loads local JavaScript data files, so it does not require a dev server just to browse the catalog.

## Rebuild the database

Run:

```bash
python3 videogame-atlas/scripts/build_game_data.py
```

The generator writes:

- `data/game-database.json`
- `data/game-database.js`

## Raw input files

The builder looks for these files in `data/raw`:

- `batocera-library.json` (optional generated Batocera import)
- `retroachievements-systems.json`
- `retroachievements-game-list-<system-id>.json`
- `batocera-provider-catalog.json`
- `screenscraper-system-map.json` (optional but recommended for live ScreenScraper fetches)
- `system-enrichment.json` (optional)
- `game-enrichment.json` (optional)
- `screenscraper-game-enrichment.json` (optional generated enrichment)

The checked-in sample data gives the project a working local demo even without API credentials.

## Current sample coverage

- 3 systems
- 9 system-scoped game entries
- optional enrichment for release year, developer, publisher, genre, and summary
- optional generated ScreenScraper enrichment merge for live metadata and media URLs
- optional Batocera gamelist import that can become the primary catalog source

## Why this shape

- Systems are the primary navigation layer because that is the clearest equivalent to the dinosaur app's taxonomy browse.
- Games are currently stored as system-scoped release entries. That avoids incorrect cross-platform merges when two ports share a title but differ materially.
- Optional enrichment lets us merge in better metadata and media later without changing the UI contract.
- Each game can now distinguish its base catalog source from its metadata source and its box-art source.

## Batocera-aligned scraper sources

- [Batocera Scrape From](https://wiki.batocera.org/scrape_from): documents Arcade Database, theGameDB, Screenscraper, and IGDB as scraper sources
- [ScreenScraper](https://screenscraper.fr/): richest media options, especially for box art, logos, screenshots, and video previews
- [TheGamesDB](https://thegamesdb.net/): community metadata and art source exposed by Batocera
- [Arcade Database](https://adb.arcadeitalia.net/): arcade-specific source for MAME-oriented records
- [IGDB API docs](https://api-docs.igdb.com/?getting-started=): Batocera-supported metadata source requiring Client ID and Client secret

## Live ScreenScraper fetches

The project now includes `scripts/fetch_screenscraper_data.py`, which can generate `data/raw/screenscraper-game-enrichment.json` from the current game list inputs.

It reads credentials from environment variables instead of hardcoding them:

- `SCREENSCRAPER_USER`
- `SCREENSCRAPER_PASSWORD`
- `SCREENSCRAPER_DEV_LOGIN`

The important constraint is that Batocera's own ScreenScraper code uses both your user credentials and an app-level developer login string. In Batocera's scraper source, requests are built with a compile-time `SCREENSCRAPER_DEV_LOGIN` plus the user `ssid` and `sspassword`, so your account login alone is not enough for direct API calls.

Use the checked-in template:

```bash
cp videogame-atlas/.env.example videogame-atlas/.env.local
```

Then fill in your own values locally and run:

```bash
set -a
source videogame-atlas/.env.local
set +a
python3 videogame-atlas/scripts/fetch_screenscraper_data.py --limit 20 --write-user-info
python3 videogame-atlas/scripts/build_game_data.py
```

The generated ScreenScraper enrichment file is merged on top of the manual `game-enrichment.json` layer during build, which means live box-art URLs and metadata can replace the current sample placeholders without changing the UI contract.

## Batocera import

The project also supports importing Batocera's own scraped catalog directly from per-system `gamelist.xml` files with `scripts/import_batocera_data.py`.

Fastest path from a mounted Batocera share:

```bash
python3 videogame-atlas/scripts/import_batocera_data.py \
  --roms-root /path/to/batocera/roms \
  --systems gb megadrive
python3 videogame-atlas/scripts/build_game_data.py
```

By default, the Batocera importer keeps only box-art image references from each `gamelist.xml` entry and intentionally ignores videos, marquees, thumbnails, and other extra media. That makes the import much lighter while still giving the atlas a strong visual browse experience.

If you want a local image mirror instead of linking to the mounted share, you can copy just the referenced box art:

```bash
python3 videogame-atlas/scripts/import_batocera_data.py \
  --roms-root /path/to/batocera/roms \
  --copy-box-art-root videogame-atlas/imported-box-art
```

When `data/raw/batocera-library.json` exists, the atlas build treats it as the primary catalog source instead of the sample RetroAchievements dataset.

## Portable GitHub plus CDN publish flow

For local browsing, the imported Batocera dataset can point directly at machine-local `file:///...` box-art URLs. That is convenient on one machine, but it will not travel with a GitHub-hosted atlas.

To make the atlas portable, build it with a staged box-art directory plus a web base URL:

```bash
python3 videogame-atlas/scripts/build_game_data.py \
  --publish-box-art-root /path/to/videogame-atlas-publish/box-art \
  --publish-box-art-base-url https://cdn.example.com/videogame-atlas/box-art
```

That publish build does three things:

- copies only the referenced Batocera box art into the staging directory
- rewrites each game's image URL to the configured web base URL
- leaves videos, marquees, and other extra media out of the publish payload

After that:

- upload the staged `box-art` directory to your bucket or CDN
- commit and publish the atlas app itself from GitHub
- the browser will simply request the configured `https://...` box-art URLs from the generated atlas data

The same app code works in both modes. The only thing that changes is the URL stored in the data bundle.

## Draft bundle for review

If you want a GitHub Pages-ready bundle you can publish from the repository itself, use `scripts/build_publish_bundle.py`:

```bash
python3 videogame-atlas/scripts/build_publish_bundle.py
```

That writes a self-contained bundle to `videogame-atlas/docs` with:

- `index.html`, `app.js`, and `styles.css`
- a generated `data/game-database.json` and `data/game-database.js`
- a `box-art/` folder containing only the referenced Batocera box art

By default the draft bundle uses relative `./box-art/...` URLs, so you can inspect it locally. When you are ready to point the site at a bucket or CDN, rerun it with an explicit web base URL:

```bash
python3 videogame-atlas/scripts/build_publish_bundle.py \
  --box-art-base-url https://cdn.example.com/videogame-atlas/box-art \
  --box-art-staging-dir /path/to/videogame-atlas-publish/box-art
```

GitHub Pages can publish directly from the `docs/` directory on your default branch, which makes that folder the clean handoff point for the public site.
