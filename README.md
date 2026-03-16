### RapidLeech

Build and Edited from https://github.com/Th3-822/rapidleech

**Live Server:** [https://hashhackers.apranet.eu.org](https://hashhackers.apranet.eu.org)

#### Quick Install (Ubuntu 22.04 / 24.04)

```bash
bash <(curl -s https://raw.githubusercontent.com/PBhadoo/Rapidleech/main/rapidleech.sh)
```

This installs PHP 8.3, Apache2, all required extensions, and optionally sets up SSL.

#### Requirements

| Requirement | Details |
|---|---|
| **OS** | Ubuntu 22.04 or 24.04 LTS |
| **PHP** | 8.3+ (8.1+ minimum) |
| **Web Server** | Apache2 with mod_rewrite |
| **PHP Extensions** | curl, openssl, mbstring, bcmath, gd, xml, zip, intl |

> **Important:** `php-bcmath` is required for Mega.nz premium account login (RSA key decryption). Without it, Mega downloads fall back to anonymous mode with strict quota limits.

#### PHP Extensions Install (if missing)

```bash
# Replace 8.3 with your PHP version
sudo apt install php8.3-bcmath php8.3-curl php8.3-openssl php8.3-mbstring -y
sudo systemctl restart apache2
```

#### Premium Accounts

Edit `configs/accounts.php` to add premium credentials for file hosting services:

```php
$premium_acc["mega_co_nz"] = array('user' => 'email@example.com', 'pass' => 'password');
$premium_acc["rapidgator_net"] = array('user' => 'username', 'pass' => 'password');
```

Supported premium services: Mega.nz, 1Fichier, 4Shared, Alfafile, FileFactory, Filejoker, Keep2Share, Mediafire, Nitroflare, Rapidgator, Turbobit, and more.

#### Admin Panel

Access at `/admin` (default credentials: admin/admin — change in `admin/index.php`).

Features: Server status, clear all files, edit premium accounts, one-click GitHub update, shell command runner.

#### Features

- 🎨 **Two Templates** — "Flavor" (modern dark/light) and "PlugMod" (classic)
- 🔌 **60 Active Plugins** — Mega.nz, Google Drive, MediaFire, Rapidgator, and more
- 🔐 **File Ownership** — Cookie-based isolation, users only see their own files
- 📊 **Download Tracking** — Real-time progress, pending downloads tab
- ⚡ **Auto Transload** — Batch download multiple links
- 🧹 **Auto Cleanup** — Configurable auto-delete timer + 99% storage failsafe
- 🛡️ **Mega Queue** — Only 1 Mega download at a time to prevent account abuse

#### Templates

Switch templates in `configs/config.php`:
```php
'template_used' => 'flavor',   // Modern UI (default)
'template_used' => 'plugmod',  // Classic UI
```

#### Update Existing Installation

```bash
cd /var/www/html
cp configs/accounts.php configs/accounts.php.bak
cp configs/config.php configs/config.php.bak
git fetch origin main && git reset --hard origin/main
cp configs/accounts.php.bak configs/accounts.php
cp configs/config.php.bak configs/config.php
rm -f files/mega_dl.php
chmod -R 777 files/ configs/
```

Or use the Admin Panel at `/admin` → "Update from GitHub" button.

### Make pull requests for changes or fixes.
