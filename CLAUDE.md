# CLAUDE.md — RapidLeech v2.0.2

Context file for Claude Code. This document describes the project, architecture, conventions, and guidance for working on this codebase.

---

## Project Overview

**RapidLeech** is a server-side file download and transload manager. Users submit URLs via a web UI; the server downloads the file to `files/`, then users can optionally upload to another hosting service. No user registration — file ownership is enforced by a per-browser cookie token.

- **Live server:** https://hashhackers.apranet.eu.org
- **GitHub:** https://github.com/PBhadoo/Rapidleech
- **Version:** 2.0.2 (rev 43)

---

## Tech Stack

| Layer | Technology |
|---|---|
| Language | PHP 8.3+ (8.1 minimum) |
| Web server | Apache2 with mod_rewrite |
| External binaries | yt-dlp, ffmpeg, Deno, unrar |
| Frontend | HTML5/CSS3/JS, jQuery, AJAX polling |
| Storage | Flat files (no SQL DB) |
| Encryption | Blowfish (credentials) |

**Required PHP extensions:** curl, openssl, mbstring, bcmath, gd, xml, zip, intl

---

## Project Structure

```
/
├── index.php             # Main entry point — renders UI and dispatches downloads
├── ajax.php              # AJAX backend (pending downloads, progress)
├── audl.php              # Batch auto-download interface
├── auul.php              # Batch auto-upload interface
├── upload.php            # Upload-to-host handler
├── queue_worker.php      # Background parallel-chunk download worker
├── checker.php           # Link checker utility
├── rl_init.php           # Core bootstrap: constants, config, user token, failsafe cleanup
├── deny.php              # Shown when a PHP file is accessed directly
│
├── configs/
│   ├── config.php        # Main settings ($options array)
│   ├── accounts.php      # Premium credentials ($premium_acc)
│   ├── setup.php         # Additional feature flags (included by config.php)
│   ├── site_checker.php  # Plugin availability registry
│   ├── files.lst         # File registry (serialized PHP, one entry per line)
│   ├── downloads.lst     # Active download tracker (serialized)
│   ├── download_queue.json # Parallel chunk metadata (JSON)
│   ├── activity.log      # JSON activity log (rotates at 5MB)
│   └── php_errors.log    # PHP error log
│
├── hosts/
│   ├── download/         # Download plugins (50+ files, one per service)
│   │   ├── ytdlp_universal.php   # yt-dlp wrapper — handles 1000+ sites
│   │   ├── mega_co_nz.php        # Mega.nz (API-based, requires bcmath)
│   │   ├── pornhub_com.php       # HLS stream parser
│   │   ├── google_com.php        # Google Drive
│   │   ├── mediafire_com.php     # MediaFire
│   │   └── ...                   # 50+ others
│   └── upload/           # Upload plugins
│
├── classes/
│   ├── http.php          # Main HTTP/cURL downloader (parallel chunks, resume)
│   ├── download_queue.php # Queue management (max 5 concurrent, 8 chunks/file)
│   ├── download_tracker.php # Active download list (→ downloads.lst)
│   ├── logger.php        # Activity logger (JSON, 5MB rotation)
│   ├── other.php         # Utility functions
│   ├── blowfish.php      # Credential encryption/decryption
│   ├── rar.php           # RAR/Unrar binary wrapper
│   ├── pclzip.php        # Pure PHP ZIP handler
│   ├── tar.php           # TAR archive support
│   └── js.js             # jQuery + core frontend JS
│
├── templates/
│   ├── flavor/           # Modern dark/light theme (default)
│   │   ├── header.php
│   │   ├── main.php      # Central UI: file list, download form, settings tabs
│   │   ├── transloadui.php # yt-dlp format selector UI
│   │   ├── footer.php
│   │   ├── functions.php
│   │   └── sinfo.php     # Server info panel
│   └── plugmod/          # Classic theme
│
├── admin/
│   └── index.php         # Admin panel (HTTP Basic Auth)
│
├── languages/            # i18n: 12 languages (en, de, ar, es, fr, it, pt, th, tr, zh…)
├── files/                # Downloaded files (auto-cleaned, gitignored)
├── rar/                  # RAR/Unrar binaries
└── rapidleech.sh         # Ubuntu install script
```

---

## Core Architecture

### Bootstrap Flow

Every request goes through `rl_init.php`:
1. Sets constants (`ROOT_DIR`, `DOWNLOAD_DIR`, `TEMPLATE_DIR`, etc.)
2. Loads `configs/config.php` → `$options` array
3. Sets `USER_TOKEN` (32-char hex from cookie; new cookie issued if absent)
4. Runs storage failsafe (auto-delete oldest files if disk > 99% full)
5. Loads `classes/other.php` and `classes/logger.php`

### Plugin System

Every download plugin lives in `hosts/download/` and extends `DownloadClass`:

```php
class PluginName extends DownloadClass {
    public function Download($link) {
        // 1. Parse the link, fetch page(s)
        $page = $this->GetPage($url, $cookie, $post_data);
        // 2. Extract final download URL
        // 3. Stream to client
        $this->RedirectDownload($final_url, $filename, $referer, $cookie, $size);
    }
}
```

Key base-class methods: `GetPage()`, `RedirectDownload()`, `changeMesg()`.

Plugins are matched by domain via `configs/site_checker.php`.

### yt-dlp Plugin (`hosts/download/ytdlp_universal.php`)

The most complex plugin — 32KB. Flow:
1. `yt-dlp --dump-json <url>` → parse formats
2. Format selector UI shown to user
3. `yt-dlp -f <format_id> -o <output_template> <url>` downloads file
4. Per-user cookies written to a temp file, passed via `--cookies`, deleted after

### Storage

No SQL database. All state lives in flat files under `configs/`:

| File | Format | Purpose |
|---|---|---|
| `files.lst` | Serialized PHP (1 per line) | Registry of all downloaded files |
| `downloads.lst` | Serialized PHP array | Active downloads (name, size, %, PID) |
| `download_queue.json` | JSON | Parallel chunk metadata |
| `activity.log` | JSON lines | Activity log (INFO/DOWNLOAD/ERROR etc.) |

**Locking:** File operations use `flock()`. Beware race conditions on `files.lst` under high concurrency — this is a known limitation.

### User Token & Ownership

- On first visit, a 32-char MD5 hex token is set in `rl_user_token` cookie (1 year, HttpOnly).
- Every file in `files.lst` records the owner token.
- Users see only their own files unless `show_all = true` in config.
- Admin panel bypasses ownership.

### Parallel Downloads

`classes/http.php` → `geturl()` splits downloads into up to 8 chunks (Range headers) using cURL multi-handle. Max 5 concurrent downloads. Metadata in `download_queue.json`. Resumable if server supports Accept-Ranges.

---

## Configuration

**`configs/config.php`** — All settings in `$options[]`:

| Key | Default | Purpose |
|---|---|---|
| `secretkey` | (set) | Blowfish key for credential encryption |
| `download_dir` | `files/` | Where files are saved |
| `delete_delay` | `84600` | Auto-delete after this many seconds (~23.5h) |
| `template_used` | `flavor` | UI theme |
| `admin_user` / `admin_pass` | `admin/admin` | **Change these!** |
| `ytdlp_binary` | `false` | Path to yt-dlp binary; `false` = auto-detect |
| `parallel_chunks` | `8` | Chunks per resumable download |
| `parallel_download` | `true` | Enable multi-chunk |
| `file_size_limit` | `102400` | Max file size in KB (100MB) |
| `forbidden_filetypes` | (list) | Blocked upload extensions |

**`configs/accounts.php`** — Premium credentials:
```php
$premium_acc["mega_co_nz"] = ['user' => 'email', 'pass' => 'pass'];
```

---

## Security Notes

- `.htaccess` blocks direct PHP access except whitelisted entry points
- Admin panel uses HTTP Basic Auth (`admin_user`/`admin_pass` in config)
- **Default credentials are `admin/admin` — must be changed in production**
- Credentials stored with Blowfish encryption (key in `secretkey`)
- Cookie token is HttpOnly but **not Secure** (no HTTPS enforcement in code)
- `shell_exec()` is used to call yt-dlp, ffmpeg, and rar — all args are escaped
- File uploads block dangerous extensions via `forbidden_filetypes`
- No CSRF tokens on forms — XSS-to-CSRF is a potential attack vector

---

## Common Tasks

### Add a new download plugin

1. Create `hosts/download/yoursitename.php` extending `DownloadClass`
2. Register the domain in `configs/site_checker.php`

### Update yt-dlp

Via admin panel → yt-dlp card → Update button, or:
```bash
sudo yt-dlp -U
# or replace binary:
sudo curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp
sudo chmod +x /usr/local/bin/yt-dlp
```

### Deploy / Update

```bash
cd /var/www/html
cp configs/accounts.php configs/accounts.php.bak
cp configs/config.php configs/config.php.bak
git fetch origin main && git reset --hard origin/main
cp configs/accounts.php.bak configs/accounts.php
cp configs/config.php configs/config.php.bak
chmod -R 777 files/ configs/
```

### Debug a download

1. Check `configs/activity.log` (JSON lines, searchable)
2. Check `configs/php_errors.log`
3. Enable verbose in yt-dlp plugin: add `--verbose` flag temporarily

---

## Templates

Switch via `configs/config.php` → `template_used`:
- `flavor` — Modern, dark/light toggle, CSS variables, Google Fonts (Inter), gradient brand
- `plugmod` — Classic legacy UI

Templates are in `templates/{name}/`. Each has: `header.php`, `main.php`, `transloadui.php`, `uploadui.php`, `footer.php`, `functions.php`, `sinfo.php`.

---

## Key Constants (set in `rl_init.php`)

| Constant | Value |
|---|---|
| `RAPIDLEECH` | `'yes'` — guards against direct file execution |
| `ROOT_DIR` | Absolute server path to project root |
| `PATH_SPLITTER` | `/` or `\` depending on OS |
| `HOST_DIR` | `'hosts/'` |
| `CLASS_DIR` | `'classes/'` |
| `CONFIG_DIR` | `'configs/'` |
| `DOWNLOAD_DIR` | Value of `$options['download_dir']` |
| `TEMPLATE_DIR` | `'templates/{template_used}/'` |
| `USER_TOKEN` | 32-char hex token for current user |
| `RL_VERSION` | `'2.0.2'` |

---

## i18n

Language files: `languages/{code}.php`. Default: `en`. Set via `$options['default_language']`.
Current languages: Arabic (ar), German (de), English (en), Spanish (es), Persian (fa), French (fr), Italian (it), Portuguese BR (pt_BR), Thai (th), Turkish (tr), Chinese Simplified (zh_CN), Chinese Traditional (zh_TW).

---

## Tested Plugins (2026)

Actively maintained and tested:
- **yt-dlp Universal** — YouTube, Vimeo, TikTok, Twitter/X, Instagram, Reddit, 1000+ sites
- **Mega.nz** — Premium account, download queue (max 1 concurrent)
- **Pornhub** — HLS stream, quality selector
- **Transfer.it** — Direct downloads
- **MediaFire** — Direct downloads

Other 50+ plugins may work but are not actively tested.

---

## Credits

- Maintained by [PBhadoo](https://github.com/PBhadoo)
- Built with [Claude Opus 4.6](https://www.anthropic.com/) by Anthropic
- Based on original [RapidLeech by Th3-822](https://github.com/Th3-822/rapidleech)
