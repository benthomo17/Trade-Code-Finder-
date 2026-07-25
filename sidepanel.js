/* Trade Code Finder — side panel logic (fully offline) */

// ---- pdf.js setup ----
pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL("pdf.worker.min.js");

// ---- State ----
const docs = []; // { id, name, pdf, numPages, pages: [{ text, lower, trades:Set }] }
let activeTrade = "all";
let currentQuery = "";
let searchDebounce = null;

// Viewer state
let viewer = {
  docId: null,
  page: 1,
  numPages: 0,
  terms: [],
  rendering: false,
  zoom: 1, // multiplier on top of the fit-to-width scale; 1 = fit width
  lastScale: 1, // the actual pdf.js scale used for the most recent render
};
const ZOOM_MIN = 0.4;
const ZOOM_MAX = 4;

// ---- DOM refs ----
const $ = (id) => document.getElementById(id);
const dropZone = $("dropZone");
const fileInput = $("fileInput");
const browseBtn = $("browseBtn");
const fileListEl = $("fileList");
const tradeChipsEl = $("tradeChips");
const searchInput = $("searchInput");
const clearSearchBtn = $("clearSearch");
const searchMetaEl = $("searchMeta");
const resultsEl = $("results");
const emptyState = $("emptyState");
const loadingBar = $("loadingBar");

// Viewer refs
const viewerEl = $("viewer");
const viewerBack = $("viewerBack");
const viewerTitle = $("viewerTitle");
const viewerCite = $("viewerCite");
const prevPageBtn = $("prevPage");
const nextPageBtn = $("nextPage");
const pageIndicator = $("pageIndicator");
const pdfCanvas = $("pdfCanvas");
const highlightLayer = $("highlightLayer");
const canvasWrap = $("canvasWrap");
const zoomInBtn = $("zoomInBtn");
const zoomOutBtn = $("zoomOutBtn");
const zoomIndicator = $("zoomIndicator");

let uid = 0;

// =====================================================================
// Trade chips
// =====================================================================
function renderChips() {
  tradeChipsEl.innerHTML = "";
  const all = document.createElement("button");
  all.className = "chip" + (activeTrade === "all" ? " active" : "");
  all.style.background = activeTrade === "all" ? "#c6cfd8" : "";
  all.innerHTML = `<span>All trades</span>`;
  all.onclick = () => setTrade("all");
  tradeChipsEl.appendChild(all);

  for (const key of TRADE_ORDER) {
    const t = TRADES[key];
    const chip = document.createElement("button");
    const isActive = activeTrade === key;
    chip.className = "chip" + (isActive ? " active" : "");
    if (isActive) chip.style.background = t.color;
    chip.innerHTML =
      `<span class="chip-dot" style="background:${t.color}"></span>` +
      `<span>${t.icon} ${t.label}</span>`;
    chip.onclick = () => setTrade(key);
    tradeChipsEl.appendChild(chip);
  }
}

function setTrade(key) {
  activeTrade = key;
  renderChips();
  runSearch();
}

// =====================================================================
// File loading
// =====================================================================
browseBtn.addEventListener("click", (e) => { e.stopPropagation(); fileInput.click(); });
dropZone.addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", (e) => {
  // Copy the list before clearing the input — clearing empties the live
  // FileList. Clearing is what makes picking the *same* file again work;
  // without it the browser fires no change event and the extension looks
  // like it's ignoring you.
  const files = Array.from(e.target.files || []);
  e.target.value = "";
  handleFiles(files);
});

["dragenter", "dragover"].forEach((ev) =>
  dropZone.addEventListener(ev, (e) => { e.preventDefault(); dropZone.classList.add("dragover"); })
);
["dragleave", "drop"].forEach((ev) =>
  dropZone.addEventListener(ev, (e) => { e.preventDefault(); dropZone.classList.remove("dragover"); })
);
dropZone.addEventListener("drop", (e) => {
  const files = e.dataTransfer.files;
  handleFiles(files);
});

async function handleFiles(fileList) {
  const pdfs = Array.from(fileList).filter(
    (f) => f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf")
  );
  if (!pdfs.length) return;

  for (const file of pdfs) {
    const id = ++uid;
    const doc = { id, name: file.name, pdf: null, numPages: 0, pages: [], status: "loading" };
    docs.push(doc);
    renderFileList();
    try {
      const buf = await file.arrayBuffer();
      await extractDoc(doc, buf);
      doc.status = "ready";
    } catch (err) {
      console.error("Failed to load", file.name, err);
      doc.status = "error";
    }
    renderFileList();
    runSearch();
  }
}

async function extractDoc(doc, buffer) {
  loadingBar.hidden = false;
  try {
    await extractDocInner(doc, buffer);
  } finally {
    // Always clear the progress bar, even if the PDF turns out to be
    // unreadable — a stuck bar makes a working extension look broken.
    loadingBar.hidden = true;
  }
}

async function extractDocInner(doc, buffer) {
  const task = pdfjsLib.getDocument({ data: buffer });
  const pdf = await task.promise;
  doc.pdf = pdf;
  doc.numPages = pdf.numPages;

  for (let p = 1; p <= pdf.numPages; p++) {
    // The user can remove a PDF while it's still being read — stop cleanly
    // instead of racing against a destroyed document.
    if (!docs.includes(doc)) return;
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    const text = content.items.map((i) => (i.str || "")).join(" ").replace(/\s+/g, " ").trim();
    const lower = text.toLowerCase();
    const trades = detectTrades(lower);
    doc.pages.push({ text, lower, trades });
    // update progress label occasionally
    if (p % 15 === 0) {
      doc.progress = p;
      renderFileList();
    }
    page.cleanup();
  }
  doc.progress = pdf.numPages;
}

// Build a matcher for a term. Purely alphanumeric terms use word
// boundaries (so "amp" won't match "example"); terms with punctuation
// like "o.c." or "p-trap" fall back to substring matching.
function makeMatcher(term, global) {
  const t = term.toLowerCase();
  const flags = global ? "gi" : "i";
  if (/^[a-z0-9]([a-z0-9 ]*[a-z0-9])?$/.test(t)) {
    return new RegExp("\\b" + escapeRegex(t) + "\\b", flags);
  }
  return new RegExp(escapeRegex(t), flags);
}

function hasTerm(text, term) {
  return makeMatcher(term, false).test(text);
}

// Count occurrences and return the index of the first match.
function countTerm(lowerText, term) {
  const re = makeMatcher(term, true);
  let m, count = 0, first = -1;
  while ((m = re.exec(lowerText)) !== null) {
    count++;
    if (first === -1) first = m.index;
    if (m.index === re.lastIndex) re.lastIndex++; // guard against zero-width
  }
  return { count, first };
}

// Which trades' keywords appear on this page?
function detectTrades(lowerText) {
  const set = new Set();
  for (const key of Object.keys(TRADES)) {
    for (const kw of TRADES[key].keywords) {
      if (hasTerm(lowerText, kw)) { set.add(key); break; }
    }
  }
  return set;
}

function renderFileList() {
  fileListEl.innerHTML = "";
  for (const doc of docs) {
    const li = document.createElement("li");
    li.className = "file-item" + (doc.status === "loading" ? " loading" : "");
    let pageInfo = "";
    if (doc.status === "loading") pageInfo = `reading… ${doc.progress || 0}/${doc.numPages || "?"}`;
    else if (doc.status === "error") pageInfo = "⚠ could not read";
    else pageInfo = `${doc.numPages} pg`;
    li.innerHTML =
      `<span class="fi-icon">📄</span>` +
      `<span class="fi-name" title="${escapeHtml(doc.name)}">${escapeHtml(doc.name)}</span>` +
      `<span class="fi-pages">${pageInfo}</span>`;
    const rm = document.createElement("button");
    rm.className = "fi-remove";
    rm.textContent = "✕";
    rm.title = "Remove";
    rm.onclick = () => removeDoc(doc.id);
    li.appendChild(rm);
    fileListEl.appendChild(li);
  }
}

function removeDoc(id) {
  // If this document is the one on screen, close the viewer before the
  // underlying PDF is destroyed, otherwise the viewer is left pointing at
  // freed data and every later action silently fails.
  if (viewer.docId === id) {
    closeViewer();
    viewer.docId = null;
  }
  const idx = docs.findIndex((d) => d.id === id);
  if (idx >= 0) {
    try { docs[idx].pdf && docs[idx].pdf.destroy(); } catch (e) {}
    docs.splice(idx, 1);
  }
  renderFileList();
  runSearch();
}

// =====================================================================
// Search
// =====================================================================
searchInput.addEventListener("input", () => {
  currentQuery = searchInput.value;
  clearSearchBtn.hidden = !currentQuery;
  clearTimeout(searchDebounce);
  searchDebounce = setTimeout(runSearch, 140);
});
clearSearchBtn.addEventListener("click", () => {
  searchInput.value = "";
  currentQuery = "";
  clearSearchBtn.hidden = true;
  runSearch();
  searchInput.focus();
});

function activeTermsFor(query) {
  // Base terms from the query (expanded with trade synonyms)
  let terms = expandQuery(query);
  // If a trade is selected and there is no query, use that trade's keywords
  if (!query && activeTrade !== "all") {
    terms = TRADES[activeTrade].keywords.slice();
  }
  return terms.filter(Boolean);
}

function runSearch() {
  const readyDocs = docs.filter((d) => d.status === "ready");
  const query = currentQuery.trim().toLowerCase();
  const terms = activeTermsFor(query);

  // Nothing to show
  if (!readyDocs.length) {
    emptyState.hidden = false;
    emptyState.querySelector(".empty-title").textContent = docs.length
      ? "Reading your PDFs…"
      : "No PDFs loaded yet";
    resultsEl.querySelectorAll(".result-group").forEach((n) => n.remove());
    searchMetaEl.textContent = "";
    return;
  }
  emptyState.hidden = true;
  resultsEl.querySelectorAll(".result-group").forEach((n) => n.remove());

  if (!terms.length) {
    searchMetaEl.textContent = "Type a term or pick a trade to search.";
    const hint = document.createElement("div");
    hint.className = "result-group";
    hint.innerHTML = `<div class="empty-state"><div class="empty-icon">🔍</div>
      <p class="empty-title">Ready to search</p>
      <p class="empty-sub">Try "GFCI", "joist span", "vent", "combustion air" — or tap a trade chip to browse.</p></div>`;
    resultsEl.appendChild(hint);
    return;
  }

  const MAX_PER_DOC = 60;
  let totalHits = 0;
  const groups = [];

  for (const doc of readyDocs) {
    const hits = [];
    for (let i = 0; i < doc.pages.length; i++) {
      const page = doc.pages[i];
      // Trade filter: page must belong to the selected trade
      if (activeTrade !== "all" && !page.trades.has(activeTrade)) continue;

      let count = 0;
      let firstIdx = -1;
      for (const term of terms) {
        const { count: c, first } = countTerm(page.lower, term);
        if (c === 0) continue;
        count += c;
        if (firstIdx === -1 || (first !== -1 && first < firstIdx)) firstIdx = first;
      }
      if (count > 0) {
        const plain = makeSnippetPlain(page.text, firstIdx);
        hits.push({
          pageNum: i + 1,
          count,
          firstIdx,
          snippet: highlightTerms(plain, terms),
          plain,
          codeRef: extractCodeRef(plain),
          trades: page.trades,
        });
      }
    }
    if (hits.length) {
      hits.sort((a, b) => b.count - a.count || a.pageNum - b.pageNum);
      totalHits += hits.length;
      groups.push({ doc, hits: hits.slice(0, MAX_PER_DOC), truncated: hits.length > MAX_PER_DOC, total: hits.length });
    }
  }

  // Meta line
  const label = query
    ? `“${currentQuery.trim()}”`
    : `${TRADES[activeTrade]?.label || ""} pages`;
  if (!totalHits) {
    searchMetaEl.textContent = `No matches for ${label}${activeTrade !== "all" ? " in " + TRADES[activeTrade].label : ""}.`;
    const none = document.createElement("div");
    none.className = "result-group";
    none.innerHTML = `<div class="empty-state"><div class="empty-icon">🚫</div>
      <p class="empty-title">No matches</p>
      <p class="empty-sub">Try a different term, remove the trade filter, or check the PDF has selectable text (scanned pages won't search).</p></div>`;
    resultsEl.appendChild(none);
    return;
  }
  searchMetaEl.textContent = `${totalHits} page${totalHits === 1 ? "" : "s"} match ${label}` +
    (query && terms.length > 1 ? ` · incl. related terms` : "");

  // Render groups
  for (const g of groups) {
    const group = document.createElement("div");
    group.className = "result-group";
    const head = document.createElement("div");
    head.className = "result-group-head";
    head.innerHTML = `📄 ${escapeHtml(g.doc.name)} · ${g.total} hit${g.total === 1 ? "" : "s"}`;
    group.appendChild(head);

    for (const hit of g.hits) {
      const card = document.createElement("div");
      card.className = "result-card";
      const badges = Array.from(hit.trades)
        .map((k) => `<span class="rc-badge" style="background:${TRADES[k].color}">${TRADES[k].icon}</span>`)
        .join("");
      const refTag = hit.codeRef
        ? `<span class="rc-ref">§ ${escapeHtml(hit.codeRef)}</span>`
        : "";
      card.innerHTML =
        `<div class="rc-top"><span class="rc-page">Page ${hit.pageNum}${refTag}</span><span class="rc-trades">${badges}</span></div>` +
        `<div class="rc-src">📄 ${escapeHtml(g.doc.name)}</div>` +
        `<div class="rc-snippet">${hit.snippet}</div>` +
        `<div class="rc-actions">` +
        `<span class="rc-count">${hit.count} match${hit.count === 1 ? "" : "es"} · tap to open</span>` +
        `<button class="cite-btn" title="Copy citation">⧉ Cite</button>` +
        `</div>`;
      card.onclick = () => openViewer(g.doc.id, hit.pageNum, terms);
      const citeBtn = card.querySelector(".cite-btn");
      citeBtn.onclick = (e) => {
        e.stopPropagation();
        copyCitation(citeBtn, buildCitation(g.doc.name, hit.pageNum, hit.codeRef, hit.plain));
      };
      group.appendChild(card);
    }
    if (g.truncated) {
      const more = document.createElement("div");
      more.className = "rc-count";
      more.style.margin = "2px 4px 0";
      more.textContent = `+${g.total - g.hits.length} more pages — refine your search to narrow this down.`;
      group.appendChild(more);
    }
    resultsEl.appendChild(group);
  }
}

function makeSnippetPlain(text, idx) {
  if (idx < 0) idx = 0;
  const radius = 90;
  let start = Math.max(0, idx - radius);
  let end = Math.min(text.length, idx + radius);
  let snip = text.slice(start, end);
  if (start > 0) snip = "… " + snip;
  if (end < text.length) snip = snip + " …";
  return snip;
}

// Try to pull a code-section reference out of the snippet, e.g.
// "210.8", "R602.6", "906.2", "E3901.7" — the kind of number a trade
// worker actually cites to an inspector.
function extractCodeRef(text) {
  const patterns = [
    /\b[A-Z]{1,3}\d{2,4}(?:\.\d{1,3}){1,3}\b/,   // R602.6, E3901.7
    /\b\d{2,4}(?:\.\d{1,3}){1,3}\b/,             // 210.8, 906.2.1
    /\bTable\s+[A-Z]?\d{2,4}(?:\.\d{1,3})*\b/i,  // Table 310.16
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m) return m[0].replace(/\s+/g, " ").trim();
  }
  return "";
}

// Build a clean, paste-ready citation string.
function buildCitation(pdfName, pageNum, codeRef, snippet) {
  const parts = [];
  if (codeRef) parts.push("§ " + codeRef);
  parts.push(pdfName);
  parts.push("p. " + pageNum);
  let cite = parts.join(", ");
  const quote = (snippet || "").replace(/^…\s*/, "").replace(/\s*…$/, "").trim();
  if (quote) cite += '\n"' + quote + '"';
  return cite;
}

async function copyCitation(btn, text) {
  const original = btn.textContent;
  try {
    await navigator.clipboard.writeText(text);
    btn.textContent = "✓ Copied";
  } catch (e) {
    // Fallback for environments where clipboard API is blocked
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand("copy"); btn.textContent = "✓ Copied"; }
    catch (_) { btn.textContent = "Copy failed"; }
    document.body.removeChild(ta);
  }
  setTimeout(() => { btn.textContent = original; }, 1400);
}

function highlightTerms(str, terms) {
  // Wrap matches in private-use sentinels, escape HTML, then swap in <mark>
  // tags so matched source text can never inject markup.
  const OPEN = "\uE000";
  const CLOSE = "\uE001";
  let out = str;
  const sorted = [...terms].filter((t) => t.length >= 2).sort((a, b) => b.length - a.length);
  for (const term of sorted) {
    const re = new RegExp("(" + escapeRegex(term) + ")", "gi");
    out = out.replace(re, (m) => OPEN + m + CLOSE);
  }
  out = escapeHtml(out);
  out = out.split(OPEN).join("<mark>").split(CLOSE).join("</mark>");
  return out;
}

// =====================================================================
// Viewer
// =====================================================================
// Waits for two animation frames — guarantees the browser has finished
// laying out the viewer (which was just un-hidden) before we measure its
// width. Measuring in the same tick as un-hiding can occasionally read a
// stale/smaller width, which is what made the page render undersized by
// default instead of filling the panel.
function nextPaint() {
  return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
}

async function openViewer(docId, pageNum, terms) {
  const doc = docs.find((d) => d.id === docId);
  if (!doc || !doc.pdf) return;
  viewer = {
    docId, page: pageNum, numPages: doc.numPages, terms: terms.slice(),
    rendering: false, zoom: 1, lastScale: 1,
  };
  viewerTitle.textContent = doc.name;
  viewerEl.hidden = false;
  await nextPaint();
  await renderViewerPage();
}

function closeViewer() {
  viewerEl.hidden = true;
  pendingZoom = null;
  renderToken++; // invalidate any render still in flight
  if (activeRenderTask) {
    try { activeRenderTask.cancel(); } catch (_) {}
    activeRenderTask = null;
  }
  viewer.rendering = false;
}
viewerBack.addEventListener("click", closeViewer);
viewerCite.addEventListener("click", () => {
  const doc = docs.find((d) => d.id === viewer.docId);
  if (!doc) return;
  const page = doc.pages[viewer.page - 1];
  const text = page ? page.text : "";
  // Snippet anchored at the first matched term on this page (if any)
  let idx = 0;
  for (const t of viewer.terms) {
    const at = (page ? page.lower : "").indexOf(t.toLowerCase());
    if (at !== -1) { idx = at; break; }
  }
  const snippet = makeSnippetPlain(text, idx);
  const codeRef = extractCodeRef(snippet) || extractCodeRef(text);
  copyCitation(viewerCite, buildCitation(doc.name, viewer.page, codeRef, snippet));
});
prevPageBtn.addEventListener("click", () => gotoPage(viewer.page - 1));
nextPageBtn.addEventListener("click", () => gotoPage(viewer.page + 1));
document.addEventListener("keydown", (e) => {
  if (viewerEl.hidden) return;
  if (e.key === "Escape") closeViewer();
  else if (e.key === "ArrowLeft" || e.key === "ArrowUp") gotoPage(viewer.page - 1);
  else if (e.key === "ArrowRight" || e.key === "ArrowDown") gotoPage(viewer.page + 1);
});

// Page turns are never dropped: a newer request simply supersedes the
// in-flight render, so holding the arrow key advances smoothly instead of
// ignoring presses until the current page finishes drawing.
function gotoPage(n) {
  if (!viewer.docId || n < 1 || n > viewer.numPages || n === viewer.page) return;
  viewer.page = n;
  pendingZoom = null;
  renderViewerPage();
}

// =====================================================================
// Zoom controls — trackpad pinch, Ctrl/Cmd + scroll wheel, Ctrl/Cmd +/-/0,
// and the +/− buttons. All additive: default zoom is 1 (fit-to-width),
// so nothing changes for anyone who never touches these controls.
// =====================================================================
function clampZoom(z) {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));
}

// Zoom while keeping a specific point on screen (clientX/clientY) visually
// anchored — the same point in the document stays under the cursor/fingers
// instead of the view jumping. Falls back to the panel center if no point
// is given (keyboard shortcuts, +/− buttons, or reset).
let pendingZoom = null;

async function zoomViewerTo(newZoom, clientX, clientY) {
  if (viewerEl.hidden || !viewer.docId) return;
  if (viewer.rendering) {
    // Queue only the newest request; it runs as soon as the current render
    // finishes. Keeps rapid pinch/wheel smooth instead of dropping steps.
    pendingZoom = { zoom: clampZoom(newZoom), x: clientX, y: clientY };
    return;
  }
  const rect = canvasWrap.getBoundingClientRect();
  if (!rect.width || !rect.height) return; // panel not laid out yet
  const cx = typeof clientX === "number" ? clientX : rect.left + rect.width / 2;
  const cy = typeof clientY === "number" ? clientY : rect.top + rect.height / 2;

  const oldScale = viewer.lastScale || 1;
  // Point in unscaled document content-space, so it can be re-projected at
  // the new scale after re-rendering.
  const contentX = (cx - rect.left + canvasWrap.scrollLeft) / oldScale;
  const contentY = (cy - rect.top + canvasWrap.scrollTop) / oldScale;

  viewer.zoom = clampZoom(newZoom);
  await renderViewerPage({ skipAutoScroll: true });

  // Re-anchor instantly and within the scroller's real bounds. Unclamped
  // values get silently corrected by the browser a frame later, which is
  // what made the page twitch back after each zoom step.
  const newScale = viewer.lastScale || 1;
  const maxLeft = Math.max(0, canvasWrap.scrollWidth - canvasWrap.clientWidth);
  const maxTop = Math.max(0, canvasWrap.scrollHeight - canvasWrap.clientHeight);
  const wantLeft = contentX * newScale - (cx - rect.left);
  const wantTop = contentY * newScale - (cy - rect.top);
  canvasWrap.scrollLeft = Math.min(maxLeft, Math.max(0, wantLeft));
  canvasWrap.scrollTop = Math.min(maxTop, Math.max(0, wantTop));
}

function zoomViewerBy(factor, clientX, clientY) {
  return zoomViewerTo((viewer.zoom || 1) * factor, clientX, clientY);
}

if (zoomInBtn) {
  zoomInBtn.addEventListener("click", () => zoomViewerBy(1.25));
}
if (zoomOutBtn) {
  zoomOutBtn.addEventListener("click", () => zoomViewerBy(1 / 1.25));
}
if (zoomIndicator) {
  zoomIndicator.addEventListener("click", () => zoomViewerTo(1));
}

// Trackpad pinch-to-zoom: Chrome/Chromium reports pinch gestures as wheel
// events with ctrlKey set to true, even though no key is actually held.
// Holding literal Ctrl (Windows/Linux) or Cmd (Mac) and scrolling is
// treated the same way, so both gestures "just work".
let wheelAccum = 1;
let wheelPoint = { x: 0, y: 0 };
let wheelFrame = null;

if (canvasWrap) {
  canvasWrap.addEventListener(
    "wheel",
    (e) => {
      if (viewerEl.hidden) return;
      if (!(e.ctrlKey || e.metaKey)) return; // plain scroll still scrolls normally
      e.preventDefault();
      // A trackpad pinch fires dozens of wheel events per second. Accumulate
      // them and act once per animation frame, so one smooth gesture becomes
      // one smooth zoom instead of a burst of competing re-renders.
      wheelAccum *= Math.exp(-e.deltaY * 0.012);
      wheelPoint = { x: e.clientX, y: e.clientY };
      if (wheelFrame === null) {
        wheelFrame = requestAnimationFrame(() => {
          wheelFrame = null;
          const factor = wheelAccum;
          wheelAccum = 1;
          if (factor !== 1) zoomViewerBy(factor, wheelPoint.x, wheelPoint.y);
        });
      }
    },
    { passive: false }
  );
}

// Keyboard: Ctrl/Cmd + "+"/"-"/"0", same convention as browser page zoom.
document.addEventListener("keydown", (e) => {
  if (viewerEl.hidden) return;
  if (!(e.ctrlKey || e.metaKey)) return;
  if (e.key === "+" || e.key === "=") {
    e.preventDefault();
    zoomViewerBy(1.25);
  } else if (e.key === "-" || e.key === "_") {
    e.preventDefault();
    zoomViewerBy(1 / 1.25);
  } else if (e.key === "0") {
    e.preventDefault();
    zoomViewerTo(1);
  }
});

// Keep the page filling the panel's full width if the panel itself gets
// resized (e.g. the user drags the side panel wider) while a page is open.
if (typeof ResizeObserver !== "undefined") {
  let resizeDebounce = null;
  const ro = new ResizeObserver(() => {
    if (viewerEl.hidden || !viewer.docId) return;
    clearTimeout(resizeDebounce);
    resizeDebounce = setTimeout(() => renderViewerPage({ skipAutoScroll: true }), 120);
  });
  ro.observe(canvasWrap);
}

// Every render gets a ticket number. If a newer render starts (page turn,
// zoom, resize, a different document opened), the older one stops touching
// the screen instead of painting a stale page over the new one — that kind
// of overlap is the classic source of "it showed the wrong page for a
// second" glitches.
let renderToken = 0;
let activeRenderTask = null;

// Safety wrapper: if a page ever fails to render (corrupt PDF, a page the
// library can't parse), the viewer recovers instead of locking up with
// rendering=true, which would freeze zoom and page navigation for good.
async function renderViewerPage(opts) {
  const token = ++renderToken;
  // Stop the previous page mid-render so we're not decoding two pages at
  // once — that contention is what made fast page-flipping stutter.
  if (activeRenderTask) {
    try { activeRenderTask.cancel(); } catch (_) {}
    activeRenderTask = null;
  }
  try {
    return await renderViewerPageInner(opts, token);
  } catch (err) {
    if (!err || err.name !== "RenderingCancelledException") {
      console.warn("Could not render this page:", err);
    }
  } finally {
    if (token === renderToken) {
      viewer.rendering = false;
      const p = pendingZoom;
      pendingZoom = null;
      if (p) zoomViewerTo(p.zoom, p.x, p.y);
    }
  }
}

async function renderViewerPageInner(opts, token) {
  opts = opts || {};
  const doc = docs.find((d) => d.id === viewer.docId);
  if (!doc || !doc.pdf) return;
  const live = () => token === renderToken;
  viewer.rendering = true;
  pageIndicator.textContent = `Page ${viewer.page} / ${viewer.numPages}`;
  prevPageBtn.disabled = viewer.page <= 1;
  nextPageBtn.disabled = viewer.page >= viewer.numPages;

  const page = await doc.pdf.getPage(viewer.page);
  if (!live()) { page.cleanup(); return; }
  const baseVp = page.getViewport({ scale: 1 });
  // Fit to the full width of the viewer panel by default (minus a small
  // margin for breathing room), so the page reads at full size on open
  // rather than as a small thumbnail. viewer.zoom (default 1) multiplies
  // on top of this fit-to-width scale for manual pinch/scroll/keyboard zoom.
  const wrapWidth = canvasWrap.getBoundingClientRect().width || canvasWrap.clientWidth;
  const avail = Math.max(280, wrapWidth - 16);
  const fitScale = avail / baseVp.width;
  let scale = fitScale * (viewer.zoom || 1);
  scale = Math.min(Math.max(scale, fitScale * ZOOM_MIN), fitScale * ZOOM_MAX);
  viewer.lastScale = scale;
  if (zoomIndicator) zoomIndicator.textContent = Math.round((scale / fitScale) * 100) + "%";
  const dpr = window.devicePixelRatio || 1;
  const vp = page.getViewport({ scale });

  // Render into a detached canvas first, then blit the finished image onto
  // the visible one in a single synchronous step. Resizing a canvas clears
  // it, so painting directly into #pdfCanvas left it blank for the whole
  // render — that blank-then-redraw cycle is what read as "blinking" when
  // zooming. The visible canvas is now never blank between frames.
  const off = document.createElement("canvas");
  off.width = Math.floor(vp.width * dpr);
  off.height = Math.floor(vp.height * dpr);
  const offCtx = off.getContext("2d");
  offCtx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const task = page.render({ canvasContext: offCtx, viewport: vp });
  activeRenderTask = task;
  await task.promise;
  if (activeRenderTask === task) activeRenderTask = null;
  if (!live()) { page.cleanup(); return; }

  // Highlights are built off-DOM too, so they swap in with the new image
  // instead of vanishing and reappearing.
  const frag = document.createDocumentFragment();
  const content = await page.getTextContent();
  if (!live()) { page.cleanup(); return; }
  // Terms are already ordered by relevance (the typed query first, then its
  // synonyms) — track that rank per box so we can scroll to the best match,
  // not just whichever line pdf.js happens to emit first.
  const terms = viewer.terms.filter((t) => t.length >= 2).map((t) => t.toLowerCase());
  let targetBox = null;
  let targetRank = Infinity;
  let targetOrder = Infinity;
  let order = 0;
  for (const item of content.items) {
    const s = (item.str || "").toLowerCase();
    if (!s) continue;
    let rank = -1;
    for (let ti = 0; ti < terms.length; ti++) {
      if (matchesWordish(s, terms[ti])) { rank = ti; break; }
    }
    if (rank === -1) continue;
    const tx = pdfjsLib.Util.transform(vp.transform, item.transform);
    const fontHeight = Math.hypot(tx[2], tx[3]);
    const width = (item.width || 0) * scale;
    const left = tx[4];
    const top = tx[5] - fontHeight;
    const box = document.createElement("div");
    box.className = "hl-box";
    box.style.left = left + "px";
    box.style.top = top + "px";
    box.style.width = Math.max(width, 6) + "px";
    box.style.height = fontHeight * 1.15 + "px";
    frag.appendChild(box);
    // Best target = lowest term rank, then earliest in reading order.
    if (rank < targetRank || (rank === targetRank && order < targetOrder)) {
      targetBox = box;
      targetRank = rank;
      targetOrder = order;
    }
    order++;
  }
  // --- Atomic swap: new image + new highlights land in the same frame ---
  if (!live() || viewerEl.hidden) { page.cleanup(); return; }
  const ctx = pdfCanvas.getContext("2d");
  pdfCanvas.width = off.width;
  pdfCanvas.height = off.height;
  pdfCanvas.style.width = vp.width + "px";
  pdfCanvas.style.height = vp.height + "px";
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(off, 0, 0);

  highlightLayer.style.width = vp.width + "px";
  highlightLayer.style.height = vp.height + "px";
  highlightLayer.replaceChildren(frag);

  page.cleanup();
  viewer.renderedZoom = viewer.zoom || 1;

  // Auto-scroll straight to the matching answer and draw the eye to it —
  // skipped for zoom/resize re-renders, which manage scroll position
  // themselves so the view doesn't jump back to the highlight mid-zoom.
  if (!opts.skipAutoScroll) scrollToBox(targetBox);
}

// Loose word-ish match used only for locating the on-page highlight target
// (mirrors the word-boundary logic used for search, minus regex overhead).
function matchesWordish(haystack, term) {
  return haystack.includes(term);
}

function scrollToBox(box) {
  document.querySelectorAll(".hl-box.hl-target").forEach((b) => b.classList.remove("hl-target"));
  if (!box) {
    canvasWrap.scrollTo({ top: 0, left: 0, behavior: "smooth" });
    return;
  }
  box.classList.add("hl-target");
  const top = parseFloat(box.style.top) || 0;
  const left = parseFloat(box.style.left) || 0;
  const boxH = parseFloat(box.style.height) || 0;
  const boxW = parseFloat(box.style.width) || 0;
  const targetTop = Math.max(0, top + boxH / 2 - canvasWrap.clientHeight / 2);
  const targetLeft = Math.max(0, left + boxW / 2 - canvasWrap.clientWidth / 2);
  canvasWrap.scrollTo({ top: targetTop, left: targetLeft, behavior: "smooth" });
  // Briefly pulse the matched box so it's obvious where the answer landed.
  setTimeout(() => box.classList.remove("hl-target"), 2200);
}

// =====================================================================
// Utils
// =====================================================================
function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// =====================================================================
// "Use PDF open in this tab" — additive feature, doesn't touch anything
// above. Lets you grab whatever PDF the user already has open in Chrome
// (e.g. in Chrome's built-in PDF viewer) instead of only drag/upload.
// =====================================================================
const useTabPdfBtn = $("useTabPdfBtn");
const tabPdfStatus = $("tabPdfStatus");

// Runs *inside* the target tab (via chrome.scripting.executeScript), not in
// the side panel. That means it shares the tab's own document context — so
// blob: URLs the tab itself created resolve correctly, and any cookies/
// session the tab is already logged in with apply automatically. This is
// what actually reads "the PDF already loaded", rather than a second,
// independent download from the extension.
function readPdfBytesInPage() {
  return fetch(location.href, { credentials: "include" }).then(async (resp) => {
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const buf = await resp.arrayBuffer();
    // Sanity-check it's actually a PDF (starts with "%PDF-"), since some
    // pages 200 a login/redirect page instead of the real file.
    const head = new Uint8Array(buf.slice(0, 5));
    const headStr = String.fromCharCode(...head);
    if (headStr !== "%PDF-") throw new Error("NOT_A_PDF");
    return buf;
  });
}

// Best-effort filename for a tab's PDF. Prefers the tab's title (e.g. a
// paper's actual title on arxiv.org/pdf/2603.14045, where the URL itself
// has no useful filename) and falls back to the URL's last path segment,
// then a generic name if neither is usable.
function nameFromTab(tab) {
  const title = (tab.title || "").trim();
  if (title && !/^(about:blank|untitled)$/i.test(title)) {
    const safe = title.replace(/[\\/:*?"<>|]/g, "-").slice(0, 120).trim();
    if (safe) return /\.pdf$/i.test(safe) ? safe : safe + ".pdf";
  }
  try {
    const url = tab.url || "";
    const cleanUrl = url.split(/[?#]/)[0];
    const last = decodeURIComponent(cleanUrl.split("/").pop() || "");
    if (last && /\.pdf$/i.test(last)) return last;
    if (last) return last + ".pdf";
  } catch (_) { /* fall through */ }
  return "tab-document.pdf";
}

// Ask the tab directly whether it's showing a PDF. Many real-world PDF URLs
// have no literal ".pdf" in them at all (e.g. arxiv.org/pdf/2603.14045,
// or Chrome's built-in viewer on a redirect/proxy URL), so checking the
// document's actual content type is far more reliable than guessing from
// the URL or tab title. Falls back to that URL/title guess only if the
// tab can't be inspected at all (e.g. a restricted internal page).
async function tabLooksLikePdf(tab) {
  try {
    if (chrome.scripting) {
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => document.contentType,
      });
      const contentType = results && results[0] && results[0].result;
      if (contentType) return contentType === "application/pdf";
    }
  } catch (e) {
    console.warn("Could not check the tab's content type, falling back to a URL guess:", e);
  }
  const url = tab.url || "";
  return (
    /\.pdf(\?|#|$)/i.test(url) ||
    url.startsWith("blob:") ||
    url.startsWith("data:application/pdf") ||
    (tab.title && /\.pdf$/i.test(tab.title.trim()))
  );
}

async function loadTabPdf() {
  if (!useTabPdfBtn || !tabPdfStatus) return;
  useTabPdfBtn.disabled = true;
  tabPdfStatus.hidden = false;
  tabPdfStatus.className = "tab-pdf-status";
  tabPdfStatus.textContent = "Checking current tab…";
  try {
    if (typeof chrome === "undefined" || !chrome.tabs) {
      throw new Error("Tab access isn't available in this context.");
    }
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const tab = tabs && tabs[0];
    if (!tab || !tab.url) throw new Error("Could not read the current tab's URL.");
    const url = tab.url;
    const looksLikePdf = await tabLooksLikePdf(tab);
    if (!looksLikePdf) {
      throw new Error("The active tab doesn't look like it's showing a PDF.");
    }

    let buf = null;
    let usedFallback = false;

    // 1) Preferred: read the bytes from inside the tab itself.
    try {
      tabPdfStatus.textContent = "Reading the PDF straight from this tab…";
      if (!chrome.scripting) throw new Error("SCRIPTING_UNAVAILABLE");
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        world: "MAIN",
        func: readPdfBytesInPage,
      });
      const result = results && results[0];
      if (result && result.result) {
        buf = result.result;
      } else if (result && result.error) {
        throw result.error;
      } else {
        throw new Error("No result from the tab.");
      }
    } catch (inPageErr) {
      // 2) Fallback: fetch it independently from the side panel, same as
      // before. Covers cases where injection isn't allowed (e.g. some
      // restricted pages) even though the URL itself is reachable.
      console.warn("In-page read failed, falling back to direct fetch:", inPageErr);
      usedFallback = true;
      tabPdfStatus.textContent = "Falling back to fetching the PDF directly…";
      if (url.startsWith("blob:")) {
        // A blob: URL is scoped to the tab that created it — the side panel
        // genuinely cannot fetch it independently, so there's no fallback.
        throw new Error(
          "This tab is showing the PDF via a blob link, and the direct in-page read didn't work, so there's no way to fetch it independently."
        );
      }
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`Couldn't fetch the PDF (HTTP ${resp.status}).`);
      buf = await resp.arrayBuffer();
    }

    const name = nameFromTab(tab);
    const id = ++uid;
    const doc = { id, name, pdf: null, numPages: 0, pages: [], status: "loading" };
    docs.push(doc);
    renderFileList();
    await extractDoc(doc, buf);
    doc.status = "ready";
    renderFileList();
    runSearch();

    tabPdfStatus.className = "tab-pdf-status success";
    tabPdfStatus.textContent = usedFallback
      ? `Loaded "${name}" from this tab (via fallback fetch).`
      : `Loaded "${name}" directly from this tab.`;
  } catch (err) {
    console.error("loadTabPdf failed:", err);
    tabPdfStatus.className = "tab-pdf-status error";
    const msg = (err && err.message) || String(err);
    tabPdfStatus.textContent =
      msg +
      (msg.includes("Failed to fetch") || msg === "NOT_A_PDF"
        ? ' If this is a local file, enable "Allow access to file URLs" for this extension in chrome://extensions.'
        : "");
  } finally {
    useTabPdfBtn.disabled = false;
  }
}

if (useTabPdfBtn) useTabPdfBtn.addEventListener("click", loadTabPdf);

// ---- init ----
renderChips();
renderFileList();
searchInput.focus();
