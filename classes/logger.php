<?php
/**
 * RapidLeech Activity Logger
 * Logs download events, admin actions, errors, and system events
 * Log file: configs/activity.log
 */

if (!defined('RAPIDLEECH')) {
    require('../deny.php');
    exit;
}

define('RL_LOG_FILE', (defined('CONFIG_DIR') ? CONFIG_DIR : 'configs/') . 'activity.log');
define('RL_LOG_MAX_SIZE', 5 * 1024 * 1024); // 5MB max log file size

/**
 * Write a log entry
 * @param string $level Level: INFO, DOWNLOAD, COMPLETE, ERROR, ADMIN, SYSTEM
 * @param string $message The log message
 * @param array $context Optional context data
 */
function rl_log($level, $message, $context = array()) {
    $logFile = RL_LOG_FILE;
    
    // Auto-rotate if log gets too large
    if (@filesize($logFile) > RL_LOG_MAX_SIZE) {
        $backupFile = $logFile . '.old';
        @unlink($backupFile);
        @rename($logFile, $backupFile);
    }
    
    $entry = array(
        'time' => date('Y-m-d H:i:s'),
        'level' => strtoupper($level),
        'ip' => $_SERVER['REMOTE_ADDR'] ?? 'CLI',
        'message' => $message,
    );
    
    if (!empty($context)) {
        $entry['context'] = $context;
    }
    
    $line = json_encode($entry, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) . "\n";
    @file_put_contents($logFile, $line, FILE_APPEND | LOCK_EX);
}

/**
 * Log download start
 */
function rl_log_download_start($url, $filename = '', $filesize = '') {
    rl_log('DOWNLOAD', 'Download started', array(
        'url' => $url,
        'filename' => $filename,
        'filesize' => $filesize,
    ));
}

/**
 * Log download complete
 */
function rl_log_download_complete($filename, $filesize, $time, $speed) {
    rl_log('COMPLETE', 'Download completed', array(
        'filename' => $filename,
        'filesize' => $filesize,
        'time' => $time,
        'speed' => $speed,
    ));
}

/**
 * Log download error
 */
function rl_log_download_error($url, $error) {
    rl_log('ERROR', 'Download failed', array(
        'url' => $url,
        'error' => $error,
    ));
}

/**
 * Log admin action
 */
function rl_log_admin($action, $details = '') {
    rl_log('ADMIN', $action, array(
        'details' => $details,
        'user' => $_SERVER['PHP_AUTH_USER'] ?? 'unknown',
    ));
}

/**
 * Read log entries (newest first)
 * @param int $limit Max entries to return
 * @param string $levelFilter Filter by level (empty = all)
 * @param string $searchFilter Search in message/context
 * @return array
 */
function rl_log_read($limit = 200, $levelFilter = '', $searchFilter = '') {
    $logFile = RL_LOG_FILE;
    if (!file_exists($logFile)) return array();
    
    $lines = @file($logFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    if (!$lines) return array();
    
    // Reverse for newest first
    $lines = array_reverse($lines);
    
    $entries = array();
    foreach ($lines as $line) {
        $entry = @json_decode($line, true);
        if (!$entry) continue;
        
        // Filter by level
        if (!empty($levelFilter) && $entry['level'] !== strtoupper($levelFilter)) continue;
        
        // Filter by search
        if (!empty($searchFilter)) {
            $haystack = strtolower($line);
            if (strpos($haystack, strtolower($searchFilter)) === false) continue;
        }
        
        $entries[] = $entry;
        if (count($entries) >= $limit) break;
    }
    
    return $entries;
}

/**
 * Clear the log file
 */
function rl_log_clear() {
    @file_put_contents(RL_LOG_FILE, '');
    @unlink(RL_LOG_FILE . '.old');
}

/**
 * Get log file size
 */
function rl_log_size() {
    return @filesize(RL_LOG_FILE) ?: 0;
}
