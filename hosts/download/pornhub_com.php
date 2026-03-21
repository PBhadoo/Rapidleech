<?php

if (!defined('RAPIDLEECH')) {
	require_once('index.html');
	exit;
}

/**
 * Pornhub Video Download Plugin
 * Supports: pornhub.com, pornhub.org, pornhubpremium.com
 */
class pornhub_com extends DownloadClass {
	public function Download($link) {
		// Extract viewkey from URL
		if (!preg_match('@[?&]viewkey=([a-zA-Z0-9]+)@i', $link, $viewkey)) {
			html_error('Invalid Pornhub link. Expected format: https://www.pornhub.com/view_video.php?viewkey=XXXXX');
		}
		
		$viewkey = $viewkey[1];
		$domain = parse_url($link, PHP_URL_HOST);
		if (empty($domain)) $domain = 'www.pornhub.com';
		
		// Normalize URL
		$videoUrl = "https://{$domain}/view_video.php?viewkey={$viewkey}";
		
		$this->changeMesg(lang(300) . '<br />Pornhub: Fetching video page...');
		
		// Get the video page
		$page = $this->GetPage($videoUrl, 0, 0, 0, 0, 0, 0, 0,
			'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
		);
		
		// Extract video title
		$title = 'pornhub_video';
		if (preg_match('@<title>([^<]+)</title>@i', $page, $tm)) {
			$title = trim(str_replace(' - Pornhub.com', '', $tm[1]));
			$title = str_replace(' - Pornhub.org', '', $title);
		} elseif (preg_match('@<meta property="og:title" content="([^"]+)"@i', $page, $tm)) {
			$title = trim($tm[1]);
		}
		
		// Check if video is available
		if (stripos($page, 'This video has been removed') !== false || 
		    stripos($page, 'This video is unavailable') !== false ||
		    stripos($page, 'Page Not Found') !== false) {
			html_error('Pornhub: Video not found or has been removed.');
		}
		
		$this->changeMesg(lang(300) . '<br />Pornhub: Extracting video URL...');
		
		// Try to extract video URLs from various patterns
		$videoUrl = '';
		$quality = '';
		
		// Pattern 1: Look for media definitions in flashvars
		if (preg_match('@"mediaDefinitions":\s*(\[[^\]]+\])@', $page, $media)) {
			$mediaJson = json_decode($media[1], true);
			if ($mediaJson && is_array($mediaJson)) {
				// Find the best quality MP4
				foreach ($mediaJson as $item) {
					if (!empty($item['videoUrl']) && !empty($item['quality'])) {
						$qualities = is_array($item['quality']) ? $item['quality'] : array($item['quality']);
						foreach ($qualities as $q) {
							// Prefer 720p or 1080p
							if (in_array($q, array('1080', '720', '480', '240'))) {
								$videoUrl = $item['videoUrl'];
								$quality = $q;
								break 2;
							}
						}
					}
				}
			}
		}
		
		// Pattern 2: Look for quality_ variables
		if (empty($videoUrl)) {
			$qualities = array('1080', '720', '480', '360', '240');
			foreach ($qualities as $q) {
				if (preg_match('@"quality_' . $q . 'p":\s*"([^"]+)"@', $page, $qm)) {
					$videoUrl = $qm[1];
					$quality = $q;
					break;
				}
			}
		}
		
		// Pattern 3: Direct video URLs
		if (empty($videoUrl)) {
			if (preg_match('@https?://[^"\'\s<>]+\.mp4[^"\'\s<>]*@i', $page, $vm)) {
				$videoUrl = $vm[0];
			}
		}
		
		if (empty($videoUrl)) {
			html_error('Pornhub: Could not extract video download link. The video may be premium-only or require login.');
		}
		
		// Clean up filename
		$filename = preg_replace('@[^\w\s\-\.\(\)\[\]]@u', '_', $title);
		$filename = preg_replace('@\s+@', '_', $filename);
		$filename = substr($filename, 0, 200); // Limit length
		
		if (!empty($quality)) {
			$filename .= "_[{$quality}p]";
		}
		$filename .= '_[pornhub].mp4';
		
		$this->changeMesg(lang(300) . '<br />Pornhub: Downloading video...');
		
		// Download the video
		$this->RedirectDownload(
			$videoUrl,
			$filename,
			0,
			0,
			$videoUrl,
			0,
			0,
			array(),
			'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
		);
	}
}

// Created by Claude Opus 4.6 for Rapidleech
?>
