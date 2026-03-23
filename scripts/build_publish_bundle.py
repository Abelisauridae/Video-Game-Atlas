#!/usr/bin/env python3

from __future__ import annotations

import argparse
import json
import shutil
from pathlib import Path

import build_game_data


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUTPUT_DIR = ROOT / "docs"
STATIC_FILES = ("index.html", "app.js", "styles.css")


def compact_text(value: object, limit: int) -> str | None:
    cleaned = build_game_data.text(value)
    if not cleaned:
        return None
    if len(cleaned) <= limit:
        return cleaned
    return cleaned[: limit - 1].rstrip() + "..."


def sanitize_asset_strategy(asset_strategy: object) -> dict:
    payload = asset_strategy if isinstance(asset_strategy, dict) else {}
    return {
        "mode": payload.get("mode"),
        "boxArtBaseUrl": payload.get("boxArtBaseUrl"),
        "boxArtStagingDir": "./box-art" if payload.get("boxArtBaseUrl") else None,
        "publishedGameImageCount": payload.get("publishedGameImageCount", 0),
        "missingBoxArtCount": payload.get("missingBoxArtCount", 0),
        "copiedAssetCount": payload.get("copiedAssetCount", 0),
    }


def sanitize_source_list(sources: object) -> list[dict]:
    if not isinstance(sources, list):
        return []

    sanitized = []
    for source in sources:
        if not isinstance(source, dict):
            continue
        url = build_game_data.text(source.get("url"))
        if url and not url.startswith(("http://", "https://")):
            url = None
        sanitized.append(
            {
                "name": source.get("name"),
                "url": url,
                "role": source.get("role"),
            }
        )
    return sanitized


def compact_database_for_publish(database: dict) -> dict:
    metadata = database.get("metadata", {}) if isinstance(database.get("metadata"), dict) else {}
    systems = database.get("systems", []) if isinstance(database.get("systems"), list) else []
    games = database.get("games", []) if isinstance(database.get("games"), list) else []

    compact_systems = []
    for system in systems:
        if not isinstance(system, dict):
            continue
        compact_systems.append(
            {
                "id": system.get("id"),
                "key": system.get("key"),
                "name": system.get("name"),
                "shortName": system.get("shortName") or system.get("name"),
                "manufacturer": system.get("manufacturer"),
                "category": system.get("category"),
                "generation": system.get("generation"),
                "releaseYear": system.get("releaseYear"),
                "endYear": system.get("endYear"),
                "summary": compact_text(system.get("summary"), 320),
                "wikiUrl": system.get("wikiUrl"),
                "gameCount": system.get("gameCount"),
                "topGenres": system.get("topGenres") if isinstance(system.get("topGenres"), list) else [],
                "sourceAttribution": {
                    "metadataProvider": ((system.get("sourceAttribution") or {}).get("metadataProvider")),
                },
            }
        )

    compact_games = []
    for game in games:
        if not isinstance(game, dict):
            continue
        media = game.get("media") if isinstance(game.get("media"), dict) else {}
        box_front = media.get("boxFront") if isinstance(media.get("boxFront"), dict) else {}
        batocera = game.get("batocera") if isinstance(game.get("batocera"), dict) else {}
        compact_games.append(
            {
                "id": game.get("id"),
                "title": game.get("title"),
                "systemId": game.get("systemId"),
                "releaseYear": game.get("releaseYear"),
                "developer": game.get("developer"),
                "publisher": game.get("publisher"),
                "genres": game.get("genres") if isinstance(game.get("genres"), list) else [],
                "summary": compact_text(game.get("summary"), 420),
                "media": {
                    "boxFront": {
                        "url": box_front.get("url"),
                        "provider": box_front.get("provider"),
                        "alt": box_front.get("alt"),
                    }
                },
                "sourceAttribution": {
                    "metadataProvider": ((game.get("sourceAttribution") or {}).get("metadataProvider")),
                    "boxArtProvider": ((game.get("sourceAttribution") or {}).get("boxArtProvider")),
                    "scraperGameId": ((game.get("sourceAttribution") or {}).get("scraperGameId")),
                },
                "batocera": {
                    "players": batocera.get("players"),
                    "region": batocera.get("region"),
                    "language": batocera.get("language"),
                    "family": batocera.get("family"),
                    "rating": batocera.get("rating"),
                },
            }
        )

    compact_metadata = {
        "generatedAt": metadata.get("generatedAt"),
        "systemCount": metadata.get("systemCount"),
        "gameCount": metadata.get("gameCount"),
        "manufacturers": metadata.get("manufacturers") if isinstance(metadata.get("manufacturers"), list) else [],
        "topGenres": metadata.get("topGenres") if isinstance(metadata.get("topGenres"), list) else [],
        "batoceraProviders": metadata.get("batoceraProviders")
        if isinstance(metadata.get("batoceraProviders"), list)
        else [],
        "atlasStrategy": metadata.get("atlasStrategy") if isinstance(metadata.get("atlasStrategy"), dict) else {},
        "providerUsage": metadata.get("providerUsage") if isinstance(metadata.get("providerUsage"), dict) else {},
        "catalogSource": metadata.get("catalogSource"),
        "notes": metadata.get("notes") if isinstance(metadata.get("notes"), list) else [],
        "sources": sanitize_source_list(metadata.get("sources")),
        "assetStrategy": sanitize_asset_strategy(metadata.get("assetStrategy")),
    }

    return {
        "metadata": compact_metadata,
        "systems": compact_systems,
        "games": compact_games,
    }


def write_database_bundle(output_dir: Path, database: dict) -> None:
    data_dir = output_dir / "data"
    data_dir.mkdir(parents=True, exist_ok=True)
    (data_dir / "game-database.json").write_text(
        json.dumps(database, indent=2, ensure_ascii=True) + "\n",
        encoding="utf-8",
    )
    (data_dir / "game-database.js").write_text(
        "window.VIDEOGAME_ATLAS_DATA = " + json.dumps(database, ensure_ascii=True) + ";\n",
        encoding="utf-8",
    )


def copy_static_shell(output_dir: Path) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)
    for filename in STATIC_FILES:
        shutil.copyfile(ROOT / filename, output_dir / filename)
    (output_dir / ".nojekyll").write_text("\n", encoding="utf-8")


def write_build_info(output_dir: Path, database: dict) -> None:
    asset_strategy = database.get("metadata", {}).get("assetStrategy", {})
    build_info = {
        "catalogSource": database.get("metadata", {}).get("catalogSource"),
        "systemCount": database.get("metadata", {}).get("systemCount"),
        "gameCount": database.get("metadata", {}).get("gameCount"),
        "assetStrategy": asset_strategy,
        "openFile": "index.html",
    }
    (output_dir / "build-info.json").write_text(
        json.dumps(build_info, indent=2, ensure_ascii=True) + "\n",
        encoding="utf-8",
    )


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Build a portable videogame atlas bundle for local review or static hosting."
    )
    parser.add_argument(
        "--output-dir",
        default=str(DEFAULT_OUTPUT_DIR),
        help="Directory where the publishable atlas bundle should be written.",
    )
    parser.add_argument(
        "--box-art-base-url",
        default="./box-art",
        help="Base URL for published box art. Use a relative path for local drafts or an https URL for CDN hosting.",
    )
    parser.add_argument(
        "--box-art-staging-dir",
        default=None,
        help="Optional directory to receive copied box art. Defaults to <output-dir>/box-art.",
    )
    parser.add_argument(
        "--batocera-roms-root",
        default=None,
        help="Optional Batocera roms root to use when a scrubbed import needs box art copied into the publish bundle.",
    )
    args = parser.parse_args()

    output_dir = Path(args.output_dir).expanduser().resolve()
    box_art_staging_dir = (
        Path(args.box_art_staging_dir).expanduser().resolve()
        if args.box_art_staging_dir
        else (output_dir / "box-art")
    )

    database = build_game_data.build_database(
        publish_box_art_root=box_art_staging_dir,
        publish_box_art_base_url=args.box_art_base_url,
        batocera_roms_root=Path(args.batocera_roms_root).expanduser().resolve()
        if args.batocera_roms_root
        else None,
    )
    publish_database = compact_database_for_publish(database)
    copy_static_shell(output_dir)
    write_database_bundle(output_dir, publish_database)
    write_build_info(output_dir, publish_database)

    asset_strategy = publish_database.get("metadata", {}).get("assetStrategy", {})
    print(f"Wrote publish bundle to {output_dir}")
    print(
        "Staged "
        f"{asset_strategy.get('copiedAssetCount', 0)} box-art files at "
        f"{asset_strategy.get('boxArtStagingDir') or box_art_staging_dir}"
    )
    print(f"Open {output_dir / 'index.html'}")


if __name__ == "__main__":
    main()
