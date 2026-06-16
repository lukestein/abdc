const data = window.ABDC_DATA?.rows ?? [];
const numberFormat = new Intl.NumberFormat("en-US");
const qualityOrder = new Map([
  ["A*", 4],
  ["A", 3],
  ["B", 2],
  ["C", 1],
]);
const titleStopWords = new Set(["a", "an", "and", "for", "in", "of", "on", "the", "to"]);
const leadingTitleArticles = /^(a|an|the)\s+/;
const titleAliases = new Map([
  ["reviewofeconomicstudies", ["restud"]],
  ["thereviewofeconomicstudies", ["restud"]],
  ["reviewofeconomicsandstatistics", ["restat"]],
  ["thereviewofeconomicsandstatistics", ["restat"]],
]);
const titleAliasQueries = new Set([...titleAliases.values()].flat());
const defaultSortKey = "rating";
const defaultSortDirection = "desc";
const defaultTextMatchMode = "all";
const sortKeys = new Set(["title", "rating", "discipline", "publisher", "year", "issn"]);
const sortDirections = new Set(["asc", "desc"]);
const textMatchModes = new Set([defaultTextMatchMode, "any"]);
const ratingToParam = new Map([
  ["A*", "Astar"],
  ["A", "A"],
  ["B", "B"],
  ["C", "C"],
]);
const paramToRating = new Map([...ratingToParam].map(([rating, param]) => [param.toLowerCase(), rating]));

const state = {
  title: "",
  discipline: "",
  ratings: new Set(),
  ft50Only: false,
  utd24Only: false,
  detail: "",
  textMatchMode: defaultTextMatchMode,
  sortKey: defaultSortKey,
  sortDirection: defaultSortDirection,
  filtered: [],
};

const els = {
  totalCount: document.querySelector("#total-count"),
  visibleCount: document.querySelector("#visible-count"),
  astarCount: document.querySelector("#astar-count"),
  ft50Count: document.querySelector("#ft50-count"),
  disciplineCount: document.querySelector("#discipline-count"),
  titleFilter: document.querySelector("#title-filter"),
  disciplineFilter: document.querySelector("#discipline-filter"),
  textMatchToggle: document.querySelector("#text-match-toggle"),
  textMatchValue: document.querySelector("#text-match-value"),
  detailFilter: document.querySelector("#detail-filter"),
  sortKey: document.querySelector("#sort-key"),
  sortDirection: document.querySelector("#sort-direction"),
  resetFilters: document.querySelector("#reset-filters"),
  downloadCsv: document.querySelector("#download-csv"),
  resultsBody: document.querySelector("#results-body"),
  emptyState: document.querySelector("#empty-state"),
  disciplineOptions: document.querySelector("#discipline-options"),
  sortButtons: [...document.querySelectorAll("[data-sort]")],
  ratingPills: [...document.querySelectorAll("[data-rating]")],
  ft50Pill: document.querySelector("#ft50-pill"),
  utd24Pill: document.querySelector("#utd24-pill"),
};

function normalize(value) {
  return String(value ?? "").toLowerCase().trim();
}

function readRatingParams(params) {
  return params
    .getAll("rating")
    .flatMap((value) => value.split(","))
    .map((value) => paramToRating.get(value.trim().toLowerCase()))
    .filter(Boolean);
}

function readUrlState() {
  const params = new URLSearchParams(window.location.search);
  const sortKey = normalize(params.get("sort"));
  const sortDirection = normalize(params.get("dir"));
  const nextSortKey = sortKeys.has(sortKey) ? sortKey : defaultSortKey;

  state.title = normalize(params.get("title"));
  state.discipline = normalize(params.get("field"));
  state.detail = normalize(params.get("detail"));
  state.ratings = new Set(readRatingParams(params));
  state.ft50Only = ["1", "true", "yes"].includes(normalize(params.get("ft50")));
  state.utd24Only = ["1", "true", "yes"].includes(normalize(params.get("utd24")));
  state.textMatchMode = textMatchModes.has(normalize(params.get("match"))) ? normalize(params.get("match")) : defaultTextMatchMode;
  state.sortKey = nextSortKey;
  state.sortDirection = sortDirections.has(sortDirection) ? sortDirection : defaultSortDirectionFor(nextSortKey);
}

function syncControlsFromState() {
  els.titleFilter.value = state.title;
  els.disciplineFilter.value = state.discipline;
  syncTextMatchToggle();
  els.detailFilter.value = state.detail;
}

function syncTextMatchToggle() {
  const isAny = state.textMatchMode === "any";
  els.textMatchToggle.classList.toggle("is-any", isAny);
  els.textMatchToggle.setAttribute("aria-pressed", String(isAny));
  els.textMatchToggle.title = isAny ? "Either title or discipline can match" : "Both title and discipline must match";
  els.textMatchValue.textContent = isAny ? "Any" : "All";
}

function addParam(parts, key, value) {
  if (!value) return;
  parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(value)}`);
}

function urlFromState() {
  const parts = [];
  addParam(parts, "title", state.title);
  addParam(parts, "field", state.discipline);
  addParam(parts, "detail", state.detail);
  if (state.textMatchMode !== defaultTextMatchMode) addParam(parts, "match", state.textMatchMode);

  for (const rating of ["A*", "A", "B", "C"]) {
    if (state.ratings.has(rating)) addParam(parts, "rating", ratingToParam.get(rating));
  }
  if (state.ft50Only) addParam(parts, "ft50", "1");
  if (state.utd24Only) addParam(parts, "utd24", "1");

  if (state.sortKey !== defaultSortKey) addParam(parts, "sort", state.sortKey);
  if (state.sortDirection !== defaultSortDirectionFor(state.sortKey)) addParam(parts, "dir", state.sortDirection);

  const query = parts.length ? `?${parts.join("&")}` : "";
  return `${window.location.pathname}${query}`;
}

function defaultSortDirectionFor(key) {
  return key === "rating" || key === "year" ? defaultSortDirection : "asc";
}

function replaceUrlFromState() {
  const nextUrl = urlFromState();
  const currentUrl = `${window.location.pathname}${window.location.search}`;
  if (nextUrl !== currentUrl) {
    window.history.replaceState(null, "", `${nextUrl}${window.location.hash}`);
  }
}

let pendingUrlUpdate = 0;
function scheduleUrlUpdate(delay = 0) {
  window.clearTimeout(pendingUrlUpdate);
  pendingUrlUpdate = window.setTimeout(replaceUrlFromState, delay);
}

function searchCompact(value) {
  return normalize(value).replace(/[^a-z0-9]/g, "");
}

function titleWords(title) {
  return normalize(title)
    .replace(/&/g, " and ")
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

function titleInitials(words) {
  return words.map((word) => word[0]).join("");
}

function addInitialWindows(tokens, words) {
  for (let start = 0; start < words.length - 1; start += 1) {
    tokens.add(titleInitials(words.slice(start, start + 2)));
  }
}

function addPrefixInitials(tokens, words) {
  for (let end = 2; end <= words.length; end += 1) {
    tokens.add(titleInitials(words.slice(0, end)));
  }
}

function buildTitleSearchTokens(title) {
  const words = titleWords(title);
  const meaningfulWords = words.filter((word) => !titleStopWords.has(word));
  const compactTitle = searchCompact(title);
  const textTokens = new Set([normalize(title), compactTitle]);
  const codeTokens = new Set([titleInitials(words), titleInitials(meaningfulWords)]);
  addInitialWindows(codeTokens, meaningfulWords);
  addPrefixInitials(codeTokens, meaningfulWords);

  for (const alias of titleAliases.get(compactTitle) ?? []) {
    codeTokens.add(alias);
  }

  return {
    text: [...textTokens].filter(Boolean),
    code: [...codeTokens].filter(Boolean),
    words,
  };
}

for (const row of data) {
  row.titleSearch = buildTitleSearchTokens(row.title);
}

function qualityValue(row) {
  return qualityOrder.get(row.rating) ?? 0;
}

function textValue(row, key) {
  return normalize(row[key]);
}

function sortTextValue(row, key) {
  const value = textValue(row, key);
  return key === "title" ? value.replace(leadingTitleArticles, "") : value;
}

function compareTitles(a, b) {
  const sortDelta = sortTextValue(a, "title").localeCompare(sortTextValue(b, "title"));
  if (sortDelta !== 0) return sortDelta;
  return textValue(a, "title").localeCompare(textValue(b, "title"));
}

function compareEliteJournalLists(a, b) {
  const ft50Delta = Number(Boolean(b.ft50)) - Number(Boolean(a.ft50));
  if (ft50Delta !== 0) return ft50Delta;

  return Number(Boolean(b.utd24)) - Number(Boolean(a.utd24));
}

function compareRows(a, b) {
  const direction = state.sortDirection === "asc" ? 1 : -1;

  if (state.sortKey === "rating") {
    const ratingDelta = qualityValue(a) - qualityValue(b);
    if (ratingDelta !== 0) return ratingDelta * direction;
    const eliteListDelta = compareEliteJournalLists(a, b);
    if (eliteListDelta !== 0) return eliteListDelta;
    return compareTitles(a, b);
  }

  if (state.sortKey === "year") {
    const yearDelta = (Number(a.year) || 0) - (Number(b.year) || 0);
    if (yearDelta !== 0) return yearDelta * direction;
    return compareTitles(a, b);
  }

  const textDelta = sortTextValue(a, state.sortKey).localeCompare(sortTextValue(b, state.sortKey));
  if (textDelta !== 0) return textDelta * direction;
  return compareTitles(a, b);
}

function includesText(value, query) {
  return normalize(value).includes(query);
}

function splitCommaQueries(query) {
  const parts = [];
  let part = "";
  let inQuotes = false;

  for (const char of String(query ?? "")) {
    if (char === '"') {
      inQuotes = !inQuotes;
    }

    if (char === "," && !inQuotes) {
      parts.push(part);
      part = "";
    } else {
      part += char;
    }
  }

  parts.push(part);
  return parts;
}

function commaQueries(query) {
  return splitCommaQueries(query)
    .map((part) => normalize(part))
    .map((part) => part.trim())
    .filter(Boolean);
}

function titleQueries(query) {
  return splitCommaQueries(query)
    .map((part) => {
      const value = normalize(part);
      const isExact = value.length >= 2 && value.startsWith('"') && value.endsWith('"');
      const text = isExact ? value.slice(1, -1).trim() : value.trim();
      return text ? { text, isExact } : null;
    })
    .filter(Boolean);
}

function titleMatches(row, query) {
  if (!query) return true;
  const compactQuery = searchCompact(query);
  const isShortCode = compactQuery.length <= 3 && /^[a-z]+$/.test(compactQuery) && !query.includes(" ");

  if (isShortCode) {
    return (
      row.titleSearch.code.some((token) => token === compactQuery) ||
      row.titleSearch.words.some((word) => word === compactQuery)
    );
  }

  if (titleAliasQueries.has(compactQuery)) {
    return row.titleSearch.code.some((token) => token === compactQuery);
  }

  return (
    row.titleSearch.text.some((token) => token.includes(query) || token.includes(compactQuery)) ||
    row.titleSearch.code.some((token) => token.includes(compactQuery))
  );
}

function exactTitleValue(value) {
  return normalize(value).replace(leadingTitleArticles, "");
}

function exactTitleMatches(row, query) {
  return exactTitleValue(row.title) === exactTitleValue(query) || searchCompact(row.title) === searchCompact(query);
}

function titleMatchesQuery(row, query) {
  return query.isExact ? exactTitleMatches(row, query.text) : titleMatches(row, query.text);
}

function titleMatchesAny(row, queryText) {
  const queries = titleQueries(queryText);
  return queries.length === 0 || queries.some((query) => titleMatchesQuery(row, query));
}

function includesAnyText(value, query) {
  const queries = commaQueries(query);
  return queries.length === 0 || queries.some((part) => includesText(value, part));
}

function rowMatchesSearchFilters(row) {
  const titleIsActive = Boolean(state.title);
  const disciplineIsActive = Boolean(state.discipline);
  const titleMatch = titleMatchesAny(row, state.title);
  const disciplineTarget = `${row.discipline} ${row.forCode}`;
  const disciplineMatch = includesAnyText(disciplineTarget, state.discipline);

  if (state.textMatchMode === "any" && (titleIsActive || disciplineIsActive)) {
    if (!((titleIsActive && titleMatch) || (disciplineIsActive && disciplineMatch))) return false;
  } else {
    if (!titleMatch) return false;
    if (!disciplineMatch) return false;
  }

  if (state.detail) {
    const target = `${row.publisher} ${row.issn} ${row.issnOnline} ${row.forCode} ${row.year} ${row.ft50 ? "FT50" : ""} ${row.utd24 ? "UTD24" : ""}`;
    if (!includesAnyText(target, state.detail)) return false;
  }
  return true;
}

function rowMatches(row) {
  return (
    rowMatchesSearchFilters(row) &&
    (!state.ratings.size || state.ratings.has(row.rating)) &&
    (!state.ft50Only || row.ft50) &&
    (!state.utd24Only || row.utd24)
  );
}

function badgeClass(rating) {
  if (rating === "A*") return "rating-a-star";
  return `rating-${rating.toLowerCase()}`;
}

function renderRows(rows) {
  const fragment = document.createDocumentFragment();

  for (const row of rows) {
    const tr = document.createElement("tr");
    const journalChips = [
      row.ft50 ? `<span class="journal-list-chip ft50-chip" title="Financial Times Top 50 journal">FT50</span>` : "",
      row.utd24 ? `<span class="journal-list-chip utd24-chip" title="UT Dallas Top 24 business journal">UTD24</span>` : "",
    ].join("");
    tr.innerHTML = `
      <td class="journal-title" data-label="Journal"><span class="journal-name">${escapeHtml(row.title)}</span>${journalChips}</td>
      <td data-label="Rating"><span class="badge ${badgeClass(row.rating)}">${escapeHtml(row.rating)}</span></td>
      <td class="discipline" data-label="Discipline">${escapeHtml(row.discipline)} <span class="for-code">(FoR ${escapeHtml(row.forCode)})</span></td>
      <td class="publisher" data-label="Publisher">${escapeHtml(row.publisher)}</td>
      <td data-label="Year">${escapeHtml(row.year)}</td>
      <td class="issn" data-label="ISSN">${escapeHtml(row.issn)}${row.issnOnline ? `<span class="issn-separator"> / </span>${escapeHtml(row.issnOnline)}` : ""}</td>
    `;
    fragment.appendChild(tr);
  }

  els.resultsBody.replaceChildren(fragment);
  els.emptyState.hidden = rows.length > 0;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => {
    const entities = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" };
    return entities[char];
  });
}

function updateMetrics(rows, availableRows) {
  const astar = rows.filter((row) => row.rating === "A*").length;
  const ft50Shown = rows.filter((row) => row.ft50).length;
  const utd24Shown = rows.filter((row) => row.utd24).length;
  const disciplines = new Set(rows.map((row) => row.discipline)).size;
  const distribution = { "A*": 0, A: 0, B: 0, C: 0 };
  let ft50Available = 0;
  let utd24Available = 0;

  for (const row of availableRows) {
    distribution[row.rating] = (distribution[row.rating] ?? 0) + 1;
    if (row.ft50) ft50Available += 1;
    if (row.utd24) utd24Available += 1;
  }

  els.totalCount.textContent = numberFormat.format(data.length);
  els.visibleCount.textContent = numberFormat.format(rows.length);
  els.astarCount.textContent = numberFormat.format(astar);
  els.ft50Count.textContent = `${numberFormat.format(ft50Shown)} / ${numberFormat.format(utd24Shown)}`;
  els.disciplineCount.textContent = numberFormat.format(disciplines);
  document.querySelector("#pill-astar").textContent = numberFormat.format(distribution["A*"]);
  document.querySelector("#pill-a").textContent = numberFormat.format(distribution.A);
  document.querySelector("#pill-b").textContent = numberFormat.format(distribution.B);
  document.querySelector("#pill-c").textContent = numberFormat.format(distribution.C);
  document.querySelector("#pill-ft50").textContent = numberFormat.format(ft50Available);
  document.querySelector("#pill-utd24").textContent = numberFormat.format(utd24Available);
}

function sortLabel(key) {
  return {
    title: "Journal",
    rating: "Rating",
    discipline: "Discipline",
    publisher: "Publisher",
    year: "Year",
    issn: "ISSN",
  }[key] ?? key;
}

function updateSortHeaders() {
  for (const button of els.sortButtons) {
    if (button.dataset.sort === state.sortKey) {
      button.setAttribute("aria-sort", state.sortDirection === "asc" ? "ascending" : "descending");
    } else {
      button.removeAttribute("aria-sort");
    }
  }
}

function updateSortControls() {
  els.sortKey.value = state.sortKey;
  const isAscending = state.sortDirection === "asc";
  els.sortDirection.textContent = isAscending ? "↑" : "↓";
  els.sortDirection.title = isAscending ? "Sorted ascending" : "Sorted descending";
  els.sortDirection.setAttribute("aria-label", `Sort ${isAscending ? "descending" : "ascending"}`);
}

function updateRatingPills() {
  for (const pill of els.ratingPills) {
    const isActive = state.ratings.has(pill.dataset.rating);
    pill.classList.toggle("is-active", isActive);
    pill.setAttribute("aria-pressed", String(isActive));
  }
  els.ft50Pill.classList.toggle("is-active", state.ft50Only);
  els.ft50Pill.setAttribute("aria-pressed", String(state.ft50Only));
  els.utd24Pill.classList.toggle("is-active", state.utd24Only);
  els.utd24Pill.setAttribute("aria-pressed", String(state.utd24Only));
}

let pendingFrame = 0;
function scheduleUpdate() {
  cancelAnimationFrame(pendingFrame);
  pendingFrame = requestAnimationFrame(applyState);
}

function updateState(options = {}) {
  scheduleUpdate();
  scheduleUrlUpdate(options.urlDelay ?? 0);
}

function applyState() {
  const availableRows = data.filter(rowMatchesSearchFilters);
  state.filtered = availableRows.filter(rowMatches).sort(compareRows);
  renderRows(state.filtered);
  updateMetrics(state.filtered, availableRows);
  updateSortHeaders();
  updateSortControls();
  updateRatingPills();
}

function setSort(key) {
  if (state.sortKey === key) {
    state.sortDirection = state.sortDirection === "asc" ? "desc" : "asc";
  } else {
    state.sortKey = key;
    state.sortDirection = defaultSortDirectionFor(key);
  }
  updateState();
}

function setSortKey(key) {
  if (state.sortKey !== key) {
    state.sortKey = key;
    state.sortDirection = defaultSortDirectionFor(key);
    updateState();
  }
}

function toggleSortDirection() {
  state.sortDirection = state.sortDirection === "asc" ? "desc" : "asc";
  updateState();
}

function resetFilters() {
  state.title = "";
  state.discipline = "";
  state.ratings.clear();
  state.ft50Only = false;
  state.utd24Only = false;
  state.detail = "";
  state.textMatchMode = defaultTextMatchMode;
  els.titleFilter.value = "";
  els.disciplineFilter.value = "";
  syncTextMatchToggle();
  els.detailFilter.value = "";
  updateState();
}

function csvValue(value) {
  const text = String(value ?? "");
  if (/[",\n]/.test(text)) return `"${text.replaceAll('"', '""')}"`;
  return text;
}

function downloadCsv() {
  const header = ["Journal Title", "Rating", "FT50", "UTD24", "Discipline", "FoR", "Publisher", "ISSN", "ISSN Online", "Year Inception"];
  const rows = state.filtered.map((row) => [
    row.title,
    row.rating,
    row.ft50 ? "Yes" : "",
    row.utd24 ? "Yes" : "",
    row.discipline,
    row.forCode,
    row.publisher,
    row.issn,
    row.issnOnline,
    row.year,
  ]);
  const csv = [header, ...rows].map((row) => row.map(csvValue).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "abdc-jql-2025-filtered.csv";
  link.click();
  URL.revokeObjectURL(url);
}

function populateDisciplines() {
  const disciplines = [...new Set(data.map((row) => row.discipline))].sort();
  els.disciplineOptions.replaceChildren(
    ...disciplines.map((discipline) => {
      const option = document.createElement("option");
      option.value = discipline;
      return option;
    }),
  );
}

function bindEvents() {
  els.titleFilter.addEventListener("input", (event) => {
    state.title = normalize(event.target.value);
    updateState({ urlDelay: 350 });
  });

  els.disciplineFilter.addEventListener("input", (event) => {
    state.discipline = normalize(event.target.value);
    updateState({ urlDelay: 350 });
  });

  els.textMatchToggle.addEventListener("click", () => {
    state.textMatchMode = state.textMatchMode === "any" ? defaultTextMatchMode : "any";
    syncTextMatchToggle();
    updateState();
  });

  els.detailFilter.addEventListener("input", (event) => {
    state.detail = normalize(event.target.value);
    updateState({ urlDelay: 350 });
  });

  els.resetFilters.addEventListener("click", resetFilters);
  els.downloadCsv.addEventListener("click", downloadCsv);
  els.ft50Pill.addEventListener("click", () => {
    state.ft50Only = !state.ft50Only;
    updateState();
  });
  els.utd24Pill.addEventListener("click", () => {
    state.utd24Only = !state.utd24Only;
    updateState();
  });
  els.sortKey.addEventListener("change", (event) => setSortKey(event.target.value));
  els.sortDirection.addEventListener("click", toggleSortDirection);

  for (const button of els.sortButtons) {
    button.addEventListener("click", () => setSort(button.dataset.sort));
  }

  for (const pill of els.ratingPills) {
    pill.addEventListener("click", () => {
      if (state.ratings.has(pill.dataset.rating)) {
        state.ratings.delete(pill.dataset.rating);
      } else {
        state.ratings.add(pill.dataset.rating);
      }
      updateState();
    });
  }
}

window.addEventListener("popstate", () => {
  readUrlState();
  syncControlsFromState();
  scheduleUpdate();
});

populateDisciplines();
readUrlState();
syncControlsFromState();
bindEvents();
applyState();
