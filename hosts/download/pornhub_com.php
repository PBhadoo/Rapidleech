<?php

if (!defined('RAPIDLEECH')) {
	require_once('index.html');
	exit;
}

/**
 * Pornhub Video Download Plugin
 * Supports: pornhub.com, pornhub.org, pornhubpremium.com
 * Updated: 2026-03-21 - Fixed for get_media API (IP-bound URLs)
 * 
 * Note: Download URLs are bound to the server's IP address.
 * The plugin must fetch the video page and get_media from the same server.
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
		
		// Get the video page with cookies for age verification
		$page = $this->GetPage($videoUrl, 'accessAgeDisclaimerPH=1', 0, 0, 0, 0, 0, 0,
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
		
		$downloadUrl = '';
		$quality = '';
		
		// Method 1 (PRIORITY): Use get_media API - URLs are bound to THIS server's IP
		// This is the most reliable method when running on a server
		if (preg_match('@"videoUrl"\s*:\s*"(https?:[^"]*get_media[^"]*)"@', $page, $gm)) {
			$getMediaUrl = stripcslashes($gm[1]);
			$result = $this->resolveGetMediaUrl($getMediaUrl, $domain, $videoUrl);
			if (!empty($result['url'])) {
				$downloadUrl = $result['url'];
				$quality = $result['quality'];
			}
		}
		
		// Method 2: Look for direct mp4 URLs in the page (older format)
		if (empty($downloadUrl)) {
			$qualities = array('1080', '720', '480', '360', '240');
			foreach ($qualities as $q) {
				// Pattern: "quality_720p":"https://..."
				if (preg_match('@"quality_' . $q . 'p"\s*:\s*"(https?://[^"]+\.mp4[^"]*)"@', $page, $qm)) {
					$url = stripcslashes($qm[1]);
					// Make sure it's not an image URL
					if (strpos($url, '/plain/') === false && !preg_match('@\.(jpg|jpeg|png|gif)@i', $url)) {
						$downloadUrl = $url;
						$quality = $q;
						break;
					}
				}
			}
		}
		
		// Method 3: Try direct mp4 URLs from mediaDefinitions (non-HLS, non-remote)
		if (empty($downloadUrl)) {
			if (preg_match_all('@"format"\s*:\s*"mp4"[^}]*"videoUrl"\s*:\s*"(https?://ev\.phncdn\.com[^"]+)"[^}]*"quality"\s*:\s*"(\d+)"@', $page, $matches, PREG_SET_ORDER)) {
				$bestQuality = 0;
				foreach ($matches as $match) {
					$url = stripcslashes($match[1]);
					$q = intval($match[2]);
					if ($q > $bestQuality) {
						$bestQuality = $q;
						$downloadUrl = $url;
						$quality = $match[2];
					}
				}
			}
		}
		
		if (empty($downloadUrl)) {
			html_error('Pornhub: Could not extract video download link. The video may be premium-only, geo-blocked, or require login.');
		}
		
		// Parse quality from URL if not already set
		if (empty($quality)) {
			if (preg_match('@/(\d{3,4})P_@i', $downloadUrl, $qm)) {
				$quality = $qm[1];
			}
		}
		
		// Clean up filename
		$filename = preg_replace('@[^\w\s\-\.\(\)\[\]]@u', '_', $title);
		$filename = preg_replace('@_+@', '_', $filename);
		$filename = preg_replace('@\s+@', '_', $filename);
		$filename = trim($filename, '_');
		$filename = substr($filename, 0, 180); // Limit length
		
		if (!empty($quality)) {
			$filename .= "_[{$quality}p]";
		}
		$filename .= '_[pornhub].mp4';
		
		$this->changeMesg(lang(300) . '<br />Pornhub: Downloading video (' . ($quality ? $quality . 'p' : 'best quality') . ')...');
		
		// Download the video
		$this->RedirectDownload(
			$downloadUrl,
			$filename,
			'accessAgeDisclaimerPH=1',
			0,
			$videoUrl,
			0,
			0,
			array(),
			'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
		);
	}
	
	/**
	 * Resolve get_media URL to actual MP4 download URLs
	 * The get_media endpoint returns JSON with multiple quality options
	 * URLs are bound to the requesting server's IP address
	 */
	private function resolveGetMediaUrl($getMediaUrl, $domain, $referer) {
		$this->changeMesg(lang(300) . '<br />Pornhub: Resolving video qualities...');
		
		// Make request to get_media endpoint
		$mediaPage = $this->GetPage($getMediaUrl, 'accessAgeDisclaimerPH=1', 0, $referer, 0, 0, 0, 0,
			'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
		);
		
		// Extract just the JSON body - remove HTTP headers
		$jsonBody = $mediaPage;
		
		// Remove HTTP headers if present
		if (($pos = strpos($mediaPage, "\r\n\r\n")) !== false) {
			$jsonBody = substr($mediaPage, $pos + 4);
		} elseif (($pos = strpos($mediaPage, "\n\n")) !== false) {
			$jsonBody = substr($mediaPage, $pos + 2);
		}
		
		// Trim and find JSON array
		$jsonBody = trim($jsonBody);
		if (($jsonStart = strpos($jsonBody, '[')) !== false) {
			$jsonBody = substr($jsonBody, $jsonStart);
		}
		
		$downloadUrl = '';
		$bestQuality = 0;
		
		// Parse JSON response
		$mediaData = @json_decode($jsonBody, true);
		
		if (is_array($mediaData) && !empty($mediaData)) {
			foreach ($mediaData as $item) {
				if (!is_array($item)) continue;
				if (!isset($item['videoUrl'])) continue;
				
				// Only use mp4 format, skip HLS
				if (isset($item['format']) && $item['format'] !== 'mp4') continue;
				
				$url = $item['videoUrl'];
				
				// Skip image URLs, HLS streams
				if (strpos($url, '/plain/') !== false) continue;
				if (strpos($url, '.m3u8') !== false) continue;
				if (preg_match('@\.(jpg|jpeg|png|gif|webp)@i', $url)) continue;
				
				// Get quality
				$q = 0;
				if (isset($item['quality']) && is_numeric($item['quality'])) {
					$q = intval($item['quality']);
				} elseif (isset($item['height']) && is_numeric($item['height'])) {
					$q = intval($item['height']);
				} elseif (preg_match('@/(\d{3,4})P_@i', $url, $qm)) {
					$q = intval($qm[1]);
				}
				
				// Prefer higher quality, must be .mp4
				if ($q >= $bestQuality && strpos($url, '.mp4') !== false) {
					$bestQuality = $q;
					$downloadUrl = $url;
				}
			}
		}
		
		// Fallback: Parse with regex if JSON failed
		if (empty($downloadUrl) && !empty($jsonBody)) {
			// Pattern: "videoUrl":"https://ev.phncdn.com/.../1080P_4000K_xxx.mp4?..."
			if (preg_match_all('@"videoUrl"\s*:\s*"(https?://ev\.phncdn\.com/[^"]+\.mp4[^"]*)"@', $jsonBody, $urlMatches)) {
				foreach ($urlMatches[1] as $url) {
					$url = stripcslashes($url);
					
					// Extract quality from URL
					if (preg_match('@/(\d{3,4})P_@i', $url, $qm)) {
						$q = intval($qm[1]);
						if ($q >= $bestQuality) {
							$bestQuality = $q;
							$downloadUrl = $url;
						}
					} elseif (empty($downloadUrl)) {
						$downloadUrl = $url;
					}
				}
			}
		}
		
		return array(
			'url' => $downloadUrl,
			'quality' => $bestQuality > 0 ? strval($bestQuality) : ''
		);
	}
}

// Updated for Rapidleech - Fixed for get_media API (March 2026)
// Note: Download URLs are IP-bound. The download server must fetch URLs directly.
?>
