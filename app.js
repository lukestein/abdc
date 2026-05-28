const data = window.ABDC_DATA?.rows ?? [];
const numberFormat = new Intl.NumberFormat("en-US");
const qualityOrder = new Map([
  ["A*", 4],
  ["A", 3],
  ["B", 2],
  ["C", 1],
]);
const titleStopWords = new Set(["a", "an", "and", "for", "in", "of", "on", "the", "to"]);
const titleAliases = new Map([
  ["reviewofeconomicstudies", ["restud"]],
  ["thereviewofeconomicstudies", ["restud"]],
  ["reviewofeconomicsandstatistics", ["restat"]],
  ["thereviewofeconomicsandstatistics", ["restat"]],
]);
const titleAliasQueries = new Set([...titleAliases.values()].flat());

const state = {
  title: "",
  discipline: "",
  ratings: new Set(),
  detail: "",
  sortKey: "rating",
  sortDirection: "desc",
  filtered: [],
};

const els = {
  totalCount: document.querySelector("#total-count"),
  visibleCount: document.querySelector("#visible-count"),
  astarCount: document.querySelector("#astar-count"),
  disciplineCount: document.querySelector("#discipline-count"),
  activeSort: document.querySelector("#active-sort"),
  titleFilter: document.querySelector("#title-filter"),
  disciplineFilter: document.querySelector("#discipline-filter"),
  detailFilter: document.querySelector("#detail-filter"),
  sortKey: document.querySelector("#sort-key"),
  sortDirection: document.querySelector("#sort-direction"),
  resetFilters: document.querySelector("#reset-filters"),
  downloadCsv: document.querySelector("#download-csv"),
  resultsBody: document.querySelector("#results-body"),
  emptyState: document.querySelector("#empty-state"),
  disciplineOptions: document.querySelector("#discipline-options"),
  sortButtons: [...document.querySelectorAll("[data-sort]")],
  ratingPills: [...document.querySelectorAll(".rating-pill")],
};

function normalize(value) {
  return String(value ?? "").toLowerCase().trim();
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

function compareRows(a, b) {
  const direction = state.sortDirection === "asc" ? 1 : -1;

  if (state.sortKey === "rating") {
    const ratingDelta = qualityValue(a) - qualityValue(b);
    if (ratingDelta !== 0) return ratingDelta * direction;
    return a.title.localeCompare(b.title);
  }

  if (state.sortKey === "year") {
    const yearDelta = (Number(a.year) || 0) - (Number(b.year) || 0);
    if (yearDelta !== 0) return yearDelta * direction;
    return a.title.localeCompare(b.title);
  }

  const textDelta = textValue(a, state.sortKey).localeCompare(textValue(b, state.sortKey));
  if (textDelta !== 0) return textDelta * direction;
  return a.title.localeCompare(b.title);
}

function includesText(value, query) {
  return normalize(value).includes(query);
}

function titleMatches(row, query) {
  if (!query) return true;
  const compactQuery = searchCompact(query);
  const isShortCode = compactQuery.length <= 3 && /^[a-z]+$/.test(compactQuery) && !query.includes(" ");

  if (isShortCode || titleAliasQueries.has(compactQuery)) {
    return row.titleSearch.code.some((token) => token === compactQuery);
  }

  return (
    row.titleSearch.text.some((token) => token.includes(query) || token.includes(compactQuery)) ||
    row.titleSearch.code.some((token) => token.includes(compactQuery))
  );
}

function rowMatchesSearchFilters(row) {
  if (!titleMatches(row, state.title)) return false;
  if (state.discipline) {
    const target = `${row.discipline} ${row.forCode}`;
    if (!includesText(target, state.discipline)) return false;
  }
  if (state.detail) {
    const target = `${row.publisher} ${row.issn} ${row.issnOnline} ${row.forCode} ${row.year}`;
    if (!includesText(target, state.detail)) return false;
  }
  return true;
}

function rowMatches(row) {
  return rowMatchesSearchFilters(row) && (!state.ratings.size || state.ratings.has(row.rating));
}

function badgeClass(rating) {
  if (rating === "A*") return "rating-a-star";
  return `rating-${rating.toLowerCase()}`;
}

function renderRows(rows) {
  const fragment = document.createDocumentFragment();

  for (const row of rows) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="journal-title" data-label="Journal">${escapeHtml(row.title)}</td>
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
  const disciplines = new Set(rows.map((row) => row.discipline)).size;
  const distribution = { "A*": 0, A: 0, B: 0, C: 0 };

  for (const row of availableRows) {
    distribution[row.rating] = (distribution[row.rating] ?? 0) + 1;
  }

  els.totalCount.textContent = numberFormat.format(data.length);
  els.visibleCount.textContent = numberFormat.format(rows.length);
  els.astarCount.textContent = numberFormat.format(astar);
  els.disciplineCount.textContent = numberFormat.format(disciplines);
  els.activeSort.textContent = `${sortLabel(state.sortKey)} ${state.sortDirection === "asc" ? "↑" : "↓"}`;
  document.querySelector("#pill-astar").textContent = numberFormat.format(distribution["A*"]);
  document.querySelector("#pill-a").textContent = numberFormat.format(distribution.A);
  document.querySelector("#pill-b").textContent = numberFormat.format(distribution.B);
  document.querySelector("#pill-c").textContent = numberFormat.format(distribution.C);
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
}

let pendingFrame = 0;
function scheduleUpdate() {
  cancelAnimationFrame(pendingFrame);
  pendingFrame = requestAnimationFrame(applyState);
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
    state.sortDirection = key === "rating" || key === "year" ? "desc" : "asc";
  }
  scheduleUpdate();
}

function setSortKey(key) {
  if (state.sortKey !== key) {
    state.sortKey = key;
    state.sortDirection = key === "rating" || key === "year" ? "desc" : "asc";
    scheduleUpdate();
  }
}

function toggleSortDirection() {
  state.sortDirection = state.sortDirection === "asc" ? "desc" : "asc";
  scheduleUpdate();
}

function resetFilters() {
  state.title = "";
  state.discipline = "";
  state.ratings.clear();
  state.detail = "";
  els.titleFilter.value = "";
  els.disciplineFilter.value = "";
  els.detailFilter.value = "";
  scheduleUpdate();
}

function csvValue(value) {
  const text = String(value ?? "");
  if (/[",\n]/.test(text)) return `"${text.replaceAll('"', '""')}"`;
  return text;
}

function downloadCsv() {
  const header = ["Journal Title", "Rating", "Discipline", "FoR", "Publisher", "ISSN", "ISSN Online", "Year Inception"];
  const rows = state.filtered.map((row) => [
    row.title,
    row.rating,
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
    scheduleUpdate();
  });

  els.disciplineFilter.addEventListener("input", (event) => {
    state.discipline = normalize(event.target.value);
    scheduleUpdate();
  });

  els.detailFilter.addEventListener("input", (event) => {
    state.detail = normalize(event.target.value);
    scheduleUpdate();
  });

  els.resetFilters.addEventListener("click", resetFilters);
  els.downloadCsv.addEventListener("click", downloadCsv);
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
      scheduleUpdate();
    });
  }
}

populateDisciplines();
bindEvents();
applyState();
