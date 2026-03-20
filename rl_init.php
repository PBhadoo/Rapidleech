<?php

// This file must be included to work
if (count(get_included_files()) == 1) {
	require('deny.php');
	exit;
}

@set_time_limit(0);
@ini_set('memory_limit', '1024M');
if (ini_get('zlib.output_compression')) @ini_set('zlib.output_compression', 0);
if (ob_get_level()) ob_end_clean();
ob_implicit_flush(true);
header('X-Accel-Buffering: no');
clearstatcache();
error_reporting(6135);
$nn = "\r\n";
$fromaddr = 'RapidLeech';
$dev_name = 'Development Stage';
$rev_num = '43';
$plusrar_v = '4.2';
$rl_version = '2.0.2';
$PHP_SELF = $_SERVER['SCRIPT_NAME'];
define('RAPIDLEECH', 'yes');
define('ROOT_DIR', realpath('./'));
define('PATH_SPLITTER', ((strpos(ROOT_DIR, '\\') !== false) ? '\\' : '/'));
define('HOST_DIR', 'hosts/');
define('CLASS_DIR', 'classes/');
define('CONFIG_DIR', 'configs/');
define('BUILD', '30May2011');
define('RL_VERSION', $rl_version);
define('CREDITS', '<a href="https://github.com/PBhadoo/Rapidleech" class="rl-link"><b>RapidLeech</b></a> <b class="rev-dev">v' . $rl_version . '</b>&nbsp;<b class="rev-dev">PlugMod (eqbal) rev. ' . $rev_num . '</b> <span class="rev-dev">' . $dev_name . '</span><br><small class="small-credits">Built with <a href="https://www.anthropic.com/">Claude Opus 4.6</a> by <a href="https://www.anthropic.com/">Anthropic</a></small><br><a href="https://hits.seeyoufarm.com"><img src="https://hits.sh/rapidleech.hashhackers.com.svg?view=today-total&style=for-the-badge&label=Visitors&color=0d1117&labelColor=00aaff"/></a><br><small class="small-credits">For DMCA contact dmca@hashhackers.com, please allow 48 hours to process DMCA requests.</small>');

require_once(CONFIG_DIR . 'setup.php');

// $options['download_dir'] should always end with a '/'
if (substr($options['download_dir'], - 1) != '/') $options['download_dir'] .= '/';
define('DOWNLOAD_DIR', (substr($options['download_dir'], 0, 6) == 'ftp://' ? '' : $options['download_dir']));
define('TEMPLATE_DIR', 'templates/' . $options['template_used'] . '/');
define('IMAGE_DIR', TEMPLATE_DIR . 'images/');
header('X-Frame-Options: SAMEORIGIN');
// Avoid Caching
header('Expires: Mon, 26 Jul 1997 05:00:00 GMT');
header('Last-Modified: ' . gmdate ("D, d M Y H:i:s") . 'GMT');
header('Cache-Control: max-age=0, no-store, no-cache, must-revalidate, proxy-revalidate, post-check=0, pre-check=0');
header('Pragma: no-cache');

require_once(CLASS_DIR . 'other.php');
require_once(CLASS_DIR . 'logger.php');

// ============================================
// USER TOKEN: Cookie-based file ownership
// Each browser gets a unique token. Files are tagged with
// the owner's token so users only see their own files.
// ============================================
function get_user_token() {
    if (!empty($_COOKIE['rl_user_token']) && preg_match('/^[a-f0-9]{32}$/', $_COOKIE['rl_user_token'])) {
        return $_COOKIE['rl_user_token'];
    }
    $token = md5(uniqid(mt_rand(), true) . ($_SERVER['REMOTE_ADDR'] ?? '') . ($_SERVER['HTTP_USER_AGENT'] ?? ''));
    // Set cookie for 1 year, httponly
    @setcookie('rl_user_token', $token, time() + 365 * 86400, '/', '', false, true);
    $_COOKIE['rl_user_token'] = $token;
    return $token;
}
// Initialize the user token on every request
define('USER_TOKEN', get_user_token());

// ============================================
// FAILSAFE: Auto-cleanup when storage hits 99%
// ============================================
function check_storage_and_cleanup() {
    $download_dir = defined('DOWNLOAD_DIR') ? DOWNLOAD_DIR : 'files/';
    
    // Get disk space info
    $total_space = @disk_total_space($download_dir);
    $free_space = @disk_free_space($download_dir);
    
    if ($total_space === false || $free_space === false || $total_space == 0) {
        return false; // Cannot determine disk space
    }
    
    $used_percent = (($total_space - $free_space) / $total_space) * 100;
    
    // If storage usage is 99% or more, clean up the files folder
    if ($used_percent >= 99) {
        $files_dir = $download_dir;
        
        // Safety check: make sure we're cleaning the right directory
        if (!is_dir($files_dir)) {
            return false;
        }
        
        // Log the cleanup action
        $log_message = date('Y-m-d H:i:s') . " - FAILSAFE TRIGGERED: Storage at " . round($used_percent, 2) . "%. Cleaning up files folder.\n";
        @file_put_contents(CONFIG_DIR . 'cleanup_log.txt', $log_message, FILE_APPEND | LOCK_EX);
        
        // Recursively delete all files in the download directory
        $files = new RecursiveIteratorIterator(
            new RecursiveDirectoryIterator($files_dir, RecursiveDirectoryIterator::SKIP_DOTS),
            RecursiveIteratorIterator::CHILD_FIRST
        );
        
        foreach ($files as $fileinfo) {
            $path = $fileinfo->getRealPath();
            // Skip index.html to keep directory listing protected
            if (basename($path) === 'index.html') {
                continue;
            }
            
            if ($fileinfo->isDir()) {
                @rmdir($path);
            } else {
                @unlink($path);
            }
        }
        
        // Clear the files list
        @file_put_contents(CONFIG_DIR . 'files.lst', '');
        
        // Log completion
        $log_message = date('Y-m-d H:i:s') . " - FAILSAFE COMPLETE: Files folder cleaned.\n";
        @file_put_contents(CONFIG_DIR . 'cleanup_log.txt', $log_message, FILE_APPEND | LOCK_EX);
        
        return true;
    }
    
    return false;
}

// Run the storage check on every request
check_storage_and_cleanup();


?>
