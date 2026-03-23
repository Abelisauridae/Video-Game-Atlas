const data = window.VIDEOGAME_ATLAS_DATA;
const DEFAULT_VISIBLE_GAMES = 120;

function normalizeTitle(title) {
  return String(title || "").replace(/^the\s+/i, "").trim();
}

function buildSearchBlob(parts) {
  return parts
    .flatMap((part) => (Array.isArray(part) ? part : [part]))
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

const systems = data.systems.map((system) => ({
  ...system,
  manufacturer: system.manufacturer || "Unknown",
  category: system.category || "Unspecified",
  generation: system.generation || "Unspecified",
  searchBlob: buildSearchBlob([
    system.name,
    system.shortName,
    system.manufacturer,
    system.category,
    system.generation,
    system.summary,
    system.topGenres,
  ]),
}));

const systemById = new Map(systems.map((system) => [system.id, system]));
const providerById = new Map(
  (data.metadata.batoceraProviders || []).map((provider) => [provider.id, provider])
);

const games = data.games.map((game) => {
  const system = systemById.get(game.systemId);
  const sortTitle = normalizeTitle(game.title);
  return {
    ...game,
    sortTitle,
    systemName: system?.name || "Unknown",
    systemShortName: system?.shortName || system?.name || "Unknown",
    searchBlob: buildSearchBlob([
      game.title,
      sortTitle,
      system?.name,
      system?.shortName,
      system?.manufacturer,
      game.developer,
      game.publisher,
      game.genres,
      game.summary,
      game.batocera?.region,
      game.batocera?.players,
      game.batocera?.family,
      game.batocera?.language,
    ]),
  };
});
const gameById = new Map(games.map((game) => [game.id, game]));

const state = {
  search: "",
  manufacturer: "all",
  category: "all",
  generation: "all",
  sort: "alpha",
  gamesLimit: DEFAULT_VISIBLE_GAMES,
  selectedSystemId: null,
  selectedGameId: null,
};

const elements = {
  heroStats: document.querySelector("#hero-stats"),
  searchInput: document.querySelector("#search-input"),
  manufacturerFilter: document.querySelector("#manufacturer-filter"),
  categoryFilter: document.querySelector("#category-filter"),
  generationFilter: document.querySelector("#generation-filter"),
  sortSelect: document.querySelector("#sort-select"),
  systemsCountHeading: document.querySelector("#systems-count-heading"),
  systemsCaption: document.querySelector("#systems-caption"),
  systemsList: document.querySelector("#systems-list"),
  gamesCountHeading: document.querySelector("#games-count-heading"),
  gamesCaption: document.querySelector("#games-caption"),
  gamesStatus: document.querySelector("#games-status"),
  gamesList: document.querySelector("#games-list"),
  loadMoreGamesButton: document.querySelector("#load-more-games-button"),
  detailPanel: document.querySelector("#detail-panel"),
  sourcesPanel: document.querySelector("#sources-panel"),
  clearFocusButton: document.querySelector("#clear-focus-button"),
};

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatNumber(value) {
  return new Intl.NumberFormat("en-US").format(value || 0);
}

function formatYear(value) {
  return value == null ? "Unknown" : String(value);
}

function formatYearRange(start, end) {
  if (start && end && start !== end) return `${start}-${end}`;
  return formatYear(start || end);
}

function getInitials(text) {
  const words = String(text || "")
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean);
  return words
    .slice(0, 2)
    .map((word) => word[0].toUpperCase())
    .join("") || "VG";
}

function truncate(value, maxLength = 140) {
  if (!value || value.length <= maxLength) return value || "";
  return `${value.slice(0, maxLength - 1).trimEnd()}...`;
}

function escapeAttribute(value) {
  return String(value ?? "").replaceAll('"', "&quot;");
}

function getProviderName(providerId) {
  const provider = providerById.get(providerId);
  return provider?.name || provider?.batoceraLabel || providerId || "Unknown";
}

function renderPoster(game, className = "game-poster") {
  const iconUrl = game.media?.boxFront?.url || game.image?.iconUrl;
  if (iconUrl) {
    return `<div class="${className}"><img src="${escapeHtml(iconUrl)}" alt="${escapeHtml(
      game.media?.boxFront?.alt || game.image?.alt || game.title
    )}" loading="lazy" decoding="async"></div>`;
  }
  return `
    <div class="${className}">
      <div>
        <strong>${escapeHtml(getInitials(game.title))}</strong>
        <small>${escapeHtml(game.systemShortName)}</small>
      </div>
    </div>
  `;
}

function renderSystemMark(system) {
  return `
    <div class="system-mark">
      <div>
        <strong>${escapeHtml(getInitials(system.shortName || system.name))}</strong>
        <small>${escapeHtml(system.manufacturer || "System")}</small>
      </div>
    </div>
  `;
}

function getDistinctSystemValues(extractor) {
  return Array.from(new Set(systems.map(extractor).filter(Boolean))).sort((a, b) =>
    a.localeCompare(b)
  );
}

function populateFilterSelect(select, label, values) {
  select.innerHTML = [
    `<option value="all">All ${escapeHtml(label)}</option>`,
    ...values.map(
      (value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`
    ),
  ].join("");
}

function sortGames(items) {
  const sorted = [...items];
  sorted.sort((left, right) => {
    if (state.sort === "year") {
      return (
        (right.releaseYear || 0) - (left.releaseYear || 0) ||
        left.sortTitle.localeCompare(right.sortTitle)
      );
    }
    if (state.sort === "system") {
      return (
        left.systemName.localeCompare(right.systemName) ||
        left.sortTitle.localeCompare(right.sortTitle)
      );
    }
    return left.sortTitle.localeCompare(right.sortTitle);
  });
  return sorted;
}

function getVisibleData() {
  const query = state.search.trim().toLowerCase();
  const eligibleSystems = systems.filter((system) => {
    if (state.manufacturer !== "all" && system.manufacturer !== state.manufacturer) return false;
    if (state.category !== "all" && system.category !== state.category) return false;
    if (state.generation !== "all" && system.generation !== state.generation) return false;
    return true;
  });

  const eligibleSystemIds = new Set(eligibleSystems.map((system) => system.id));
  const systemMatchesQuery = new Map(
    eligibleSystems.map((system) => [system.id, !query || system.searchBlob.includes(query)])
  );

  const visibleGames = sortGames(
    games.filter((game) => {
      if (!eligibleSystemIds.has(game.systemId)) return false;
      if (!query) return true;
      return systemMatchesQuery.get(game.systemId) || game.searchBlob.includes(query);
    })
  );

  const visibleSystemIds = new Set(visibleGames.map((game) => game.systemId));
  const visibleSystems = eligibleSystems.filter((system) => {
    if (systemMatchesQuery.get(system.id)) return true;
    return visibleSystemIds.has(system.id);
  });

  return { visibleSystems, visibleGames };
}

function syncSelection(views) {
  if (state.selectedSystemId != null && !views.visibleSystems.some((item) => item.id === state.selectedSystemId)) {
    state.selectedSystemId = null;
  }

  if (state.selectedGameId != null) {
    const selectedGame = views.visibleGames.find((item) => item.id === state.selectedGameId);
    if (!selectedGame) {
      state.selectedGameId = null;
    } else {
      state.selectedSystemId = selectedGame.systemId;
    }
  }
}

function getVisibleGameMetrics(visibleGames) {
  const counts = new Map();

  visibleGames.forEach((game) => {
    counts.set(game.systemId, (counts.get(game.systemId) || 0) + 1);
  });

  return { counts };
}

function getActiveGames(visibleGames) {
  if (state.selectedSystemId == null) return visibleGames;
  return visibleGames.filter((game) => game.systemId === state.selectedSystemId);
}

function buildHeroStats(visibleSystems, visibleGames) {
  const manufacturerCount = new Set(visibleSystems.map((system) => system.manufacturer).filter(Boolean)).size;
  const categoryCount = new Set(visibleSystems.map((system) => system.category).filter(Boolean)).size;

  const cards = [
    ["Filtered systems", formatNumber(visibleSystems.length)],
    ["Visible games", formatNumber(visibleGames.length)],
    ["Manufacturers", formatNumber(manufacturerCount)],
    ["Categories", formatNumber(categoryCount)],
  ];

  elements.heroStats.innerHTML = cards
    .map(
      ([label, value]) => `
        <article class="stat-card">
          <span>${escapeHtml(label)}</span>
          <strong>${escapeHtml(value)}</strong>
        </article>
      `
    )
    .join("");
}

function renderSystemsList(visibleSystems, visibleGames) {
  const metrics = getVisibleGameMetrics(visibleGames);
  elements.systemsCountHeading.textContent = `${formatNumber(visibleSystems.length)} systems`;

  if (!visibleSystems.length) {
    elements.systemsCaption.textContent =
      "No systems match the current filters. Try widening manufacturer, category, or generation.";
    elements.systemsList.innerHTML = `<div class="empty-state">No systems are visible right now.</div>`;
    return;
  }

  elements.systemsCaption.textContent =
    state.selectedSystemId == null
      ? "Select a system to focus the game list and open a platform summary."
      : "System focus is active. Click another system or clear focus to go broader.";

  elements.systemsList.innerHTML = visibleSystems
    .map((system) => {
      const visibleCount = metrics.counts.get(system.id) || 0;

      return `
        <button
          class="system-card ${system.id === state.selectedSystemId ? "is-selected" : ""}"
          type="button"
          data-system-id="${system.id}"
        >
          <div class="card-head">
            ${renderSystemMark(system)}
            <div class="card-copy">
              <h3>${escapeHtml(system.name)}</h3>
              <div class="meta-row">
                <span>${escapeHtml(system.manufacturer || "Unknown maker")}</span>
                <span>${escapeHtml(system.category)}</span>
                <span>${escapeHtml(formatYearRange(system.releaseYear, system.endYear))}</span>
              </div>
              <p class="subtle">${escapeHtml(system.generation)}</p>
            </div>
          </div>
          <div class="badge-row">
            <span class="badge">${escapeHtml(
              `Metadata: ${getProviderName(system.sourceAttribution?.metadataProvider)}`
            )}</span>
            <span class="badge accent">${escapeHtml(formatNumber(visibleCount))} visible games</span>
          </div>
          <div class="badge-row">
            ${system.topGenres
              .map((genre) => `<span class="badge">${escapeHtml(genre)}</span>`)
              .join("")}
          </div>
        </button>
      `;
    })
    .join("");

  elements.systemsList.querySelectorAll("[data-system-id]").forEach((button) => {
    button.addEventListener("click", () => {
      const systemId = Number(button.dataset.systemId);
      state.selectedGameId = null;
      state.selectedSystemId = state.selectedSystemId === systemId ? null : systemId;
      resetGameWindow();
      render();
    });
  });
}

function renderGamesList(activeGames, selectedSystem) {
  elements.gamesCountHeading.textContent = `${formatNumber(activeGames.length)} games`;

  if (!activeGames.length) {
    elements.gamesCaption.textContent =
      "No games match the current filters. Try clearing search or widening the system filters.";
    elements.gamesStatus.textContent = "";
    elements.loadMoreGamesButton.hidden = true;
    elements.gamesList.innerHTML = `<div class="empty-state">No game entries are visible right now.</div>`;
    return;
  }

  const renderedGames = activeGames.slice(0, state.gamesLimit);
  const hiddenCount = Math.max(activeGames.length - renderedGames.length, 0);
  elements.gamesCaption.textContent = selectedSystem
    ? `Showing game entries for ${selectedSystem.name}.`
    : "Showing game entries across all currently visible systems.";
  elements.gamesStatus.textContent = hiddenCount
    ? `Rendering the first ${formatNumber(renderedGames.length)} of ${formatNumber(
        activeGames.length
      )} matches for speed.`
    : `Rendering all ${formatNumber(activeGames.length)} matches in the current view.`;
  elements.loadMoreGamesButton.hidden = hiddenCount === 0;
  elements.loadMoreGamesButton.textContent = `Show ${formatNumber(Math.min(hiddenCount, DEFAULT_VISIBLE_GAMES))} more`;

  elements.gamesList.innerHTML = renderedGames
    .map(
      (game) => `
        <button
          class="game-card ${game.id === state.selectedGameId ? "is-selected" : ""}"
          type="button"
          data-game-id="${game.id}"
        >
          <div class="card-head">
            ${renderPoster(game)}
            <div class="card-copy">
              <h3>${escapeHtml(game.title)}</h3>
              <div class="meta-row">
                <span>${escapeHtml(game.systemName)}</span>
                <span>${escapeHtml(formatYear(game.releaseYear))}</span>
                <span>${escapeHtml(game.developer || "Developer unknown")}</span>
              </div>
              <p class="subtle">${escapeHtml(truncate(game.summary || "No summary in the current bundle.", 132))}</p>
            </div>
          </div>
          <div class="badge-row">
            <span class="badge">${escapeHtml(
              `Metadata: ${getProviderName(game.sourceAttribution?.metadataProvider)}`
            )}</span>
            <span class="badge">${escapeHtml(
              `Box art: ${getProviderName(game.sourceAttribution?.boxArtProvider)}`
            )}</span>
          </div>
          <div class="badge-row">
            ${game.genres.map((genre) => `<span class="badge">${escapeHtml(genre)}</span>`).join("")}
          </div>
        </button>
      `
    )
    .join("");

  elements.gamesList.querySelectorAll("[data-game-id]").forEach((button) => {
    button.addEventListener("click", () => {
      const gameId = Number(button.dataset.gameId);
      const game = gameById.get(gameId);
      state.selectedGameId = gameId;
      state.selectedSystemId = game?.systemId || state.selectedSystemId;
      render();
    });
  });
}

function summarizeSystemGames(systemGames) {
  const topDevelopers = Array.from(
    systemGames.reduce((map, game) => {
      if (!game.developer) return map;
      map.set(game.developer, (map.get(game.developer) || 0) + 1);
      return map;
    }, new Map())
  )
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 4)
    .map(([name]) => name);

  return { topDevelopers };
}

function renderDetailPanel(selectedSystem, selectedGame, visibleGames) {
  if (selectedGame) {
    elements.detailPanel.innerHTML = `
      <div class="detail-hero">
        <div class="detail-poster">
          <div>
            <strong>${escapeHtml(getInitials(selectedGame.title))}</strong>
            <small>${escapeHtml(selectedGame.systemShortName)}</small>
          </div>
        </div>
        <div class="detail-copy-block">
          <p class="panel-label">Game Release Entry</p>
          <h2>${escapeHtml(selectedGame.title)}</h2>
          <p class="detail-copy">${escapeHtml(
            selectedGame.summary || "This release entry has no longer editorial summary in the current bundle."
          )}</p>
        </div>
      </div>
      <div class="fact-grid">
        <article class="fact-card">
          <span>System</span>
          <strong>${escapeHtml(selectedGame.systemName)}</strong>
        </article>
        <article class="fact-card">
          <span>Release year</span>
          <strong>${escapeHtml(formatYear(selectedGame.releaseYear))}</strong>
        </article>
        <article class="fact-card">
          <span>Developer</span>
          <strong>${escapeHtml(selectedGame.developer || "Unknown")}</strong>
        </article>
        <article class="fact-card">
          <span>Publisher</span>
          <strong>${escapeHtml(selectedGame.publisher || "Unknown")}</strong>
        </article>
        <article class="fact-card">
          <span>Players</span>
          <strong>${escapeHtml(selectedGame.batocera?.players || "Unknown")}</strong>
        </article>
        <article class="fact-card">
          <span>Region</span>
          <strong>${escapeHtml(selectedGame.batocera?.region || "Unknown")}</strong>
        </article>
        <article class="fact-card">
          <span>Metadata source</span>
          <strong>${escapeHtml(getProviderName(selectedGame.sourceAttribution?.metadataProvider))}</strong>
        </article>
        <article class="fact-card">
          <span>Box art source</span>
          <strong>${escapeHtml(getProviderName(selectedGame.sourceAttribution?.boxArtProvider))}</strong>
        </article>
      </div>
      <section class="detail-section">
        <h3>Genres</h3>
        <div class="chip-row">
          ${selectedGame.genres.length
            ? selectedGame.genres.map((genre) => `<span class="chip">${escapeHtml(genre)}</span>`).join("")
            : '<span class="chip">Unspecified</span>'}
        </div>
      </section>
      <section class="detail-section">
        <h3>Batocera fields</h3>
        <div class="chip-row">
          ${selectedGame.batocera?.family ? `<span class="chip">${escapeHtml(`Family: ${selectedGame.batocera.family}`)}</span>` : ""}
          ${selectedGame.batocera?.language ? `<span class="chip">${escapeHtml(`Language: ${selectedGame.batocera.language}`)}</span>` : ""}
          ${selectedGame.batocera?.rating != null ? `<span class="chip">${escapeHtml(`Rating: ${selectedGame.batocera.rating}`)}</span>` : ""}
          ${selectedGame.sourceAttribution?.scraperGameId ? `<span class="chip">${escapeHtml(`ScreenScraper ID: ${selectedGame.sourceAttribution.scraperGameId}`)}</span>` : ""}
        </div>
      </section>
    `;
    return;
  }

  if (selectedSystem) {
    const systemGames = visibleGames.filter((game) => game.systemId === selectedSystem.id);
    const summary = summarizeSystemGames(systemGames);
    elements.detailPanel.innerHTML = `
      <div class="detail-hero">
        <div class="detail-poster">
          <div>
            <strong>${escapeHtml(getInitials(selectedSystem.shortName || selectedSystem.name))}</strong>
            <small>${escapeHtml(selectedSystem.manufacturer || "System")}</small>
          </div>
        </div>
        <div class="detail-copy-block">
          <p class="panel-label">System Overview</p>
          <h2>${escapeHtml(selectedSystem.name)}</h2>
          <p class="detail-copy">${escapeHtml(
            selectedSystem.summary ||
              "This system is present in the current bundle, but it does not yet have a longer editorial summary."
          )}</p>
        </div>
      </div>
      <div class="fact-grid">
        <article class="fact-card">
          <span>Manufacturer</span>
          <strong>${escapeHtml(selectedSystem.manufacturer || "Unknown")}</strong>
        </article>
        <article class="fact-card">
          <span>Generation</span>
          <strong>${escapeHtml(selectedSystem.generation)}</strong>
        </article>
        <article class="fact-card">
          <span>Metadata source</span>
          <strong>${escapeHtml(getProviderName(selectedSystem.sourceAttribution?.metadataProvider))}</strong>
        </article>
        <article class="fact-card">
          <span>Visible games</span>
          <strong>${escapeHtml(formatNumber(systemGames.length))}</strong>
        </article>
        <article class="fact-card">
          <span>Launch window</span>
          <strong>${escapeHtml(formatYearRange(selectedSystem.releaseYear, selectedSystem.endYear))}</strong>
        </article>
        <article class="fact-card">
          <span>Primary category</span>
          <strong>${escapeHtml(selectedSystem.category)}</strong>
        </article>
      </div>
      <section class="detail-section">
        <h3>Top genres</h3>
        <div class="chip-row">
          ${selectedSystem.topGenres.length
            ? selectedSystem.topGenres.map((genre) => `<span class="chip">${escapeHtml(genre)}</span>`).join("")
            : '<span class="chip">No genre data</span>'}
        </div>
      </section>
      <section class="detail-section">
        <h3>Frequent developers in the current view</h3>
        <div class="chip-row">
          ${summary.topDevelopers.length
            ? summary.topDevelopers.map((name) => `<span class="chip">${escapeHtml(name)}</span>`).join("")
            : '<span class="chip">No developer data</span>'}
        </div>
      </section>
      <section class="detail-section">
        <h3>Sample games</h3>
        <div class="chip-row">
          ${systemGames.slice(0, 6).map((game) => `<span class="chip">${escapeHtml(game.title)}</span>`).join("")}
        </div>
      </section>
      ${
        selectedSystem.wikiUrl
          ? `
      <section class="detail-section">
        <h3>Batocera docs</h3>
        <div class="chip-row">
          <a class="chip" href="${escapeHtml(selectedSystem.wikiUrl)}">${escapeHtml(selectedSystem.wikiUrl)}</a>
        </div>
      </section>
      `
          : ""
      }
    `;
    return;
  }

  elements.detailPanel.innerHTML = `
    <div class="detail-section">
      <p class="panel-label">Catalog Overview</p>
      <h2>${escapeHtml(formatNumber(data.metadata.systemCount))} systems in the current bundle</h2>
      <p class="detail-copy">
        This prototype keeps the build pipeline from the dinosaur atlas but swaps in a better game-shaped model:
        systems at the top, system-scoped game entries beneath them, and optional metadata enrichment layered on top.
      </p>
    </div>
    <div class="fact-grid">
      <article class="fact-card">
        <span>Total systems</span>
        <strong>${escapeHtml(formatNumber(data.metadata.systemCount))}</strong>
      </article>
      <article class="fact-card">
        <span>Total game entries</span>
        <strong>${escapeHtml(formatNumber(data.metadata.gameCount))}</strong>
      </article>
      <article class="fact-card">
        <span>Manufacturers</span>
        <strong>${escapeHtml(formatNumber(data.metadata.manufacturers.length))}</strong>
      </article>
      <article class="fact-card">
        <span>Batocera providers</span>
        <strong>${escapeHtml(formatNumber((data.metadata.batoceraProviders || []).length))}</strong>
      </article>
      <article class="fact-card">
        <span>Top genres tracked</span>
        <strong>${escapeHtml(formatNumber(data.metadata.topGenres.length))}</strong>
      </article>
    </div>
    <section class="detail-section">
      <h3>Notes</h3>
      <div class="chip-row">
        ${data.metadata.notes.map((note) => `<span class="chip">${escapeHtml(note)}</span>`).join("")}
      </div>
    </section>
    <section class="detail-section">
      <h3>Top genres in the bundle</h3>
      <div class="chip-row">
        ${data.metadata.topGenres.map((genre) => `<span class="chip">${escapeHtml(genre)}</span>`).join("")}
      </div>
    </section>
    <section class="detail-section">
      <h3>Atlas scrape strategy</h3>
      <div class="chip-row">
        ${Object.entries(data.metadata.atlasStrategy || {})
          .map(
            ([slot, providerIds]) =>
              `<span class="chip">${escapeHtml(
                `${slot}: ${providerIds.map((providerId) => getProviderName(providerId)).join(" -> ")}`
              )}</span>`
          )
          .join("")}
      </div>
    </section>
  `;
}

function renderSourcesPanel() {
  elements.sourcesPanel.innerHTML = `
    <p class="panel-label">Sources</p>
    <h2>Batocera-aligned provider catalog</h2>
    <p class="detail-copy">
      The sample bundle is local and static, but the build pipeline now distinguishes the same scraper locations Batocera documents:
      ScreenScraper, TheGamesDB, Arcade Database, and IGDB.
    </p>
    <div class="source-list">
      ${(data.metadata.batoceraProviders || [])
        .map((provider) => {
          const usage = data.metadata.providerUsage?.[provider.id] || 0;
          return `
            <article class="source-card">
              <h3>${escapeHtml(provider.name)}</h3>
              <p>${escapeHtml(provider.notes || "")}</p>
              <div class="badge-row">
                <span class="badge accent">${escapeHtml(`Batocera label: ${provider.batoceraLabel}`)}</span>
                <span class="badge">${escapeHtml(`Sample usage: ${formatNumber(usage)} games`)}</span>
              </div>
              <div class="badge-row">
                ${(provider.capabilities || [])
                  .map((capability) => `<span class="badge">${escapeHtml(capability)}</span>`)
                  .join("")}
              </div>
              <p>${escapeHtml(
                provider.credentials?.length
                  ? `Credentials: ${provider.credentials.join(", ")}`
                  : "Credentials: none noted"
              )}</p>
              <p>
                <a href="${escapeHtml(provider.websiteUrl)}">${escapeHtml(provider.websiteUrl)}</a>
                <br>
                <a href="${escapeHtml(provider.docsUrl)}">${escapeHtml(provider.docsUrl)}</a>
              </p>
            </article>
          `;
        })
        .join("")}
      ${data.metadata.sources
        .map(
          (source) => `
            <article class="source-card">
              <h3>${escapeHtml(source.name)}</h3>
              <p>${escapeHtml(source.role)}</p>
              ${
                source.url
                  ? `<p><a href="${escapeHtml(source.url)}">${escapeHtml(source.url)}</a></p>`
                  : ""
              }
            </article>
          `
        )
        .join("")}
    </div>
  `;
}

function render() {
  const views = getVisibleData();
  syncSelection(views);

  const selectedSystem =
    views.visibleSystems.find((system) => system.id === state.selectedSystemId) || null;
  const activeGames = getActiveGames(views.visibleGames);
  const selectedGame = activeGames.find((game) => game.id === state.selectedGameId) || null;

  buildHeroStats(views.visibleSystems, views.visibleGames);
  renderSystemsList(views.visibleSystems, views.visibleGames);
  renderGamesList(activeGames, selectedSystem);
  renderDetailPanel(selectedSystem, selectedGame, views.visibleGames);
}

function resetGameWindow() {
  state.gamesLimit = DEFAULT_VISIBLE_GAMES;
}

function initializeFilters() {
  populateFilterSelect(
    elements.manufacturerFilter,
    "manufacturers",
    getDistinctSystemValues((system) => system.manufacturer)
  );
  populateFilterSelect(
    elements.categoryFilter,
    "categories",
    getDistinctSystemValues((system) => system.category)
  );
  populateFilterSelect(
    elements.generationFilter,
    "generations",
    getDistinctSystemValues((system) => system.generation)
  );
}

function attachEvents() {
  elements.searchInput.addEventListener("input", (event) => {
    state.search = event.target.value;
    resetGameWindow();
    render();
  });

  elements.manufacturerFilter.addEventListener("change", (event) => {
    state.manufacturer = event.target.value;
    resetGameWindow();
    render();
  });

  elements.categoryFilter.addEventListener("change", (event) => {
    state.category = event.target.value;
    resetGameWindow();
    render();
  });

  elements.generationFilter.addEventListener("change", (event) => {
    state.generation = event.target.value;
    resetGameWindow();
    render();
  });

  elements.sortSelect.addEventListener("change", (event) => {
    state.sort = event.target.value;
    resetGameWindow();
    render();
  });

  elements.clearFocusButton.addEventListener("click", () => {
    state.selectedSystemId = null;
    state.selectedGameId = null;
    resetGameWindow();
    render();
  });

  elements.loadMoreGamesButton.addEventListener("click", () => {
    state.gamesLimit += DEFAULT_VISIBLE_GAMES;
    render();
  });
}

initializeFilters();
renderSourcesPanel();
attachEvents();
render();
