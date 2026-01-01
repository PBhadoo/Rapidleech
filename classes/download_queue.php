<?php
/**
 * RapidLeech Download Queue Manager
 * Supports parallel chunk downloading (like IDM) and queue management
 * Max 5 concurrent downloads, 8 chunks per resumable file
 * 
 * @requires PHP 8.0+
 */

declare(strict_types=1);

if (!defined('RAPIDLEECH')) {
    require('../deny.php');
    exit();
}

class DownloadQueue {
    private string $queueFile;
    private int $maxConcurrent = 5;
    private int $chunksPerDownload = 8;
    private int $chunkMinSize = 1048576; // 1MB minimum per chunk
    
    public function __construct() {
        $this->queueFile = CONFIG_DIR . 'download_queue.json';
        $this->initQueue();
    }
    
    /**
     * Initialize queue file if it doesn't exist
     */
    private function initQueue(): void {
        if (!file_exists($this->queueFile)) {
            $this->saveQueue([
                'settings' => [
                    'max_concurrent' => $this->maxConcurrent,
                    'chunks_per_download' => $this->chunksPerDownload
                ],
                'downloads' => []
            ]);
        }
    }
    
    /**
     * Load queue from file
     */
    public function loadQueue(): array {
        if (file_exists($this->queueFile)) {
            $content = file_get_contents($this->queueFile);
            $queue = json_decode($content, true);
            if (is_array($queue)) {
                return $queue;
            }
        }
        return ['settings' => [], 'downloads' => []];
    }
    
    /**
     * Save queue to file with file locking
     */
    public function saveQueue(array $queue): void {
        $lockFile = $this->queueFile . '.lock';
        $lock = fopen($lockFile, 'w');
        
        if ($lock && flock($lock, LOCK_EX)) {
            file_put_contents($this->queueFile, json_encode($queue, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));
            flock($lock, LOCK_UN);
            fclose($lock);
        }
        
        @unlink($lockFile);
    }
    
    /**
     * Add a new download to the queue
     */
    public function addToQueue(string $url, string $filename = '', array $options = []): string {
        $queue = $this->loadQueue();
        
        $id = uniqid('dl_', true);
        $download = [
            'id' => $id,
            'url' => $url,
            'filename' => $filename,
            'status' => 'queued', // queued, checking, downloading, paused, completed, error
            'added_at' => time(),
            'started_at' => null,
            'completed_at' => null,
            'total_size' => 0,
            'downloaded' => 0,
            'resumable' => null, // null = unknown, true/false after check
            'chunks' => [],
            'speed' => 0,
            'error' => null,
            'options' => $options
        ];
        
        $queue['downloads'][$id] = $download;
        $this->saveQueue($queue);
        
        return $id;
    }
    
    /**
     * Remove a download from queue
     */
    public function removeFromQueue(string $id): bool {
        $queue = $this->loadQueue();
        if (isset($queue['downloads'][$id])) {
            // Clean up chunk files if any
            $this->cleanupChunks($queue['downloads'][$id]);
            unset($queue['downloads'][$id]);
            $this->saveQueue($queue);
            return true;
        }
        return false;
    }
    
    /**
     * Update download status
     */
    public function updateDownload(string $id, array $updates): bool {
        $queue = $this->loadQueue();
        if (isset($queue['downloads'][$id])) {
            $queue['downloads'][$id] = array_merge($queue['downloads'][$id], $updates);
            $this->saveQueue($queue);
            return true;
        }
        return false;
    }
    
    /**
     * Get download by ID
     */
    public function getDownload(string $id): ?array {
        $queue = $this->loadQueue();
        return $queue['downloads'][$id] ?? null;
    }
    
    /**
     * Get all downloads
     */
    public function getAllDownloads(): array {
        $queue = $this->loadQueue();
        return $queue['downloads'] ?? [];
    }
    
    /**
     * Get active download count
     */
    public function getActiveCount(): int {
        $queue = $this->loadQueue();
        $count = 0;
        foreach ($queue['downloads'] as $dl) {
            if ($dl['status'] === 'downloading' || $dl['status'] === 'checking') {
                $count++;
            }
        }
        return $count;
    }
    
    /**
     * Get next queued download
     */
    public function getNextQueued(): ?array {
        $queue = $this->loadQueue();
        foreach ($queue['downloads'] as $dl) {
            if ($dl['status'] === 'queued') {
                return $dl;
            }
        }
        return null;
    }
    
    /**
     * Check if a URL supports resume (range requests)
     */
    public function checkResumeSupport(string $url, array $options = []): array {
        $ch = curl_init();
        curl_setopt_array($ch, [
            CURLOPT_URL => $url,
            CURLOPT_NOBODY => true,
            CURLOPT_HEADER => true,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_MAXREDIRS => 10,
            CURLOPT_TIMEOUT => 30,
            CURLOPT_SSL_VERIFYPEER => false,
            CURLOPT_USERAGENT => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            CURLOPT_RANGE => '0-0'
        ]);
        
        if (!empty($options['cookie'])) {
            curl_setopt($ch, CURLOPT_COOKIE, $options['cookie']);
        }
        if (!empty($options['referer'])) {
            curl_setopt($ch, CURLOPT_REFERER, $options['referer']);
        }
        
        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);
        
        // Check for Accept-Ranges header or 206 Partial Content response
        $resumable = ($httpCode === 206 || stripos((string)$response, 'Accept-Ranges: bytes') !== false);
        
        // Get actual file size with a separate HEAD request
        $ch = curl_init();
        curl_setopt_array($ch, [
            CURLOPT_URL => $url,
            CURLOPT_NOBODY => true,
            CURLOPT_HEADER => true,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_SSL_VERIFYPEER => false,
            CURLOPT_USERAGENT => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        ]);
        
        if (!empty($options['cookie'])) {
            curl_setopt($ch, CURLOPT_COOKIE, $options['cookie']);
        }
        
        $response = curl_exec($ch);
        $fileSize = (int)curl_getinfo($ch, CURLINFO_CONTENT_LENGTH_DOWNLOAD);
        
        // Try to get filename from headers
        $filename = '';
        if (is_string($response) && preg_match('/Content-Disposition:.*filename[*]?=["\']?(?:UTF-8\'\')?([^"\'\r\n;]+)/i', $response, $match)) {
            $filename = urldecode(trim($match[1]));
        }
        if (empty($filename)) {
            $filename = basename((string)parse_url($url, PHP_URL_PATH));
        }
        
        curl_close($ch);
        
        return [
            'resumable' => $resumable,
            'size' => $fileSize,
            'filename' => $filename
        ];
    }
    
    /**
     * Create chunk ranges for parallel download
     */
    public function createChunks(int $fileSize, ?int $numChunks = null): array {
        $numChunks ??= $this->chunksPerDownload;
        
        // Don't create multiple chunks for small files
        if ($fileSize < $this->chunkMinSize * 2) {
            return [[
                'id' => 0,
                'start' => 0,
                'end' => $fileSize - 1,
                'downloaded' => 0,
                'status' => 'pending'
            ]];
        }
        
        $chunkSize = (int)ceil($fileSize / $numChunks);
        $chunks = [];
        
        for ($i = 0; $i < $numChunks; $i++) {
            $start = $i * $chunkSize;
            $end = min(($i + 1) * $chunkSize - 1, $fileSize - 1);
            
            if ($start >= $fileSize) {
                break;
            }
            
            $chunks[] = [
                'id' => $i,
                'start' => $start,
                'end' => $end,
                'downloaded' => 0,
                'status' => 'pending' // pending, downloading, completed, error
            ];
        }
        
        return $chunks;
    }
    
    /**
     * Get chunk file path
     */
    public function getChunkPath(string $downloadId, int $chunkId): string {
        return DOWNLOAD_DIR . '.rl_chunk_' . $downloadId . '_' . $chunkId . '.tmp';
    }
    
    /**
     * Clean up chunk files
     */
    public function cleanupChunks(array $download): void {
        if (!empty($download['chunks'])) {
            foreach ($download['chunks'] as $chunk) {
                $chunkFile = $this->getChunkPath($download['id'], $chunk['id']);
                if (file_exists($chunkFile)) {
                    @unlink($chunkFile);
                }
            }
        }
    }
    
    /**
     * Merge chunks into final file
     */
    public function mergeChunks(array $download): bool {
        $filename = DOWNLOAD_DIR . $download['filename'];
        $finalFile = fopen($filename, 'wb');
        
        if (!$finalFile) {
            return false;
        }
        
        // Sort chunks by ID to ensure correct order
        $chunks = $download['chunks'];
        usort($chunks, fn(array $a, array $b): int => $a['id'] <=> $b['id']);
        
        foreach ($chunks as $chunk) {
            $chunkFile = $this->getChunkPath($download['id'], $chunk['id']);
            if (file_exists($chunkFile)) {
                $chunkData = file_get_contents($chunkFile);
                if ($chunkData !== false) {
                    fwrite($finalFile, $chunkData);
                }
                @unlink($chunkFile);
            } else {
                fclose($finalFile);
                @unlink($filename);
                return false;
            }
        }
        
        fclose($finalFile);
        return true;
    }
    
    /**
     * Pause a download
     */
    public function pauseDownload(string $id): bool {
        return $this->updateDownload($id, ['status' => 'paused']);
    }
    
    /**
     * Resume a download
     */
    public function resumeDownload(string $id): bool {
        $download = $this->getDownload($id);
        if ($download && ($download['status'] === 'paused' || $download['status'] === 'error')) {
            return $this->updateDownload($id, ['status' => 'queued', 'error' => null]);
        }
        return false;
    }
    
    /**
     * Clear completed downloads
     */
    public function clearCompleted(): void {
        $queue = $this->loadQueue();
        foreach ($queue['downloads'] as $id => $dl) {
            if ($dl['status'] === 'completed') {
                unset($queue['downloads'][$id]);
            }
        }
        $this->saveQueue($queue);
    }
    
    /**
     * Get queue statistics
     */
    public function getStats(): array {
        $queue = $this->loadQueue();
        $stats = [
            'total' => count($queue['downloads']),
            'queued' => 0,
            'downloading' => 0,
            'paused' => 0,
            'completed' => 0,
            'error' => 0,
            'max_concurrent' => $this->maxConcurrent
        ];
        
        foreach ($queue['downloads'] as $dl) {
            $status = $dl['status'] ?? 'queued';
            if (isset($stats[$status])) {
                $stats[$status]++;
            }
        }
        
        return $stats;
    }
}

/**
 * Chunk Downloader - Downloads a single chunk
 */
class ChunkDownloader {
    private DownloadQueue $queue;
    
    public function __construct(DownloadQueue $queue) {
        $this->queue = $queue;
    }
    
    /**
     * Download a single chunk
     */
    public function downloadChunk(
        string $downloadId, 
        int $chunkId, 
        string $url, 
        int $start, 
        int $end, 
        array $options = []
    ): array {
        $chunkFile = $this->queue->getChunkPath($downloadId, $chunkId);
        
        // Check if partially downloaded
        $existingSize = 0;
        if (file_exists($chunkFile)) {
            $existingSize = (int)filesize($chunkFile);
        }
        
        $actualStart = $start + $existingSize;
        if ($actualStart > $end) {
            // Chunk already complete
            return ['success' => true, 'downloaded' => $end - $start + 1];
        }
        
        $fp = fopen($chunkFile, 'ab');
        if (!$fp) {
            return ['success' => false, 'error' => 'Cannot open chunk file'];
        }
        
        $ch = curl_init();
        curl_setopt_array($ch, [
            CURLOPT_URL => $url,
            CURLOPT_RANGE => $actualStart . '-' . $end,
            CURLOPT_FILE => $fp,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_SSL_VERIFYPEER => false,
            CURLOPT_USERAGENT => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            CURLOPT_TIMEOUT => 0,
            CURLOPT_CONNECTTIMEOUT => 30
        ]);
        
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
            return ['success' => false, 'error' => $error ?: "HTTP $httpCode"];
        }
        
        return ['success' => true, 'downloaded' => (int)filesize($chunkFile)];
    }
}
