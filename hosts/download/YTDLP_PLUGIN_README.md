# yt-dlp Universal Plugin for Rapidleech

A fully integrated Rapidleech host plugin that uses the **yt-dlp** command-line tool to download media from hundreds of supported websites directly to your Rapidleech server.

## Features

- ✅ Downloads from **1000+ sites** supported by yt-dlp (Vimeo, TikTok, Twitter/X, Instagram, Reddit, SoundCloud, Twitch, and many more)
- ✅ **Format/quality selector** — shows all available formats with file sizes before downloading
- ✅ **Best quality auto-merge** — merges best video + audio streams into MP4 automatically
- ✅ **Security hardened** — all user input escaped with `escapeshellarg()` to prevent command injection
- ✅ **Error handling** — clean error messages with collapsible debug output
- ✅ **File tracking** — downloaded files are registered in Rapidleech's file list
- ✅ **Cross-platform** — works on Linux and Windows servers

## Requirements

| Requirement | Details |
|---|---|
| **yt-dlp** | Binary installed on the server ([github.com/yt-dlp/yt-dlp](https://github.com/yt-dlp/yt-dlp)) |
| **PHP exec()** | Must NOT be in `disable_functions` in `php.ini` |
| **ffmpeg** | Recommended for merging best video+audio streams (optional but strongly recommended) |

## Installation

### Step 1: Install yt-dlp on your server

**Linux (recommended):**
```bash
# Option A: Install via pip
pip install yt-dlp

# Option B: Download binary directly
sudo curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp
sudo chmod a+rx /usr/local/bin/yt-dlp
```

**Windows:**
```
Download yt-dlp.exe from: https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe
Place it in the Rapidleech root directory (next to index.php)
```

Verify installation:
```bash
yt-dlp --version
# Should output something like: 2026.03.17
```

### Step 2: Install ffmpeg (recommended)

**Linux:**
```bash
sudo apt install ffmpeg    # Debian/Ubuntu
sudo yum install ffmpeg    # CentOS/RHEL
```

**Windows:** Download from [ffmpeg.org](https://ffmpeg.org/download.html) and add to PATH.

### Step 3: Place the plugin file

The plugin file should be at:
```
hosts/download/ytdlp_universal.php
```

This is already done if you're reading this from the repository.

### Step 4: Configure the binary path (optional)

Edit `configs/config.php` and set the `ytdlp_binary` option:

```php
// Linux server — default path, usually no change needed
'ytdlp_binary' => '/usr/local/bin/yt-dlp',

// Windows server — point to the .exe
'ytdlp_binary' => 'C:\\path\\to\\yt-dlp.exe',

// Auto-detect (default) — set to false
'ytdlp_binary' => false,
```

**Auto-detection behaviour:**
- **Linux:** Looks for `/usr/local/bin/yt-dlp`
- **Windows:** Looks for `yt-dlp.exe` in the Rapidleech root directory, then falls back to PATH

### Step 5: Ensure PHP exec() is enabled

Check your `php.ini`:
```ini
; Make sure exec is NOT listed here:
disable_functions = 
```

Restart your web server after changes.

## Supported Domains

The plugin pre-registers the following popular domains so Rapidleech automatically routes them to yt-dlp:

| Category | Sites |
|---|---|
| **Video** | Vimeo, Twitch, TikTok, Instagram, Twitter/X, Reddit, Streamable, BitChute, Rumble, Odysee, Bilibili, NicoVideo, Crunchyroll |
| **Music** | SoundCloud, Bandcamp, Mixcloud |
| **News/Media** | CNN, BBC, CBS News, Washington Post, NY Times, The Guardian |
| **Education** | TED, Udemy, Coursera |
| **Other** | Archive.org, Veoh, Metacafe, 9GAG, PeerTube, and more |

### Adding more domains

To add more domains, edit `hosts/download/hosts.php` and add them to the `$ytdlp_domains` array in the `case 'ytdlp.universal':` block:

```php
$ytdlp_domains = array(
    // ... existing domains ...
    'newsite.com', 'www.newsite.com',  // Add new ones here
);
```

> **Note:** yt-dlp supports 1000+ sites. Even if a domain isn't pre-registered, you can still use it — just add it to the list above. See the full list: [yt-dlp supported sites](https://github.com/yt-dlp/yt-dlp/blob/master/supportedsites.md)

## Usage

1. Open Rapidleech in your browser
2. Paste a supported URL (e.g., `https://vimeo.com/123456789`)
3. Click **Transload**
4. The format selector will appear showing all available qualities
5. Click **Best Quality** (recommended) or select a specific format
6. Wait for the download to complete
7. The file appears in your Rapidleech file list

## How It Works

1. **URL routing:** Rapidleech's `hosts.php` matches the domain → routes to `ytdlp_universal.php`
2. **Format query:** The plugin runs `yt-dlp --dump-json --no-download <url>` to get all available formats
3. **Format selection:** User picks a quality from the web UI
4. **Download:** Plugin runs `yt-dlp -f <format> -o <output_template> <url>` with full escaping
5. **Registration:** The downloaded file is verified on disk and registered in `configs/files.lst`

## Troubleshooting

| Problem | Solution |
|---|---|
| "Cannot execute yt-dlp binary" | Check binary path in config, verify `yt-dlp --version` works from command line |
| "exec() is disabled" | Remove `exec` from `disable_functions` in `php.ini`, restart web server |
| Format selector is empty | yt-dlp may not support this URL, or the site blocks server IPs |
| Download starts but file not found | Check `files/` directory permissions (`chmod 777 files/`) |
| Merge fails / audio missing | Install ffmpeg on the server |
| "ERROR: Sign in to confirm" | Some videos require authentication; this is a yt-dlp limitation |

## Security Notes

- All user-provided URLs are sanitized with `escapeshellarg()` before passing to the shell
- The plugin only accepts `http://` and `https://` URL schemes
- Format IDs are sanitized to alphanumeric characters only
- No user input is ever passed unsanitized to shell commands

## Files

| File | Purpose |
|---|---|
| `hosts/download/ytdlp_universal.php` | Main plugin code |
| `hosts/download/hosts.php` | Domain → plugin routing (modified) |
| `configs/config.php` | `ytdlp_binary` option (added) |
| `yt-dlp.exe` | Windows binary for local testing (not for production Linux) |
