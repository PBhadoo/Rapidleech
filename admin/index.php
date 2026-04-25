<?php
/**
 * RapidLeech Admin Panel
 * Simple admin interface for server management
 */

// Admin credentials from config.php (change in configs/config.php)
$rootDir = dirname(__DIR__);
$configDir = $rootDir . '/configs';
define('RAPIDLEECH', 'yes');
define('CONFIG_DIR', $configDir . '/');
define('CLASS_DIR', $rootDir . '/classes/');
require_once($configDir . '/config.php');
require_once($rootDir . '/classes/logger.php');
$ADMIN_USER = isset($options['admin_user']) ? $options['admin_user'] : 'admin';
$ADMIN_PASS = isset($options['admin_pass']) ? $options['admin_pass'] : 'admin';

// Basic auth
if (empty($_SERVER['PHP_AUTH_USER']) || $_SERVER['PHP_AUTH_USER'] !== $ADMIN_USER || $_SERVER['PHP_AUTH_PW'] !== $ADMIN_PASS) {
    header('WWW-Authenticate: Basic realm="RapidLeech Admin"');
    header('HTTP/1.0 401 Unauthorized');
    die('Access Denied');
}

$filesDir = $rootDir . '/files';
$accountsFile = $configDir . '/accounts.php';
$configFile = $configDir . '/config.php';

// Helper: Get installed yt-dlp version
function getInstalledYtdlpVersion() {
    $paths = array('/usr/local/bin/yt-dlp', '/usr/bin/yt-dlp');
    // Also check project root
    $rootDir = dirname(__DIR__);
    $paths[] = $rootDir . '/yt-dlp.exe';
    $paths[] = $rootDir . '/yt-dlp';
    
    foreach ($paths as $p) {
        if (file_exists($p)) {
            $out = @shell_exec(escapeshellarg($p) . ' --version 2>&1');
            if ($out && preg_match('/^\d{4}\.\d{2}\.\d{2}/', trim($out))) {
                return array('version' => trim($out), 'path' => $p);
            }
        }
    }
    // Try just 'yt-dlp' in PATH
    $out = @shell_exec('yt-dlp --version 2>&1');
    if ($out && preg_match('/^\d{4}\.\d{2}\.\d{2}/', trim($out))) {
        return array('version' => trim($out), 'path' => 'yt-dlp (PATH)');
    }
    return array('version' => 'Not installed', 'path' => '');
}

// Helper: Get latest yt-dlp version from GitHub
function getLatestYtdlpVersion() {
    $ctx = stream_context_create(['http' => ['timeout' => 10, 'user_agent' => 'Mozilla/5.0', 'follow_location' => 0]]);
    // GitHub API for latest release
    $json = @file_get_contents('https://api.github.com/repos/yt-dlp/yt-dlp/releases/latest', false, $ctx);
    if ($json) {
        $data = @json_decode($json, true);
        if (!empty($data['tag_name'])) return $data['tag_name'];
    }
    return false;
}

// Helper: Get installed RAR version
function getInstalledRarVersion($rootDir) {
    $rarExec = $rootDir . '/rar/rar';
    if (!file_exists($rarExec)) {
        $rarExec = $rootDir . '/rar/unrar';
    }
    if (!file_exists($rarExec)) return 'Not installed';
    $out = @shell_exec(escapeshellarg($rarExec) . ' 2>&1');
    if ($out) {
        // Try multiple patterns: "RAR 7.20", "UNRAR 7.20", "rar 7.20", version lines
        if (preg_match('/(?:UNRAR|RAR)\s+(\d+\.\d+)/i', $out, $m)) return $m[1];
        if (preg_match('/(\d+\.\d+)\s+(?:beta|freeware|trial)/i', $out, $m)) return $m[1];
        if (preg_match('/version\s+(\d+\.\d+)/i', $out, $m)) return $m[1];
    }
    return 'Unknown';
}

// Helper: Get latest RAR version from rarlab.com
function getLatestRarVersion() {
    $ctx = stream_context_create(['http' => ['timeout' => 10, 'user_agent' => 'Mozilla/5.0']]);
    $page = @file_get_contents('https://www.rarlab.com/download.htm', false, $ctx);
    if ($page && preg_match('/rarlinux-x64-(\d+)\.tar\.gz/', $page, $m)) {
        $ver = $m[1];
        // Convert 720 -> 7.20
        return substr($ver, 0, 1) . '.' . substr($ver, 1);
    }
    return false;
}

// AJAX endpoint: check latest RAR version (return early before HTML)
if (isset($_GET['check_rar'])) {
    header('Content-Type: text/plain');
    $ver = getLatestRarVersion();
    echo $ver ? $ver : 'error';
    exit;
}

// AJAX endpoint: check latest yt-dlp version
if (isset($_GET['check_ytdlp'])) {
    header('Content-Type: text/plain');
    $ver = getLatestYtdlpVersion();
    echo $ver ? $ver : 'error';
    exit;
}

// Resolve download directory path (works for both relative and absolute config values)
function admin_dl_dir($rootDir, $options) {
    $dir = isset($options['download_dir']) ? $options['download_dir'] : 'files/';
    if (substr($dir, 0, 1) !== '/') $dir = $rootDir . '/' . $dir;
    return rtrim($dir, '/') . '/';
}

// AJAX: get active downloads + mega lock status
if (isset($_GET['get_pending'])) {
    header('Content-Type: application/json');
    $result = array('downloads' => array(), 'mega_lock' => null, 'queue' => array());

    // Active downloads from downloads.lst
    $dlsFile = $configDir . '/downloads.lst';
    $dlContent = @file_get_contents($dlsFile);
    if ($dlContent) {
        $dls = @unserialize($dlContent);
        if (is_array($dls)) {
            $now = time();
            foreach ($dls as $id => $dl) {
                if (($now - $dl['last_update']) > 120) continue;
                $result['downloads'][] = array(
                    'id' => $id,
                    'filename' => $dl['filename'],
                    'pid' => $dl['pid'],
                    'percent' => $dl['percent'],
                    'status' => $dl['status'],
                    'elapsed' => $now - $dl['start_time'],
                );
            }
        }
    }

    // Mega lock
    $dlDir = admin_dl_dir($rootDir, $options);
    $megaLock = $dlDir . '.mega_lock';
    if (file_exists($megaLock)) {
        $ld = @json_decode(@file_get_contents($megaLock), true);
        $startT = !empty($ld['start_time']) ? $ld['start_time'] : (!empty($ld['time']) ? $ld['time'] : time());
        $result['mega_lock'] = array(
            'pid' => $ld['pid'] ?? 0,
            'link' => $ld['link'] ?? 'unknown',
            'elapsed' => time() - $startT,
        );
    }

    // Chunk downloads in progress (files/.chunk_*.meta)
    if (is_dir($dlDir)) {
        foreach (scandir($dlDir) as $f) {
            if (preg_match('/^\.chunk_[a-f0-9]+\.meta$/', $f)) {
                $meta = @json_decode(@file_get_contents($dlDir . $f), true);
                if ($meta && isset($meta['filename'])) {
                    $result['queue'][] = array(
                        'filename' => $meta['filename'],
                        'status' => $meta['status'] ?? 'downloading',
                        'filesize' => $meta['filesize'] ?? 0,
                    );
                }
            }
        }
    }

    echo json_encode($result);
    exit;
}

// AJAX: clear mega lock
if (isset($_GET['clear_mega_lock'])) {
    header('Content-Type: application/json');
    $megaLock = admin_dl_dir($rootDir, $options) . '.mega_lock';
    if (file_exists($megaLock)) {
        @unlink($megaLock);
        echo json_encode(array('success' => true));
    } else {
        echo json_encode(array('success' => false, 'error' => 'Lock file not found'));
    }
    exit;
}

// AJAX: kill download by PID
if (isset($_GET['kill_pid'])) {
    header('Content-Type: application/json');
    $pid = intval($_GET['kill_pid']);
    if ($pid > 1) {
        $isWin = strtoupper(substr(PHP_OS, 0, 3)) === 'WIN';
        if ($isWin) {
            $out = @shell_exec('taskkill /PID ' . $pid . ' /F 2>&1');
        } else {
            $out = @shell_exec('kill -9 ' . $pid . ' 2>&1');
        }
        // Remove from downloads.lst
        $dlsFile = $configDir . '/downloads.lst';
        $dlContent = @file_get_contents($dlsFile);
        if ($dlContent) {
            $dls = @unserialize($dlContent);
            if (is_array($dls)) {
                foreach ($dls as $id => $dl) {
                    if ($dl['pid'] == $pid) unset($dls[$id]);
                }
                @file_put_contents($dlsFile, serialize($dls), LOCK_EX);
            }
        }
        // Also release mega lock if PID matches
        $megaLock = admin_dl_dir($rootDir, $options) . '.mega_lock';
        if (file_exists($megaLock)) {
            $ld = @json_decode(@file_get_contents($megaLock), true);
            if ($ld && ($ld['pid'] ?? 0) == $pid) @unlink($megaLock);
        }
        rl_log_admin('Kill download', "PID $pid killed");
        echo json_encode(array('success' => true, 'output' => $out));
    } else {
        echo json_encode(array('success' => false, 'error' => 'Invalid PID'));
    }
    exit;
}

$message = '';
$messageType = '';

// Handle actions
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $action = $_POST['action'] ?? '';
    
    switch ($action) {
        case 'clear_files':
            $count = 0;
            if (is_dir($filesDir)) {
                $files = new RecursiveIteratorIterator(
                    new RecursiveDirectoryIterator($filesDir, RecursiveDirectoryIterator::SKIP_DOTS),
                    RecursiveIteratorIterator::CHILD_FIRST
                );
                foreach ($files as $f) {
                    if (basename($f) === 'index.html' || basename($f) === '.htaccess') continue;
                    if ($f->isDir()) @rmdir($f->getRealPath());
                    else { @unlink($f->getRealPath()); $count++; }
                }
                @file_put_contents($configDir . '/files.lst', '');
                @unlink($filesDir . '/.mega_lock');
                @unlink($filesDir . '/mega_dl.php');
            }
            rl_log_admin('Clear all files', "$count files deleted");
            $message = "Cleared $count files from downloads folder.";
            $messageType = 'success';
            break;
            
        case 'save_accounts':
            $content = $_POST['accounts_content'] ?? '';
            if (@file_put_contents($accountsFile, $content)) {
                rl_log_admin('Save accounts', 'Premium accounts updated');
                $message = 'Premium accounts saved successfully.';
                $messageType = 'success';
            } else {
                $message = 'Failed to save accounts file. Check permissions.';
                $messageType = 'error';
            }
            break;

        case 'save_config':
            $content = $_POST['config_content'] ?? '';
            if (@file_put_contents($configFile, $content)) {
                rl_log_admin('Save config', 'Configuration updated');
                $message = 'Configuration saved successfully. Reload the page to apply changes.';
                $messageType = 'success';
            } else {
                $message = 'Failed to save config file. Check permissions.';
                $messageType = 'error';
            }
            break;
            
        case 'run_command':
            $cmd = $_POST['command'] ?? '';
            if (!empty($cmd)) {
                rl_log_admin('Shell command', $cmd);
                $cmd = "cd $rootDir && " . $cmd . " 2>&1";
                $output = shell_exec($cmd);
                $message = "Command executed.";
                $messageType = 'success';
            }
            break;

        case 'clear_logs':
            rl_log_clear();
            $message = 'Activity logs cleared.';
            $messageType = 'success';
            break;

        case 'git_update':
            $repoUrl = trim($_POST['repo_url'] ?? 'https://github.com/PBhadoo/Rapidleech');
            $branch = trim($_POST['repo_branch'] ?? 'main');
            $fullReset = !empty($_POST['full_reset']);
            if (!preg_match('/^https:\/\/[a-zA-Z0-9._\-\/]+$/', $repoUrl)) {
                $message = 'Invalid repository URL.';
                $messageType = 'error';
                break;
            }
            if (!preg_match('/^[a-zA-Z0-9._\-\/]+$/', $branch)) {
                $message = 'Invalid branch name.';
                $messageType = 'error';
                break;
            }
            $repoUrlEsc = escapeshellarg($repoUrl);
            $branchEsc = escapeshellarg($branch);
            if ($fullReset) {
                // Full reset: overwrite everything including configs
                $cmd = "cd $rootDir && git remote set-url origin $repoUrlEsc && git fetch origin $branchEsc && git reset --hard origin/$branchEsc && chmod -R 777 files/ configs/ rar/ 2>&1";
            } else {
                // Preserve configs
                $cmd = "cd $rootDir && cp configs/accounts.php configs/accounts.php.bak && cp configs/config.php configs/config.php.bak && git remote set-url origin $repoUrlEsc && git fetch origin $branchEsc && git reset --hard origin/$branchEsc && cp configs/accounts.php.bak configs/accounts.php && cp configs/config.php.bak configs/config.php && chmod -R 777 files/ configs/ rar/ 2>&1";
            }
            $output = shell_exec($cmd);
            $resetType = $fullReset ? 'Full reset (configs overwritten)' : 'Configs preserved';
            $message = "Git update completed. $resetType.";
            $messageType = 'success';
            break;

        case 'install_deno':
            $isWindows = strtoupper(substr(PHP_OS, 0, 3)) === 'WIN';
            if ($isWindows) {
                $message = 'Deno auto-install is only supported on Linux. Install manually from https://deno.land';
                $messageType = 'error';
            } else {
                $canSudo = (trim(@shell_exec('sudo -n true 2>&1; echo $?')) === '0');
                if ($canSudo) {
                    $cmd = "curl -fsSL https://deno.land/install.sh | sh 2>&1 && sudo cp \$HOME/.deno/bin/deno /usr/local/bin/deno 2>&1 && sudo chmod a+rx /usr/local/bin/deno && echo 'Deno installed:' && deno --version 2>&1";
                } else {
                    $cmd = "curl -fsSL https://deno.land/install.sh | sh 2>&1 && echo 'Deno installed:' && \$HOME/.deno/bin/deno --version 2>&1";
                }
                $output = shell_exec($cmd);
                $denoVer = trim(@shell_exec('deno --version 2>&1 | head -1'));
                if (strpos($denoVer, 'deno') !== false) {
                    rl_log_admin('Install Deno', $denoVer);
                    $message = "Deno installed successfully: $denoVer";
                    $messageType = 'success';
                } else {
                    $message = "Deno installation may have failed. Check output below.";
                    $messageType = 'error';
                }
            }
            break;

        case 'save_ytdlp_cookies':
            $cookies = $_POST['ytdlp_cookies_content'] ?? '';
            $cookiePath = $rootDir . '/configs/ytdlp_cookies.txt';
            if ($cookies === '' || trim($cookies) === '') {
                // Clear cookies
                @unlink($cookiePath);
                rl_log_admin('yt-dlp cookies', 'Cookies cleared');
                $message = 'yt-dlp cookies cleared.';
                $messageType = 'success';
            } else {
                if (@file_put_contents($cookiePath, $cookies)) {
                    @chmod($cookiePath, 0644);
                    rl_log_admin('yt-dlp cookies', 'Cookies saved (' . strlen($cookies) . ' bytes)');
                    $message = 'yt-dlp cookies saved successfully. Login-required videos should now work.';
                    $messageType = 'success';
                } else {
                    $message = 'Failed to save cookies file. Check configs/ directory permissions.';
                    $messageType = 'error';
                }
            }
            break;

        case 'update_ytdlp':
            $ytdlpInfo = getInstalledYtdlpVersion();
            $isWindows = strtoupper(substr(PHP_OS, 0, 3)) === 'WIN';
            if ($isWindows) {
                $binPath = $rootDir . DIRECTORY_SEPARATOR . 'yt-dlp.exe';
                $downloadUrl = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe';
                $cmd = "echo Downloading yt-dlp.exe... && curl -L -o " . escapeshellarg($binPath) . " " . escapeshellarg($downloadUrl) . " 2>&1 && echo Done.";
            } else {
                // Try /usr/local/bin first (if writable or sudo works without password), else fall back to project root
                $systemPath = '/usr/local/bin/yt-dlp';
                $localPath = $rootDir . '/yt-dlp';
                $downloadUrl = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp';
                // Test if we can write to /usr/local/bin (sudo NOPASSWD or running as root)
                $canSudo = (trim(@shell_exec('sudo -n true 2>&1; echo $?')) === '0');
                if ($canSudo) {
                    $binPath = $systemPath;
                    $cmd = "echo 'Downloading yt-dlp to $binPath...' && sudo curl -L '$downloadUrl' -o '$binPath' 2>&1 && sudo chmod a+rx '$binPath' && echo 'Installed:' && $binPath --version 2>&1";
                } else {
                    $binPath = $localPath;
                    $cmd = "echo 'Downloading yt-dlp to $binPath (no sudo)...' && curl -L '$downloadUrl' -o '$binPath' 2>&1 && chmod +x '$binPath' && echo 'Installed:' && $binPath --version 2>&1";
                }
            }
            $output = shell_exec($cmd);
            $newInfo = getInstalledYtdlpVersion();
            if ($newInfo['version'] === 'Not installed') {
                $message = "yt-dlp update may have failed. Check output below.";
                $messageType = 'error';
            } else {
                rl_log_admin('Update yt-dlp', 'Updated to ' . $newInfo['version']);
                $message = "yt-dlp updated to version " . $newInfo['version'] . ".";
                $messageType = 'success';
            }
            break;

        case 'update_rar':
            $latestVer = getLatestRarVersion();
            if (!$latestVer) {
                $message = 'Could not fetch latest RAR version from rarlab.com.';
                $messageType = 'error';
                break;
            }
            $verNum = str_replace('.', '', $latestVer);
            $tarball = "rarlinux-x64-{$verNum}.tar.gz";
            $url = "https://www.rarlab.com/rar/$tarball";
            // Use absolute paths; show all errors
            $cmd = "cd $rootDir && echo 'Removing old rar...' && rm -rf $rootDir/rar 2>&1 && echo 'Downloading $tarball...' && wget -O $rootDir/$tarball '$url' 2>&1 && echo 'Extracting...' && tar -xf $rootDir/$tarball -C $rootDir 2>&1 && rm -f $rootDir/$tarball && chmod -R 777 $rootDir/rar && chmod +x $rootDir/rar/rar $rootDir/rar/unrar 2>/dev/null && echo 'RAR binary info:' && $rootDir/rar/rar 2>&1 | head -3";
            $output = shell_exec($cmd);
            $newVer = getInstalledRarVersion($rootDir);
            if ($newVer === 'Unknown' || $newVer === 'Not installed') {
                $message = "RAR update may have failed. Check output below.";
                $messageType = 'error';
            } else {
                $message = "RAR updated to version $newVer.";
                $messageType = 'success';
            }
            break;
    }
}

// Get file stats
$fileCount = 0; $totalSize = 0;
if (is_dir($filesDir)) {
    foreach (new DirectoryIterator($filesDir) as $f) {
        if ($f->isDot() || $f->getFilename() === 'index.html' || $f->getFilename() === '.htaccess') continue;
        if ($f->isFile()) { $fileCount++; $totalSize += $f->getSize(); }
    }
}

// Get accounts content
$accountsContent = @file_get_contents($accountsFile) ?: '';
// Get config content
$configContent = @file_get_contents($configFile) ?: '';

// Get disk info
$diskFree = @disk_free_space($filesDir);
$diskTotal = @disk_total_space($filesDir);
$diskUsedPercent = ($diskTotal > 0) ? round(($diskTotal - $diskFree) / $diskTotal * 100, 1) : 0;

// Get RAR info
$installedRar = getInstalledRarVersion($rootDir);

function formatBytes($b) { if ($b <= 0) return '0 B'; $s = ['B','KB','MB','GB','TB']; $e = floor(log($b)/log(1024)); return round($b/pow(1024,$e),2).' '.$s[$e]; }
?>
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>RapidLeech Admin</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Inter',-apple-system,sans-serif;background:#0c0e16;color:#e8ecf4;min-height:100vh;padding:20px}
.wrap{max-width:900px;margin:0 auto}
h1{font-size:24px;margin-bottom:24px;display:flex;align-items:center;gap:10px}
h1 span{background:linear-gradient(135deg,#6366f1,#a855f7);-webkit-background-clip:text;-webkit-text-fill-color:transparent}
.card{background:#161924;border:1px solid #282d3e;border-radius:16px;padding:24px;margin-bottom:20px}
.card h2{font-size:18px;margin-bottom:16px;color:#818cf8}
.card h3{font-size:14px;color:#606880;margin-bottom:12px}
.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:20px}
.stat{background:#1e2231;padding:16px;border-radius:12px;text-align:center}
.stat-val{font-size:22px;font-weight:700;color:#818cf8}
.stat-label{font-size:12px;color:#606880;margin-top:4px}
.btn{display:inline-flex;align-items:center;gap:6px;padding:10px 20px;font:600 14px/1 inherit;border:0;border-radius:10px;cursor:pointer;transition:all .2s;color:#fff}
.btn-primary{background:linear-gradient(135deg,#6366f1,#a855f7)}
.btn-primary:hover{transform:translateY(-1px);box-shadow:0 4px 20px rgba(99,102,241,.3)}
.btn-danger{background:#ef4444}
.btn-danger:hover{background:#dc2626}
.btn-warning{background:#f59e0b}
.btn-warning:hover{background:#d97706}
.btn-ghost{background:#1e2231;border:1px solid #282d3e;color:#a0a8c0}
.btn-ghost:hover{background:#272c3e}
textarea{width:100%;padding:14px;font:13px/1.5 'Consolas','Monaco',monospace;background:#0c0e16;color:#e8ecf4;border:1.5px solid #282d3e;border-radius:10px;resize:vertical;outline:none}
textarea:focus{border-color:#6366f1}
input[type="text"]{width:100%;padding:10px 14px;font:14px inherit;background:#0c0e16;color:#e8ecf4;border:1.5px solid #282d3e;border-radius:10px;outline:none}
input[type="text"]:focus{border-color:#6366f1}
.msg{padding:12px 16px;border-radius:10px;margin-bottom:16px;font-size:14px}
.msg-success{background:rgba(16,185,129,.1);border:1px solid #10b981;color:#10b981}
.msg-error{background:rgba(239,68,68,.1);border:1px solid #ef4444;color:#ef4444}
.output{background:#0c0e16;border:1px solid #282d3e;border-radius:10px;padding:14px;font:12px/1.5 monospace;color:#a0a8c0;max-height:300px;overflow:auto;white-space:pre-wrap;margin-top:12px}
.flex{display:flex;gap:10px;flex-wrap:wrap;align-items:center}
.bar-track{height:8px;background:#282d3e;border-radius:4px;overflow:hidden;margin-top:8px}
.bar-fill{height:100%;background:linear-gradient(135deg,#6366f1,#a855f7);border-radius:4px}
a.back{color:#818cf8;text-decoration:none;font-size:13px}
a.back:hover{text-decoration:underline}
label.check{display:inline-flex;align-items:center;gap:6px;font-size:13px;color:#a0a8c0;cursor:pointer}
label.check input{accent-color:#6366f1}
.tag{display:inline-block;padding:3px 10px;border-radius:6px;font-size:12px;font-weight:600}
.tag-green{background:rgba(16,185,129,.15);color:#10b981}
.tag-yellow{background:rgba(245,158,11,.15);color:#f59e0b}
.tag-red{background:rgba(239,68,68,.15);color:#ef4444}
</style>
</head>
<body>
<div class="wrap">
    <h1>🛠️ <span>RapidLeech Admin</span></h1>
    <a class="back" href="/">← Back to RapidLeech</a>
    
    <?php if ($message): ?>
    <div class="msg msg-<?php echo $messageType; ?>" style="margin-top:16px"><?php echo htmlspecialchars($message); ?></div>
    <?php endif; ?>

    <!-- Stats -->
    <div class="card" style="margin-top:16px">
        <h2>📊 Server Status</h2>
        <div class="stats">
            <div class="stat">
                <div class="stat-val"><?php echo $fileCount; ?></div>
                <div class="stat-label">Downloaded Files</div>
            </div>
            <div class="stat">
                <div class="stat-val"><?php echo formatBytes($totalSize); ?></div>
                <div class="stat-label">Files Size</div>
            </div>
            <div class="stat">
                <div class="stat-val"><?php echo formatBytes($diskFree); ?></div>
                <div class="stat-label">Free Space</div>
            </div>
            <div class="stat">
                <div class="stat-val"><?php echo $diskUsedPercent; ?>%</div>
                <div class="stat-label">Disk Used</div>
            </div>
        </div>
        <div class="bar-track"><div class="bar-fill" style="width:<?php echo $diskUsedPercent; ?>%"></div></div>
    </div>

    <!-- Active Downloads -->
    <div class="card" id="active-downloads-card">
        <h2>⚡ Active Downloads <span id="active-count" style="font-size:13px;color:#606880;font-weight:400"></span>
            <button onclick="loadPending()" class="btn btn-ghost" style="padding:5px 12px;font-size:12px;float:right">↻ Refresh</button>
        </h2>
        <div id="pending-list">
            <div style="color:#606880;font-size:13px;text-align:center;padding:20px">Loading...</div>
        </div>
        <div id="mega-lock-section" style="display:none;margin-top:16px;padding-top:16px;border-top:1px solid #282d3e">
            <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap">
                <div>
                    <span style="color:#f59e0b;font-weight:600">🔒 Mega Lock Active</span>
                    <span id="mega-lock-info" style="color:#a0a8c0;font-size:13px;margin-left:8px"></span>
                </div>
                <button onclick="clearMegaLock()" class="btn btn-warning" style="padding:6px 14px;font-size:12px">🔓 Release Mega Lock</button>
            </div>
        </div>
    </div>

    <!-- Clear Files -->
    <div class="card">
        <h2>🗑️ Clear All Downloads</h2>
        <h3>Delete all files in the downloads folder and clear files.lst. This removes ALL users' files.</h3>
        <form method="POST" onsubmit="return confirm('Are you sure? This will delete ALL downloaded files.');">
            <input type="hidden" name="action" value="clear_files">
            <button type="submit" class="btn btn-danger">🗑️ Clear All Files (<?php echo $fileCount; ?> files, <?php echo formatBytes($totalSize); ?>)</button>
        </form>
    </div>

    <!-- Configuration -->
    <div class="card">
        <h2>⚙️ Configuration</h2>
        <h3>Edit configs/config.php — admin credentials, file size limits, forbidden types, and more</h3>
        <form method="POST">
            <input type="hidden" name="action" value="save_config">
            <textarea name="config_content" rows="25"><?php echo htmlspecialchars($configContent); ?></textarea>
            <br><br>
            <button type="submit" class="btn btn-primary">💾 Save Configuration</button>
        </form>
    </div>

    <!-- Premium Accounts -->
    <div class="card">
        <h2>🔑 Premium Accounts</h2>
        <h3>Edit configs/accounts.php directly</h3>
        <form method="POST">
            <input type="hidden" name="action" value="save_accounts">
            <textarea name="accounts_content" rows="20"><?php echo htmlspecialchars($accountsContent); ?></textarea>
            <br><br>
            <button type="submit" class="btn btn-primary">💾 Save Accounts</button>
        </form>
    </div>

    <!-- RAR Update -->
    <div class="card">
        <h2>📦 RAR / UnRAR</h2>
        <h3>Manage RAR binary for archive operations</h3>
        <div class="flex" style="margin-bottom:12px;align-items:center;gap:16px">
            <div>
                <span style="color:#606880;font-size:13px">Installed:</span>
                <span class="tag <?php echo ($installedRar === 'Not installed') ? 'tag-red' : 'tag-green'; ?>"><?php echo htmlspecialchars($installedRar); ?></span>
            </div>
            <div id="rar-latest">
                <span style="color:#606880;font-size:13px">Latest:</span>
                <span class="tag tag-yellow">Checking...</span>
            </div>
        </div>
        <form method="POST" onsubmit="return confirm('This will download and install the latest RAR from rarlab.com.');">
            <input type="hidden" name="action" value="update_rar">
            <button type="submit" class="btn btn-primary">📦 Update RAR to Latest</button>
        </form>
        <?php if (isset($output) && ($_POST['action'] ?? '') === 'update_rar'): ?>
        <div class="output"><?php echo htmlspecialchars($output); ?></div>
        <?php endif; ?>
        <script>
        // Fetch latest RAR version async
        fetch('?check_rar=1').then(r=>r.text()).then(v=>{
            if(v&&v!=='error'){document.querySelector('#rar-latest .tag').textContent=v;document.querySelector('#rar-latest .tag').className='tag tag-green';}
            else{document.querySelector('#rar-latest .tag').textContent='Could not check';document.querySelector('#rar-latest .tag').className='tag tag-yellow';}
        }).catch(()=>{document.querySelector('#rar-latest .tag').textContent='Error';document.querySelector('#rar-latest .tag').className='tag tag-red';});
        </script>
    </div>

    <!-- yt-dlp Update -->
    <?php $ytdlpInfo = getInstalledYtdlpVersion(); ?>
    <div class="card">
        <h2>📹 yt-dlp (Video Downloader)</h2>
        <h3>Download videos from YouTube, Vimeo, TikTok, Twitter/X, Instagram, and 1000+ sites</h3>
        <div class="flex" style="margin-bottom:12px;align-items:center;gap:16px">
            <div>
                <span style="color:#606880;font-size:13px">Installed:</span>
                <span class="tag <?php echo ($ytdlpInfo['version'] === 'Not installed') ? 'tag-red' : 'tag-green'; ?>"><?php echo htmlspecialchars($ytdlpInfo['version']); ?></span>
            </div>
            <div id="ytdlp-latest">
                <span style="color:#606880;font-size:13px">Latest:</span>
                <span class="tag tag-yellow">Checking...</span>
            </div>
            <?php if ($ytdlpInfo['path']): ?>
            <div>
                <span style="color:#606880;font-size:13px">Path:</span>
                <span style="color:#a0a8c0;font-size:12px;font-family:monospace"><?php echo htmlspecialchars($ytdlpInfo['path']); ?></span>
            </div>
            <?php endif; ?>
        </div>
        <form method="POST" onsubmit="return confirm('This will download the latest yt-dlp binary from GitHub.');">
            <input type="hidden" name="action" value="update_ytdlp">
            <button type="submit" class="btn btn-primary">📹 <?php echo ($ytdlpInfo['version'] === 'Not installed') ? 'Install' : 'Update'; ?> yt-dlp</button>
        </form>
        <?php if (isset($output) && ($_POST['action'] ?? '') === 'update_ytdlp'): ?>
        <div class="output"><?php echo htmlspecialchars($output); ?></div>
        <?php endif; ?>

        <!-- Deno Runtime (required for YouTube) -->
        <?php $denoVer = trim(@shell_exec('deno --version 2>&1 | head -1')); $hasDeno = (strpos($denoVer, 'deno') !== false); ?>
        <div style="margin-top:16px;padding-top:16px;border-top:1px solid #282d3e">
            <div class="flex" style="margin-bottom:10px;align-items:center;gap:12px">
                <span style="color:#606880;font-size:13px">⚡ Deno JS Runtime:</span>
                <span class="tag <?php echo $hasDeno ? 'tag-green' : 'tag-red'; ?>"><?php echo $hasDeno ? htmlspecialchars($denoVer) : 'Not installed'; ?></span>
                <?php if (!$hasDeno): ?>
                <span style="color:#ef4444;font-size:12px">⚠️ Required for YouTube downloads</span>
                <?php endif; ?>
            </div>
            <?php if (!$hasDeno): ?>
            <form method="POST" onsubmit="return confirm('This will install Deno JavaScript runtime from deno.land');" style="display:inline">
                <input type="hidden" name="action" value="install_deno">
                <button type="submit" class="btn btn-warning" style="font-size:13px;padding:8px 16px">⚡ Install Deno</button>
            </form>
            <?php endif; ?>
            <?php if (isset($output) && ($_POST['action'] ?? '') === 'install_deno'): ?>
            <div class="output"><?php echo htmlspecialchars($output); ?></div>
            <?php endif; ?>
            <p style="color:#606880;font-size:11px;margin-top:8px">yt-dlp requires Deno to solve YouTube's JavaScript challenges. Without it, only limited formats may be available.</p>
        </div>

        <script>
        fetch('?check_ytdlp=1').then(r=>r.text()).then(v=>{
            if(v&&v!=='error'){document.querySelector('#ytdlp-latest .tag').textContent=v;document.querySelector('#ytdlp-latest .tag').className='tag tag-green';}
            else{document.querySelector('#ytdlp-latest .tag').textContent='Could not check';document.querySelector('#ytdlp-latest .tag').className='tag tag-yellow';}
        }).catch(()=>{document.querySelector('#ytdlp-latest .tag').textContent='Error';document.querySelector('#ytdlp-latest .tag').className='tag tag-red';});
        </script>

        <!-- yt-dlp Cookies -->
        <?php
        $ytdlpCookiePath = $rootDir . '/configs/ytdlp_cookies.txt';
        $ytdlpCookiesContent = @file_get_contents($ytdlpCookiePath) ?: '';
        $hasCookies = !empty(trim($ytdlpCookiesContent));
        ?>
        <div style="margin-top:20px;padding-top:20px;border-top:1px solid #282d3e">
            <h3 style="color:#818cf8;font-size:15px;margin-bottom:8px">🍪 Browser Cookies (for login-required videos)</h3>
            <p style="color:#606880;font-size:13px;margin-bottom:12px">
                Some YouTube videos require login. Export cookies from your browser and paste them here.<br>
                <strong>How:</strong> Install <a href="https://chromewebstore.google.com/detail/get-cookiestxt-locally/cclelndahbckbenkjhflpdbgdldlbecc" target="_blank" style="color:#818cf8">Get cookies.txt LOCALLY</a> extension →
                Log into YouTube → Click extension → Export → Paste below.
            </p>
            <div style="margin-bottom:8px">
                <span style="color:#606880;font-size:13px">Status:</span>
                <span class="tag <?php echo $hasCookies ? 'tag-green' : 'tag-yellow'; ?>"><?php echo $hasCookies ? 'Cookies loaded (' . strlen($ytdlpCookiesContent) . ' bytes)' : 'No cookies set'; ?></span>
            </div>
            <form method="POST">
                <input type="hidden" name="action" value="save_ytdlp_cookies">
                <textarea name="ytdlp_cookies_content" rows="8" placeholder="# Netscape HTTP Cookie File&#10;# Paste your exported cookies.txt content here...&#10;.youtube.com&#9;TRUE&#9;/&#9;TRUE&#9;0&#9;cookie_name&#9;cookie_value"><?php echo htmlspecialchars($ytdlpCookiesContent); ?></textarea>
                <br><br>
                <div class="flex">
                    <button type="submit" class="btn btn-primary">🍪 Save Cookies</button>
                    <?php if ($hasCookies): ?>
                    <button type="submit" class="btn btn-danger" onclick="document.querySelector('textarea[name=ytdlp_cookies_content]').value='';return true;">🗑️ Clear Cookies</button>
                    <?php endif; ?>
                </div>
            </form>
        </div>
    </div>

    <!-- Git Update -->
    <div class="card">
        <h2>🔄 Update from GitHub</h2>
        <h3>Pulls latest code from a GitHub repo.</h3>
        <form method="POST" onsubmit="return confirm(document.getElementById('full_reset').checked ? 'FULL RESET: This will OVERWRITE config.php and accounts.php with repo defaults!' : 'This will update code. Your accounts and config will be preserved.');">
            <input type="hidden" name="action" value="git_update">
            <div style="display:grid;grid-template-columns:1fr auto;gap:10px;margin-bottom:12px">
                <div>
                    <label style="display:block;font-size:12px;color:#606880;margin-bottom:4px">Repository URL</label>
                    <input type="text" name="repo_url" placeholder="https://github.com/PBhadoo/Rapidleech" value="<?php echo htmlspecialchars($_POST['repo_url'] ?? 'https://github.com/PBhadoo/Rapidleech'); ?>">
                </div>
                <div style="min-width:120px">
                    <label style="display:block;font-size:12px;color:#606880;margin-bottom:4px">Branch</label>
                    <input type="text" name="repo_branch" placeholder="main" value="<?php echo htmlspecialchars($_POST['repo_branch'] ?? 'main'); ?>">
                </div>
            </div>
            <div class="flex" style="margin-bottom:12px">
                <label class="check"><input type="checkbox" name="full_reset" id="full_reset" value="1"> ⚠️ Full Reset (overwrite config.php & accounts.php)</label>
            </div>
            <div class="flex">
                <button type="submit" class="btn btn-primary">🔄 Update from GitHub</button>
            </div>
        </form>
        <?php if (isset($output) && ($_POST['action'] ?? '') === 'git_update'): ?>
        <div class="output"><?php echo htmlspecialchars($output); ?></div>
        <?php endif; ?>
    </div>

    <!-- Run Command -->
    <div class="card">
        <h2>⚡ Run Shell Command</h2>
        <h3>Execute a command on the server (runs from RapidLeech root directory)</h3>
        <form method="POST">
            <input type="hidden" name="action" value="run_command">
            <div class="flex" style="margin-bottom:12px">
                <input type="text" name="command" placeholder="ls -la files/" value="<?php echo htmlspecialchars($_POST['command'] ?? ''); ?>" style="flex:1">
                <button type="submit" class="btn btn-ghost">▶ Run</button>
            </div>
        </form>
        <?php if (isset($output) && ($_POST['action'] ?? '') === 'run_command'): ?>
        <div class="output"><?php echo htmlspecialchars($output); ?></div>
        <?php endif; ?>
    </div>

    <!-- Activity Logs -->
    <?php
    $logFilter = $_GET['log_filter'] ?? '';
    $logSearch = $_GET['log_search'] ?? '';
    $logEntries = rl_log_read(200, $logFilter, $logSearch);
    $logSize = rl_log_size();
    ?>
    <div class="card">
        <h2>📋 Activity Logs</h2>
        <h3>Download events, errors, and admin actions — Log size: <?php echo formatBytes($logSize); ?></h3>
        
        <!-- Filters -->
        <div class="flex" style="margin-bottom:16px;gap:8px">
            <a href="?log_filter=&log_search=<?php echo urlencode($logSearch); ?>" class="btn btn-ghost" style="padding:6px 14px;font-size:12px;<?php echo empty($logFilter) ? 'background:#6366f1;color:#fff;border-color:#6366f1;' : ''; ?>">All</a>
            <a href="?log_filter=DOWNLOAD&log_search=<?php echo urlencode($logSearch); ?>" class="btn btn-ghost" style="padding:6px 14px;font-size:12px;<?php echo $logFilter==='DOWNLOAD' ? 'background:#3b82f6;color:#fff;border-color:#3b82f6;' : ''; ?>">⬇ Downloads</a>
            <a href="?log_filter=COMPLETE&log_search=<?php echo urlencode($logSearch); ?>" class="btn btn-ghost" style="padding:6px 14px;font-size:12px;<?php echo $logFilter==='COMPLETE' ? 'background:#10b981;color:#fff;border-color:#10b981;' : ''; ?>">✅ Complete</a>
            <a href="?log_filter=ERROR&log_search=<?php echo urlencode($logSearch); ?>" class="btn btn-ghost" style="padding:6px 14px;font-size:12px;<?php echo $logFilter==='ERROR' ? 'background:#ef4444;color:#fff;border-color:#ef4444;' : ''; ?>">❌ Errors</a>
            <a href="?log_filter=ADMIN&log_search=<?php echo urlencode($logSearch); ?>" class="btn btn-ghost" style="padding:6px 14px;font-size:12px;<?php echo $logFilter==='ADMIN' ? 'background:#f59e0b;color:#fff;border-color:#f59e0b;' : ''; ?>">🔧 Admin</a>
            <form method="GET" style="display:flex;gap:6px;margin-left:auto;">
                <input type="hidden" name="log_filter" value="<?php echo htmlspecialchars($logFilter); ?>">
                <input type="text" name="log_search" placeholder="Search logs..." value="<?php echo htmlspecialchars($logSearch); ?>" style="width:180px;padding:6px 10px;font-size:12px">
                <button type="submit" class="btn btn-ghost" style="padding:6px 12px;font-size:12px">🔍</button>
            </form>
        </div>

        <!-- Log Table -->
        <div style="overflow-x:auto;max-height:500px;overflow-y:auto;border:1px solid #282d3e;border-radius:10px">
            <table style="width:100%;border-collapse:collapse;font-size:12px">
                <thead>
                    <tr style="background:#1e2231;position:sticky;top:0;z-index:1">
                        <th style="padding:10px 12px;text-align:left;color:#606880;font-weight:600;border-bottom:1px solid #282d3e;white-space:nowrap">Time</th>
                        <th style="padding:10px 12px;text-align:left;color:#606880;font-weight:600;border-bottom:1px solid #282d3e;width:80px">Level</th>
                        <th style="padding:10px 12px;text-align:left;color:#606880;font-weight:600;border-bottom:1px solid #282d3e">Message</th>
                        <th style="padding:10px 12px;text-align:left;color:#606880;font-weight:600;border-bottom:1px solid #282d3e;width:100px">IP</th>
                    </tr>
                </thead>
                <tbody>
                <?php if (empty($logEntries)): ?>
                    <tr><td colspan="4" style="padding:24px;text-align:center;color:#606880">No log entries found.</td></tr>
                <?php else: ?>
                    <?php foreach ($logEntries as $entry): ?>
                    <?php
                        $levelColors = array(
                            'DOWNLOAD' => '#3b82f6',
                            'COMPLETE' => '#10b981',
                            'ERROR' => '#ef4444',
                            'ADMIN' => '#f59e0b',
                            'SYSTEM' => '#8b5cf6',
                            'INFO' => '#606880',
                        );
                        $color = $levelColors[$entry['level']] ?? '#606880';
                        $contextStr = '';
                        if (!empty($entry['context'])) {
                            $parts = array();
                            foreach ($entry['context'] as $k => $v) {
                                if (!empty($v)) $parts[] = '<span style="color:#606880">' . htmlspecialchars($k) . ':</span> ' . htmlspecialchars(is_string($v) ? (strlen($v) > 120 ? substr($v, 0, 120) . '...' : $v) : json_encode($v));
                            }
                            $contextStr = implode(' &nbsp;·&nbsp; ', $parts);
                        }
                    ?>
                    <tr style="border-bottom:1px solid #1e2231">
                        <td style="padding:8px 12px;color:#a0a8c0;white-space:nowrap;vertical-align:top"><?php echo htmlspecialchars($entry['time']); ?></td>
                        <td style="padding:8px 12px;vertical-align:top"><span class="tag" style="background:<?php echo $color; ?>20;color:<?php echo $color; ?>"><?php echo htmlspecialchars($entry['level']); ?></span></td>
                        <td style="padding:8px 12px;color:#e8ecf4;vertical-align:top">
                            <div style="font-weight:500"><?php echo htmlspecialchars($entry['message']); ?></div>
                            <?php if ($contextStr): ?>
                            <div style="font-size:11px;margin-top:3px;color:#a0a8c0;word-break:break-all"><?php echo $contextStr; ?></div>
                            <?php endif; ?>
                        </td>
                        <td style="padding:8px 12px;color:#606880;white-space:nowrap;vertical-align:top;font-family:monospace"><?php echo htmlspecialchars($entry['ip']); ?></td>
                    </tr>
                    <?php endforeach; ?>
                <?php endif; ?>
                </tbody>
            </table>
        </div>

        <!-- Clear Logs -->
        <div style="margin-top:16px;display:flex;justify-content:space-between;align-items:center">
            <span style="color:#606880;font-size:12px"><?php echo count($logEntries); ?> entries shown (max 200)</span>
            <form method="POST" onsubmit="return confirm('Clear all activity logs?');" style="display:inline">
                <input type="hidden" name="action" value="clear_logs">
                <button type="submit" class="btn btn-danger" style="padding:6px 14px;font-size:12px">🗑️ Clear Logs</button>
            </form>
        </div>
    </div>

    <div style="text-align:center;padding:20px;color:#606880;font-size:12px">
        <a href="https://github.com/PBhadoo/Rapidleech" target="_blank" rel="noopener" style="color:#818cf8;text-decoration:none;font-weight:700;">RapidLeech</a> v2.0.2 • Admin Panel • PHP <?php echo PHP_VERSION; ?> • <?php echo PHP_OS; ?>
        <br>Built with <a href="https://www.anthropic.com/" target="_blank" rel="noopener" style="color:#818cf8;text-decoration:none;">Claude Opus 4.6</a> by <a href="https://www.anthropic.com/" target="_blank" rel="noopener" style="color:#818cf8;text-decoration:none;">Anthropic</a>
        <br>&copy; <?php echo date('Y'); ?> <a href="https://github.com/PBhadoo/Rapidleech" target="_blank" rel="noopener" style="color:#818cf8;text-decoration:none;">PBhadoo</a>. All rights reserved.
    </div>
</div>
<script>
function fmtSeconds(s){if(s<60)return s+'s';if(s<3600)return Math.floor(s/60)+'m '+Math.floor(s%60)+'s';return Math.floor(s/3600)+'h '+Math.floor((s%3600)/60)+'m';}
function fmtBytes(b){if(!b||b<=0)return '0 B';var s=['B','KB','MB','GB','TB'],e=Math.floor(Math.log(b)/Math.log(1024));return (b/Math.pow(1024,e)).toFixed(2)+' '+s[e];}

var _adminPath = window.location.pathname;
function loadPending(){
    fetch(_adminPath+'?get_pending=1').then(r=>r.json()).then(data=>{
        var list=document.getElementById('pending-list');
        var rows='';

        // downloads.lst entries
        if(data.downloads&&data.downloads.length>0){
            data.downloads.forEach(function(dl){
                rows+='<div style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid #1e2231;flex-wrap:wrap">';
                rows+='<div style="flex:1;min-width:200px">';
                rows+='<div style="font-weight:500;color:#e8ecf4">'+escHtml(dl.filename||'Unknown')+'</div>';
                rows+='<div style="font-size:12px;color:#606880;margin-top:2px">PID: '+dl.pid+' &nbsp;·&nbsp; Elapsed: '+fmtSeconds(dl.elapsed)+' &nbsp;·&nbsp; Status: '+escHtml(dl.status)+'</div>';
                if(dl.percent>0){rows+='<div style="height:4px;background:#282d3e;border-radius:2px;margin-top:6px"><div style="height:100%;width:'+dl.percent+'%;background:linear-gradient(135deg,#6366f1,#a855f7);border-radius:2px"></div></div>';}
                rows+='</div>';
                rows+='<button onclick="killPid('+dl.pid+')" class="btn btn-danger" style="padding:5px 12px;font-size:12px">✕ Cancel</button>';
                rows+='</div>';
            });
        }

        // Chunk/queue downloads
        if(data.queue&&data.queue.length>0){
            data.queue.forEach(function(q){
                rows+='<div style="padding:10px 0;border-bottom:1px solid #1e2231">';
                rows+='<div style="font-weight:500;color:#e8ecf4">'+escHtml(q.filename)+'</div>';
                rows+='<div style="font-size:12px;color:#606880;margin-top:2px">'+escHtml(q.status)+' &nbsp;·&nbsp; Size: '+fmtBytes(q.filesize)+'</div>';
                rows+='</div>';
            });
        }

        if(!rows){
            rows='<div style="color:#606880;font-size:13px;text-align:center;padding:20px">No active downloads.</div>';
        }
        list.innerHTML=rows;
        document.getElementById('active-count').textContent='('+(data.downloads.length+data.queue.length)+' active)';

        // Mega lock
        var lockSec=document.getElementById('mega-lock-section');
        if(data.mega_lock){
            lockSec.style.display='block';
            document.getElementById('mega-lock-info').textContent='PID: '+data.mega_lock.pid+' · '+escHtml(data.mega_lock.link)+'... · Running: '+fmtSeconds(data.mega_lock.elapsed);
        } else {
            lockSec.style.display='none';
        }
    }).catch(function(){
        document.getElementById('pending-list').innerHTML='<div style="color:#ef4444;font-size:13px;text-align:center;padding:20px">Error loading downloads.</div>';
    });
}

function killPid(pid){
    if(!confirm('Kill download process PID '+pid+'?')) return;
    fetch(_adminPath+'?kill_pid='+pid).then(r=>r.json()).then(function(d){
        if(d.success){loadPending();}else{alert('Failed: '+(d.error||'unknown error'));}
    });
}

function clearMegaLock(){
    if(!confirm('Release the Mega lock? Only do this if the download is stuck or crashed.')) return;
    fetch(_adminPath+'?clear_mega_lock=1').then(r=>r.json()).then(function(d){
        if(d.success){loadPending();}else{alert('Failed: '+(d.error||'unknown error'));}
    });
}

function escHtml(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}

// Load immediately and refresh every 5 seconds
loadPending();
setInterval(loadPending, 5000);
</script>
</body>
</html>
