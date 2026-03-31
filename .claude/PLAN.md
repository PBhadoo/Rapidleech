# RapidLeech — Enhancement & Improvement Plan

**Project:** RapidLeech v2.0.2  
**Maintained by:** PBhadoo / Hash Hackers  
**Plan date:** 2026-03-31  
**AI assistant:** Claude Sonnet 4.6

This plan catalogs identified weaknesses, proposed enhancements, and new features organized by priority. Each item includes rationale and implementation notes.

---

## Priority 1 — Security Hardening

These issues pose real risk in production and should be addressed first.

### 1.1 Change Default Admin Credentials at First Run

**Problem:** `admin_user` and `admin_pass` default to `admin/admin` in `configs/config.php`. Many deployments never change these.  
**Fix:** On first boot, detect default credentials and force a redirect to a setup page that requires changing them. Alternatively, generate a random password during `rapidleech.sh` install and print it once.  
**Files:** `rl_init.php`, `admin/index.php`, `rapidleech.sh`

### 1.2 CSRF Protection on All Forms

**Problem:** No CSRF tokens on download, upload, delete, or settings forms. An attacker can trick a logged-in admin into triggering actions via a crafted page.  
**Fix:** Generate a per-session CSRF token (store in PHP session or signed cookie), embed as hidden field in all forms, validate server-side before processing.  
**Files:** `index.php`, `admin/index.php`, all templates (`templates/*/main.php`)

### 1.3 Add Secure + SameSite Flags to Cookies

**Problem:** `rl_user_token` cookie is HttpOnly but lacks `Secure` and `SameSite=Lax` flags. Over plain HTTP the token is exposed; over HTTPS it's still missing the `Secure` flag.  
**Fix:** Detect HTTPS (`$_SERVER['HTTPS']`) and set `Secure` flag accordingly. Always set `SameSite=Lax`.  
**Files:** `rl_init.php` → `get_user_token()`

### 1.4 Rate Limiting on Download Submission

**Problem:** No throttle on how many downloads a single user/IP can submit. Enables abuse (hammering external services through the server, filling disk).  
**Fix:** Track submission count per token in a small flat file or via APCu. Limit to e.g. 10 active submissions per token. Return HTTP 429 with retry-after on excess.  
**Files:** `index.php`, new `classes/rate_limiter.php`

### 1.5 Content Security Policy Headers

**Problem:** No CSP header. XSS (e.g. from a maliciously-named file or reflected error message) can execute arbitrary JS.  
**Fix:** Add a restrictive `Content-Security-Policy` header in `rl_init.php`. Start with `default-src 'self'` and relax only what templates need (inline styles for themes, fonts CDN).  
**Files:** `rl_init.php`

### 1.6 Sanitize Filenames Before Writing to `files.lst`

**Problem:** Filenames from remote servers are written into `files.lst` without thorough sanitization. Maliciously crafted filenames could break deserialization or cause path traversal.  
**Fix:** Strip path components (`basename()`), remove null bytes, limit length to 255 chars, and validate against allowed character set before registering.  
**Files:** Functions that write to `files.lst` in `classes/other.php`

---

## Priority 2 — Reliability & Concurrency

### 2.1 Replace `files.lst` Serialized Flat File with SQLite

**Problem:** `files.lst` uses PHP `serialize()`/`unserialize()` with `flock()`. Under concurrent downloads, lock contention causes race conditions and file corruption. Reads require loading the entire file into memory.  
**Fix:** Migrate to SQLite via PDO. Schema: `files(id, name, size, date, owner_token, path, mimetype)`. Add indexes on `owner_token` and `date`. Wrap all writes in transactions.  
**Migration:** Write a one-time migration script that reads `files.lst` and inserts rows.  
**Files:** New `classes/file_registry.php`, `configs/files.db` (gitignored), migration script

### 2.2 Replace `downloads.lst` with SQLite Table

**Problem:** Same flock/race issue as `files.lst` but for active downloads. Progress polling via `ajax.php` reads this file on every AJAX tick.  
**Fix:** Add a `downloads` table to the same SQLite DB. Dramatically reduces I/O for the AJAX progress loop.  
**Files:** `classes/download_tracker.php`, `ajax.php`

### 2.3 Switch Progress Polling from AJAX to Server-Sent Events (SSE)

**Problem:** `ajax.php` is polled every 2s by the frontend, creating a continuous HTTP request flood even when nothing is downloading.  
**Fix:** Replace the polling endpoint with an SSE stream endpoint (`ajax.php?sse=1`). The client uses `EventSource` to receive push updates. Fall back to polling if SSE is unavailable.  
**Files:** `ajax.php`, `templates/flavor/main.php`, `classes/js.js`

### 2.4 Improve Queue Worker Error Recovery

**Problem:** If `queue_worker.php` crashes mid-chunk, the chunk metadata in `download_queue.json` is left in an inconsistent state and the download stalls forever.  
**Fix:** Add a heartbeat timestamp per active download. A watchdog (called from `rl_init.php` or a cron) marks downloads as failed if heartbeat is stale (> 60s). Surface stalled downloads in the UI with a "Retry" button.  
**Files:** `queue_worker.php`, `classes/download_queue.php`, `ajax.php`

---

## Priority 3 — Developer Experience & Maintainability

### 3.1 Introduce Composer Autoloading (PSR-4)

**Problem:** Classes are loaded via scattered `require_once()` calls. Adding new classes requires manually updating every include point. No dependency management.  
**Fix:** Add `composer.json` with PSR-4 autoload mapping (`RapidLeech\\` → `classes/`). Replace `require_once` blocks in `rl_init.php` with `require 'vendor/autoload.php'`.  
**Files:** New `composer.json`, `rl_init.php`, all files with manual includes  
**Note:** Keep backward compat — plugins loaded dynamically should still work.

### 3.2 Add PHPUnit Test Suite

**Problem:** Zero automated tests. Regressions in core classes (http.php, download_queue.php, logger.php) are caught only by manual testing.  
**Fix:** Add PHPUnit as a dev dependency. Write unit tests for:
- `classes/other.php` — utility functions (bytesToKbOrMbOrGb, cut_str, etc.)
- `classes/logger.php` — log write, rotation
- `classes/download_queue.php` — queue add/remove/status
- `classes/blowfish.php` — encrypt/decrypt round-trip
- Filename sanitization logic  
**Files:** New `tests/` directory, `phpunit.xml`, `composer.json` (dev deps)

### 3.3 Add GitHub Actions CI Pipeline

**Problem:** No CI. Broken PHP syntax in a plugin can go undetected until production.  
**Fix:** Add `.github/workflows/ci.yml` that runs on push/PR:
1. PHP syntax check (`php -l`) on all `.php` files
2. PHPUnit tests
3. Optional: PHP_CodeSniffer for PSR-12 style  
**Files:** New `.github/workflows/ci.yml`

### 3.4 Add PHP 8.x Typed Properties and Return Types to Core Classes

**Problem:** Core classes use untyped properties and lack return type declarations, making IDE support and refactoring harder.  
**Fix:** Incrementally add types to `classes/logger.php`, `classes/download_tracker.php`, `classes/download_queue.php` — the smaller, newer classes that are cleanest to start with.  
**Files:** Classes listed above

---

## Priority 4 — Feature Enhancements

### 4.1 Docker + Docker Compose Support

**Problem:** Deployment requires a manual bash script on Ubuntu 22/24 only. No reproducible local dev environment.  
**Fix:** Add:
- `Dockerfile` — PHP 8.3-apache base, installs yt-dlp, ffmpeg, Deno, required extensions
- `docker-compose.yml` — mounts `files/` and `configs/` as volumes for persistence
- `.dockerignore`  
**Usage:** `docker compose up` → running instance at localhost:8080  
**Files:** New `Dockerfile`, `docker-compose.yml`, `.dockerignore`

### 4.2 REST API Layer

**Problem:** No programmatic access. Embedding RapidLeech in other tools or building a mobile client requires scraping the HTML UI.  
**Fix:** Add `api.php` with JSON endpoints:

| Method | Endpoint | Action |
|---|---|---|
| POST | `/api/download` | Submit a URL for download |
| GET | `/api/files` | List user's files |
| GET | `/api/downloads` | Active download status |
| DELETE | `/api/file/{name}` | Delete a file |
| GET | `/api/formats?url=` | yt-dlp format list for URL |

Auth: API key header (`X-API-Key`) configured in `configs/config.php`.  
**Files:** New `api.php`, new `classes/api_auth.php`

### 4.3 Webhook Notifications on Download Completion

**Problem:** Users must poll the UI to know when a download finishes. No way to trigger external workflows.  
**Fix:** Add `webhook_url` to config. On download completion, POST a JSON payload (`{filename, size, date, url}`) to the configured endpoint. Retry up to 3 times with exponential backoff.  
**Files:** `queue_worker.php`, `configs/config.php`, new `classes/webhook.php`

### 4.4 Download Scheduling

**Problem:** All downloads start immediately. No way to schedule a download for off-peak hours.  
**Fix:** Add a "Schedule for" datetime field to the download form. Store scheduled downloads in a `scheduled` table (SQLite, see 2.1). A cron job (or per-request check) triggers pending scheduled downloads.  
**Files:** `index.php`, `templates/flavor/main.php`, new `classes/scheduler.php`

### 4.5 Video Thumbnail & Metadata Display in File List

**Problem:** Downloaded videos show only filename and size. No thumbnail or video title.  
**Fix:** When yt-dlp downloads a video, save the `--write-info-json` metadata. Parse `title`, `thumbnail` URL, `duration`, `uploader`. Display in file list as a hover card or expanded row.  
**Files:** `hosts/download/ytdlp_universal.php`, `templates/flavor/main.php`

### 4.6 Clipboard Paste-to-Download

**Problem:** Users must manually paste URLs. Modern browsers support reading the clipboard.  
**Fix:** Add a "Paste from clipboard" button to the download form that calls `navigator.clipboard.readText()` and populates the URL field. Graceful fallback if permission denied.  
**Files:** `templates/flavor/main.php`, `classes/js.js`

### 4.7 Progressive Web App (PWA) Support

**Problem:** No offline capability or home screen install option.  
**Fix:** Add:
- `manifest.json` — app name, icons, theme color, display mode
- `sw.js` — service worker that caches static assets (CSS/JS/fonts)
- `<link rel="manifest">` in header template  
**Files:** New `manifest.json`, `sw.js`, `templates/flavor/header.php`

### 4.8 Per-User Download History & Statistics

**Problem:** File list shows only current files (auto-deleted after ~24h). No history after deletion.  
**Fix:** On download completion, log to a `history` SQLite table (`owner_token, filename, size, url_domain, timestamp`). Add a "History" tab to the UI showing past downloads with statistics (total GB downloaded, top sites).  
**Files:** New `history` table in `files.db`, `templates/flavor/main.php`, `ajax.php`

---

## Priority 5 — UX Improvements

### 5.1 Drag-and-Drop URL Input

**Problem:** Users can only type/paste URLs in a text field.  
**Fix:** Make the URL textarea accept dropped text. Show a visual drop target when dragging over the page.  
**Files:** `templates/flavor/main.php`, `classes/js.js`

### 5.2 Batch URL Import from Text File

**Problem:** `audl.php` supports batch download but requires pasting URLs. Users with large URL lists have to paste all at once.  
**Fix:** Add a file upload button on `audl.php` that accepts `.txt` files of URLs (one per line), reads them with the File API, and populates the textarea.  
**Files:** `audl.php`, `templates/flavor/main.php`

### 5.3 Admin Dashboard Charts

**Problem:** Admin panel shows raw stats (file count, disk %, active downloads) but no trends or visualizations.  
**Fix:** Add simple charts to the admin panel using Chart.js (loaded from CDN or bundled):
- Downloads per day (last 7 days) from `activity.log`
- Disk usage over time
- Top download sources (domains)  
**Files:** `admin/index.php`, `templates/flavor/header.php` (add Chart.js)

### 5.4 Better Mobile UI for File List

**Problem:** The file list table is not well-optimized for small screens; columns overflow or collapse poorly.  
**Fix:** Convert file list to a card-based layout on mobile (`@media (max-width: 640px)`). Each card shows filename, size, date, and action buttons.  
**Files:** `templates/flavor/main.php` (CSS + markup)

### 5.5 Keyboard Shortcuts

**Problem:** Power users must use the mouse for all actions.  
**Fix:** Add keyboard shortcuts:
- `Ctrl+V` anywhere on page → focus URL input and paste
- `Enter` in URL field → submit download
- `Esc` → cancel/close modals  
**Files:** `classes/js.js`

---

## Deferred / Out of Scope

The following ideas were considered but are intentionally deferred:

- **Multi-user accounts with passwords** — Conflicts with the project's no-registration philosophy. Token-based isolation is a feature, not a bug.
- **Redis/Memcached caching** — Adds infrastructure dependency; SQLite (2.1) is sufficient for the scale this project targets.
- **Full plugin test suite** — 50+ plugins depend on live third-party services; automated testing would require extensive mocking or a test account farm. Not worth the maintenance cost.
- **TypeScript rewrite of frontend JS** — Small surface area; overhead of a build step outweighs benefits.

---

## Implementation Order

For a single developer, suggested sequencing:

1. **Security first:** 1.1 → 1.3 → 1.2 → 1.5 → 1.4 → 1.6
2. **Foundation:** 3.1 (Composer) → 3.2 (PHPUnit) → 3.3 (CI)
3. **Reliability:** 2.1+2.2 (SQLite migration) → 2.4 (queue recovery) → 2.3 (SSE)
4. **DevOps:** 4.1 (Docker)
5. **Features:** 4.2 (API) → 4.5 (thumbnails) → 4.3 (webhooks) → 4.4 (scheduling)
6. **UX:** 5.1 → 5.2 → 5.4 → 5.3 → 5.5 → 4.6 → 4.7 → 4.8
