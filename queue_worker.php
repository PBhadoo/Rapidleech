<?php
declare(strict_types=1);
/**
 * RapidLeech Queue Worker
 * Background process that downloads files with parallel chunks
 */

// Prevent timeout
set_time_limit(0);
ignore_user_abort(true);

// Close connection to browser immediately so it doesn't wait
if (function_exists('fastcgi_finish_request')) {
    fastcgi_finish_request();
} else {
    ob_end_clean();
    header("Connection: close");
    header("Content-Length: 0");
    flush();
}

define('RAPIDLEECH', 'yes');
define('CLASS_DIR', 'classes/');
define('CONFIG_DIR', 'configs/');

require_once CONFIG_DIR . "config.php";
require_once CLASS_DIR . 'other.php';
require_once CLASS_DIR . 'download_queue.php';

// Set download directory
if (!str_ends_with($options['download_dir'], '/')) {
    $options['download_dir'] .= '/';
}
define('DOWNLOAD_DIR', $options['download_dir']);

$downloadId = $_GET['id'] ?? '';
if (empty($downloadId)) {
    exit;
}

$queue = new DownloadQueue();
$download = $queue->getDownload($downloadId);

if (!$download || $download['status'] !== 'downloading') {
    exit;
}

/**
 * Download with parallel chunks using multi-curl
 */
function downloadWithChunks(DownloadQueue $queue, array $download): array
{
    $url = $download['url'];
    $options = $download['options'];
    $chunks = $download['chunks'];
    
    if (empty($chunks)) {
        return ['success' => false, 'error' => 'No chunks defined'];
    }
    
    // For non-resumable files or single chunk, use simple download
    if (!$download['resumable'] || count($chunks) === 1) {
        return downloadSingle($queue, $download);
    }
    
    // Multi-curl for parallel chunk download
    $multiHandle = curl_multi_init();
    $curlHandles = [];
    $fileHandles = [];
    
    foreach ($chunks as $i => $chunk) {
        if ($chunk['status'] === 'completed') {
            continue;
        }
        
        $chunkFile = $queue->getChunkPath($download['id'], $chunk['id']);
        
        // Check existing progress
        $existingSize = file_exists($chunkFile) ? filesize($chunkFile) : 0;
        
        $actualStart = $chunk['start'] + $existingSize;
        if ($actualStart > $chunk['end']) {
            // Chunk already complete
            $chunks[$i]['status'] = 'completed';
            $chunks[$i]['downloaded'] = $chunk['end'] - $chunk['start'] + 1;
            continue;
        }
        
        $fp = fopen($chunkFile, 'ab');
        if (!$fp) {
            continue;
        }
        
        $ch = curl_init();
        curl_setopt_array($ch, [
            CURLOPT_URL => $url,
            CURLOPT_RANGE => $actualStart . '-' . $chunk['end'],
            CURLOPT_FILE => $fp,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_SSL_VERIFYPEER => false,
            CURLOPT_USERAGENT => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            CURLOPT_TIMEOUT => 0,
            CURLOPT_CONNECTTIMEOUT => 30,
            CURLOPT_BUFFERSIZE => 65536,
            CURLOPT_LOW_SPEED_LIMIT => 1024,
            CURLOPT_LOW_SPEED_TIME => 30,
        ]);
        
        if (!empty($options['cookie'])) {
            curl_setopt($ch, CURLOPT_COOKIE, $options['cookie']);
        }
        if (!empty($options['referer'])) {
            curl_setopt($ch, CURLOPT_REFERER, $options['referer']);
        }
        
        curl_multi_add_handle($multiHandle, $ch);
        $curlHandles[$i] = $ch;
        $fileHandles[$i] = $fp;
        $chunks[$i]['status'] = 'downloading';
    }
    
    // Update chunks status
    $queue->updateDownload($download['id'], ['chunks' => $chunks]);
    
    // Execute multi-curl
    $running = null;
    $lastUpdate = time();
    
    do {
        $status = curl_multi_exec($multiHandle, $running);
        
        // Update progress every 2 seconds
        if (time() - $lastUpdate >= 2) {
            $totalDownloaded = 0;
            foreach ($chunks as $i => $chunk) {
                $chunkFile = $queue->getChunkPath($download['id'], $chunk['id']);
                if (file_exists($chunkFile)) {
                    $chunks[$i]['downloaded'] = filesize($chunkFile);
                    $totalDownloaded += $chunks[$i]['downloaded'];
                }
            }
            
            $queue->updateDownload($download['id'], [
                'downloaded' => $totalDownloaded,
                'chunks' => $chunks
            ]);
            
            // Check if paused
            $currentStatus = $queue->getDownload($download['id']);
            if ($currentStatus['status'] === 'paused') {
                // Abort all transfers
                foreach ($curlHandles as $ch) {
                    curl_multi_remove_handle($multiHandle, $ch);
                    curl_close($ch);
                }
                foreach ($fileHandles as $fp) {
                    fclose($fp);
                }
                curl_multi_close($multiHandle);
                return ['success' => false, 'error' => 'Paused'];
            }
            
            $lastUpdate = time();
        }
        
        if ($running) {
            curl_multi_select($multiHandle, 1);
        }
    } while ($running > 0 && $status === CURLM_OK);
    
    // Check results and close handles
    $allSuccess = true;
    $errors = [];
    
    foreach ($curlHandles as $i => $ch) {
        $error = curl_error($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        
        if (!empty($error) || !in_array($httpCode, [200, 206], true)) {
            $allSuccess = false;
            $chunks[$i]['status'] = 'error';
            $errors[] = "Chunk $i: " . ($error ?: "HTTP $httpCode");
        } else {
            $chunks[$i]['status'] = 'completed';
            $chunkFile = $queue->getChunkPath($download['id'], $chunks[$i]['id']);
            $chunks[$i]['downloaded'] = file_exists($chunkFile) ? filesize($chunkFile) : 0;
        }
        
        curl_multi_remove_handle($multiHandle, $ch);
        curl_close($ch);
    }
    
    foreach ($fileHandles as $fp) {
        fclose($fp);
    }
    
    curl_multi_close($multiHandle);
    
    // Update final chunk status
    $queue->updateDownload($download['id'], ['chunks' => $chunks]);
    
    if (!$allSuccess) {
        return ['success' => false, 'error' => implode('; ', $errors)];
    }
    
    return ['success' => true];
}

/**
 * Simple single-stream download for non-resumable files
 */
function downloadSingle(DownloadQueue $queue, array $download): array
{
    $url = $download['url'];
    $options = $download['options'];
    $filename = DOWNLOAD_DIR . $download['filename'];
    
    $fp = fopen($filename, 'wb');
    if (!$fp) {
        return ['success' => false, 'error' => 'Cannot create file'];
    }
    
    $ch = curl_init();
    curl_setopt_array($ch, [
        CURLOPT_URL => $url,
        CURLOPT_FILE => $fp,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_SSL_VERIFYPEER => false,
        CURLOPT_USERAGENT => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        CURLOPT_TIMEOUT => 0,
        CURLOPT_CONNECTTIMEOUT => 30,
        CURLOPT_NOPROGRESS => false,
    ]);
    
    curl_setopt($ch, CURLOPT_PROGRESSFUNCTION, function($resource, $downloadSize, $downloaded, $uploadSize, $uploaded) use ($queue, $download): int {
        static $lastUpdate = 0;
        $now = time();
        if ($now - $lastUpdate >= 2) {
            $queue->updateDownload($download['id'], [
                'downloaded' => $downloaded,
                'total_size' => $downloadSize > 0 ? $downloadSize : $download['total_size']
            ]);
            
            // Check if paused
            $currentStatus = $queue->getDownload($download['id']);
            if ($currentStatus['status'] === 'paused') {
                return 1; // Abort transfer
            }
            $lastUpdate = $now;
        }
        return 0;
    });
    
    if (!empty($options['cookie'])) {
        curl_setopt($ch, CURLOPT_COOKIE, $options['cookie']);
    }
    if (!empty($options['referer'])) {
        curl_setopt($ch, CURLOPT_REFERER, $options['referer']);
    }
    
    $result = curl_exec($ch);
    $error = curl_error($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    fclose($fp);
    
    if ($result === false || !in_array($httpCode, [200, 206], true)) {
        @unlink($filename);
        return ['success' => false, 'error' => $error ?: "HTTP $httpCode"];
    }
    
    return ['success' => true];
}

// Main execution
try {
    $result = downloadWithChunks($queue, $download);
    
    if ($result['success']) {
        // Merge chunks if needed
        if ($download['resumable'] && count($download['chunks']) > 1) {
            $mergeResult = $queue->mergeChunks($download);
            if (!$mergeResult) {
                $queue->updateDownload($downloadId, [
                    'status' => 'error',
                    'error' => 'Failed to merge chunks'
                ]);
                exit;
            }
        }
        
        // Mark as completed
        $queue->updateDownload($downloadId, [
            'status' => 'completed',
            'completed_at' => time(),
            'downloaded' => $download['total_size']
        ]);
        
        // Add to files.lst
        $fileRecord = [
            'name' => DOWNLOAD_DIR . $download['filename'],
            'size' => bytesToKbOrMbOrGb($download['total_size']),
            'date' => time(),
            'comment' => 'Downloaded via Queue'
        ];
        $listFile = fopen(CONFIG_DIR . 'files.lst', 'a');
        if ($listFile) {
            fwrite($listFile, serialize($fileRecord) . "\n");
            fclose($listFile);
        }
    } else {
        // Mark as error
        $queue->updateDownload($downloadId, [
            'status' => 'error',
            'error' => $result['error']
        ]);
    }
    
    // Trigger next download in queue
    $protocol = isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] === 'on' ? 'https' : 'http';
    $ch = curl_init($protocol . '://' . $_SERVER['HTTP_HOST'] . dirname($_SERVER['REQUEST_URI']) . '/ajax.php?ajax=queue_process');
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 1,
    ]);
    curl_exec($ch);
    curl_close($ch);
    
} catch (Exception $e) {
    $queue->updateDownload($downloadId, [
        'status' => 'error',
        'error' => $e->getMessage()
    ]);
}
