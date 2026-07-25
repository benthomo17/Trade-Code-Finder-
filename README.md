# Trade Code Finder — Chrome Extension

Search plumbing, electrical, HVAC, and carpentry **code PDFs** fast — filtered by trade, with copy-ready citations. Everything runs **100% offline** on your device. No accounts, no API keys, no internet, no data leaves your computer.

---

## What it does

1. **Load your code PDFs** — drag them into the side panel (code books, spec sheets, permit docs, manufacturer instructions), or tap **📎 Use PDF open in this tab** to pull in whatever PDF you already have open in Chrome (including Chrome's built-in PDF viewer). Local files or downloaded PDFs both work either way.
2. **Pick a trade** — Electrical ⚡, Plumbing 🚰, HVAC ❄, Carpentry 🔨, or General 🏗 — to narrow results to pages that actually belong to that trade.
3. **Search** — type a term, a code number (e.g. `210.8`), or plain words (`GFCI near sink`, `joist span`, `combustion air`). It knows trade synonyms, so searching **"GFCI"** also finds **"ground fault"**, **"vent"** finds **DWV/AAV**, and so on.
4. **Jump to the page** — tap any result to open the PDF page with the matches highlighted right on the page.
5. **Cite it** — tap **⧉ Cite** on any result (or in the viewer) to copy a clean citation to your clipboard, including the **PDF file name**, the **page number**, and the **code section number** when it can detect one. Example:

   ```
   § 210.8, National-Electrical-Code-2023.pdf, p. 45
   "…Ground-fault circuit interrupter protection for personnel shall be provided for receptacles located near a sink…"
   ```

---

## Installing it (unpacked extension)

Chrome extensions that aren't from the Web Store are loaded as "unpacked." One-time setup, about 30 seconds:

1. Unzip `trade-code-finder.zip` somewhere permanent (don't delete the folder afterward — Chrome loads it from there).
2. Open Chrome and go to `chrome://extensions`.
3. Turn on **Developer mode** (top-right toggle).
4. Click **Load unpacked** and select the unzipped `trade-code-finder` folder.
5. Click the puzzle-piece icon in Chrome's toolbar, find **Trade Code Finder**, and pin it.
6. Click the pinned icon any time to open the side panel.

Works the same in Chrome, Edge, Brave, and other Chromium browsers.

---

## Tips

- **Scanned PDFs won't search.** If a PDF is just photos of pages (no selectable text), there's nothing to search. Run it through an OCR tool first to make the text selectable.
- **Load several books at once** — results are grouped by file name so you always know which book a hit came from.
- **No query, just a trade** — tap a trade chip with the search box empty to browse every page in your PDFs that relates to that trade.
- **Related-term search** is automatic; the results line tells you when synonyms were included.
- **Using "PDF open in this tab" on a local file:** if the PDF is a local file (`file:///...`) rather than a website, Chrome needs one extra permission — go to `chrome://extensions`, open Trade Code Finder's details, and turn on **Allow access to file URLs**. Web-hosted PDFs (`https://...`) don't need this.
- **How "Use PDF open in this tab" actually reads it:** it runs a small script inside that tab itself (not a fresh download from the side panel), so it picks up whatever session/login cookies that tab already has. This means PDFs behind a login (a permit portal, a contractor account) generally work as long as you're already logged in and viewing the PDF in that tab. If that in-page read isn't possible for some reason, it automatically falls back to a direct fetch instead, so it still works for ordinary public PDFs either way.
- **One real limitation:** if a website shows a PDF via a `blob:` link (some web apps generate the PDF in JavaScript rather than linking to a real file), it can't be read at all — this is a Chrome security restriction on `blob:` URLs, not something an extension can work around. Everything else (public PDFs, local files, login-gated PDFs) is supported.

---

## Notes for whoever maintains this

- Manifest V3, side-panel based. No network permissions requested.
- PDF parsing/rendering by **pdf.js** (`pdf.min.js` + `pdf.worker.min.js`, bundled locally — Apache-2.0).
- Trade keywords and synonyms live in `trades.js` — edit that file to add terms, trades, or code-book hints.
- Code-section detection and citation formatting live in `sidepanel.js` (`extractCodeRef`, `buildCitation`).
- The keyword lists are a helpful starting point, not legal advice — always verify against the adopted code and local amendments in your jurisdiction.
