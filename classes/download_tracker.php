<?php
/**
 * Download Tracker - Track active/pending downloads
 * Allows users to see downloads that are running in background
 */
if (!defined('RAPIDLEECH')) {
    require('../deny.php');
    exit;
}

define('DOWNLOADS_FILE', CONFIG_DIR . 'downloads.lst');

/**
 * Register a new download
 */
function register_download($download_id, $link, $filename, $total_bytes = 0) {
    $downloads = get_all_downloads();
    $downloads[$download_id] = array(
        'id' => $download_id,
        'link' => $link,
        'filename' => $filename,
        'total_bytes' => $total_bytes,
        'received_bytes' => 0,
        'percent' => 0,
        'status' => 'downloading',
        'start_time' => time(),
        'last_update' => time(),
        'pid' => getmypid()
    );
    save_downloads($downloads);
    return $download_id;
}

/**
 * Update download progress
 */
function update_download_progress($download_id, $received_bytes, $total_bytes = null) {
    $downloads = get_all_downloads();
    if (isset($downloads[$download_id])) {
        $downloads[$download_id]['received_bytes'] = $received_bytes;
        $downloads[$download_id]['last_update'] = time();
        if ($total_bytes !== null) {
            $downloads[$download_id]['total_bytes'] = $total_bytes;
        }
        if ($downloads[$download_id]['total_bytes'] > 0) {
            $downloads[$download_id]['percent'] = round(($received_bytes / $downloads[$download_id]['total_bytes']) * 100, 2);
        }
        save_downloads($downloads);
    }
}

/**
 * Mark download as complete and remove from tracking
 */
function complete_download($download_id) {
    $downloads = get_all_downloads();
    if (isset($downloads[$download_id])) {
        unset($downloads[$download_id]);
        save_downloads($downloads);
    }
}

/**
 * Get all active downloads (cleanup stale ones)
 */
function get_active_downloads() {
    $downloads = get_all_downloads();
    $active = array();
    $stale_threshold = 120; // 2 minutes without update = stale
    $now = time();
    $changed = false;
    
    foreach ($downloads as $id => $dl) {
        // Check if download is stale (no update for 2 minutes)
        if (($now - $dl['last_update']) > $stale_threshold) {
            unset($downloads[$id]);
            $changed = true;
            continue;
        }
        $active[$id] = $dl;
    }
    
    if ($changed) {
        save_downloads($downloads);
    }
    
    return $active;
}

/**
 * Get all downloads from file
 */
function get_all_downloads() {
    if (!file_exists(DOWNLOADS_FILE)) {
        return array();
    }
    $content = @file_get_contents(DOWNLOADS_FILE);
    if (empty($content)) {
        return array();
    }
    $downloads = @unserialize($content);
    return is_array($downloads) ? $downloads : array();
}

/**
 * Save downloads to file
 */
function save_downloads($downloads) {
    $fp = @fopen(DOWNLOADS_FILE, 'w');
    if ($fp) {
        flock($fp, LOCK_EX);
        fwrite($fp, serialize($downloads));
        flock($fp, LOCK_UN);
        fclose($fp);
        return true;
    }
    return false;
}

/**
 * Generate unique download ID
 */
function generate_download_id() {
    return md5(uniqid(mt_rand(), true));
}
?>
