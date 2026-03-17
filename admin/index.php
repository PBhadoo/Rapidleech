<?php
/**
 * RapidLeech Admin Panel
 * Simple admin interface for server management
 */

// Admin credentials from config.php (change in configs/config.php)
$rootDir = dirname(__DIR__);
$configDir = $rootDir . '/configs';
define('RAPIDLEECH', 'yes');
require_once($configDir . '/config.php');
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

// Helper: Get installed RAR version
function getInstalledRarVersion($rootDir) {
    $rarExec = $rootDir . '/rar/rar';
    if (!file_exists($rarExec)) {
        $rarExec = $rootDir . '/rar/unrar';
    }
    if (!file_exists($rarExec)) return 'Not installed';
    $out = @shell_exec(escapeshellarg($rarExec) . ' 2>&1 | head -1');
    if ($out && preg_match('/(?:UNRAR|RAR)\s+(\d+\.\d+)/', $out, $m)) {
        return $m[1];
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
            $message = "Cleared $count files from downloads folder.";
            $messageType = 'success';
            break;
            
        case 'save_accounts':
            $content = $_POST['accounts_content'] ?? '';
            if (@file_put_contents($accountsFile, $content)) {
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
                $cmd = "cd $rootDir && " . $cmd . " 2>&1";
                $output = shell_exec($cmd);
                $message = "Command executed.";
                $messageType = 'success';
            }
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
                $cmd = "cd $rootDir && git remote set-url origin $repoUrlEsc && git fetch origin $branchEsc && git reset --hard origin/$branchEsc && chmod -R 777 files/ configs/ 2>&1";
            } else {
                // Preserve configs
                $cmd = "cd $rootDir && cp configs/accounts.php configs/accounts.php.bak && cp configs/config.php configs/config.php.bak && git remote set-url origin $repoUrlEsc && git fetch origin $branchEsc && git reset --hard origin/$branchEsc && cp configs/accounts.php.bak configs/accounts.php && cp configs/config.php.bak configs/config.php && chmod -R 777 files/ configs/ 2>&1";
            }
            $output = shell_exec($cmd);
            $resetType = $fullReset ? 'Full reset (configs overwritten)' : 'Configs preserved';
            $message = "Git update completed. $resetType.";
            $messageType = 'success';
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
            $cmd = "cd $rootDir && rm -rf rar && wget -q '$url' && tar -xf '$tarball' && rm -f '$tarball' && chmod -R 777 rar 2>&1";
            $output = shell_exec($cmd);
            $newVer = getInstalledRarVersion($rootDir);
            $message = "RAR updated to version $newVer.";
            $messageType = 'success';
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

    <div style="text-align:center;padding:20px;color:#606880;font-size:12px">
        <a href="https://github.com/PBhadoo/Rapidleech" target="_blank" rel="noopener" style="color:#818cf8;text-decoration:none;font-weight:700;">RapidLeech</a> v2.0.1 • Admin Panel • PHP <?php echo PHP_VERSION; ?> • <?php echo PHP_OS; ?>
        <br>Built with <a href="https://www.anthropic.com/" target="_blank" rel="noopener" style="color:#818cf8;text-decoration:none;">Claude Opus 4.6</a> by <a href="https://www.anthropic.com/" target="_blank" rel="noopener" style="color:#818cf8;text-decoration:none;">Anthropic</a>
        <br>&copy; <?php echo date('Y'); ?> <a href="https://github.com/PBhadoo/Rapidleech" target="_blank" rel="noopener" style="color:#818cf8;text-decoration:none;">PBhadoo</a>. All rights reserved.
    </div>
</div>
</body>
</html>
