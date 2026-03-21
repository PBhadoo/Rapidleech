<?php

if (!defined('RAPIDLEECH')) {
	require_once('index.html');
	exit;
}

/**
 * Pornhub Video Download Plugin
 * Supports: pornhub.com, pornhub.org, pornhubpremium.com
 * Updated: 2026-03-21 - Fixed for new HLS/get_media API
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
		
		// Method 1: Use HLS URLs and convert to direct MP4
		// HLS URLs look like: https://kv-h.phncdn.com/hls/.../720P_4000K_xxx.mp4/master.m3u8?hdnea=...
		// Remove /master.m3u8 to get direct MP4 URL
		if (preg_match_all('@"format"\s*:\s*"hls"[^}]*"videoUrl"\s*:\s*"([^"]+)"[^}]*"quality"\s*:\s*"(\d+)"@', $page, $hlsMatches, PREG_SET_ORDER)) {
			$bestQuality = 0;
			foreach ($hlsMatches as $match) {
				$hlsUrl = stripcslashes($match[1]);
				$q = intval($match[2]);
				
				// Convert HLS URL to direct MP4 URL
				// Pattern: xxx.mp4/master.m3u8?params -> xxx.mp4?params
				if (preg_match('@^(https?://[^?]+\.mp4)/master\.m3u8(\?.*)?$@', $hlsUrl, $mp4Match)) {
					$mp4Url = $mp4Match[1] . ($mp4Match[2] ?? '');
					if ($q >= $bestQuality) {
						$bestQuality = $q;
						$downloadUrl = $mp4Url;
						$quality = $match[2];
					}
				}
			}
		}
		
		// Method 2: Alternative HLS pattern
		if (empty($downloadUrl)) {
			if (preg_match_all('@"videoUrl"\s*:\s*"(https?://[^"]+\.mp4/master\.m3u8[^"]*)"[^}]*"quality"\s*:\s*"?(\d+)"?@', $page, $hlsMatches, PREG_SET_ORDER)) {
				$bestQuality = 0;
				foreach ($hlsMatches as $match) {
					$hlsUrl = stripcslashes($match[1]);
					$q = intval($match[2]);
					
					// Convert HLS to direct MP4
					if (preg_match('@^(https?://[^?]+\.mp4)/master\.m3u8(\?.*)?$@', $hlsUrl, $mp4Match)) {
						$mp4Url = $mp4Match[1] . ($mp4Match[2] ?? '');
						if ($q >= $bestQuality) {
							$bestQuality = $q;
							$downloadUrl = $mp4Url;
							$quality = $match[2];
						}
					}
				}
			}
		}
		
		// Method 3: Try get_media URL (may not work on different IP)
		if (empty($downloadUrl)) {
			if (preg_match('@"videoUrl"\s*:\s*"(https?:[^"]*get_media[^"]*)"@', $page, $gm)) {
				$getMediaUrl = stripcslashes($gm[1]);
				$downloadUrl = $this->resolveGetMediaUrl($getMediaUrl, $domain, $videoUrl);
			}
		}
		
		// Method 4: Look for direct mp4 URLs in the page (older format)
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
	 */
	private function resolveGetMediaUrl($getMediaUrl, $domain, $referer) {
		$this->changeMesg(lang(300) . '<br />Pornhub: Resolving video qualities...');
		
		// Make request to get_media endpoint using cURL for cleaner response
		$mediaPage = $this->GetPage($getMediaUrl, 'accessAgeDisclaimerPH=1', 0, $referer, 0, 0, 0, 0,
			'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
		);
		
		// Remove HTTP headers - find the JSON array start
		// Headers end with double CRLF, then body starts
		if (($pos = strpos($mediaPage, "\r\n\r\n")) !== false) {
			$mediaPage = substr($mediaPage, $pos + 4);
		}
		// Also try just \n\n
		if (($pos = strpos($mediaPage, "\n\n")) !== false && strpos($mediaPage, '[') > $pos) {
			$mediaPage = substr($mediaPage, $pos + 2);
		}
		// Find the JSON array
		if (($jsonStart = strpos($mediaPage, '[{')) !== false) {
			$mediaPage = substr($mediaPage, $jsonStart);
			// Find matching end
			if (($jsonEnd = strrpos($mediaPage, '}]')) !== false) {
				$mediaPage = substr($mediaPage, 0, $jsonEnd + 2);
			}
		}
		
		$downloadUrl = '';
		$bestQuality = 0;
		
		// The response is JSON array with objects containing videoUrl and quality
		// Try to parse as JSON
		$mediaData = @json_decode($mediaPage, true);
		
		if (is_array($mediaData)) {
			foreach ($mediaData as $item) {
				if (!isset($item['videoUrl']) || !isset($item['format'])) continue;
				
				// Only use mp4 format, skip HLS
				if ($item['format'] !== 'mp4') continue;
				
				$url = $item['videoUrl'];
				
				// Skip if it's an image URL or HLS
				if (strpos($url, '/plain/') !== false || strpos($url, '.m3u8') !== false) {
					continue;
				}
				
				// Get quality
				$q = 0;
				if (isset($item['quality']) && is_numeric($item['quality'])) {
					$q = intval($item['quality']);
				} elseif (isset($item['height'])) {
					$q = intval($item['height']);
				} elseif (preg_match('@/(\d{3,4})P_@i', $url, $qm)) {
					$q = intval($qm[1]);
				}
				
				// Prefer higher quality
				if ($q >= $bestQuality && strpos($url, '.mp4') !== false) {
					$bestQuality = $q;
					$downloadUrl = $url;
				}
			}
		}
		
		// Fallback: Parse with regex if JSON parsing failed
		if (empty($downloadUrl)) {
			// Pattern: "videoUrl":"https://ev.phncdn.com/.../1080P_4000K_xxx.mp4?..."
			if (preg_match_all('@"videoUrl"\s*:\s*"(https?://[^"]+\.mp4[^"]*)"@', $mediaPage, $urlMatches)) {
				foreach ($urlMatches[1] as $url) {
					$url = stripcslashes($url);
					// Skip image URLs
					if (strpos($url, '/plain/') !== false) continue;
					
					// Extract quality from URL
					if (preg_match('@/(\d{3,4})P_@i', $url, $qm)) {
						$q = intval($qm[1]);
						if ($q >= $bestQuality) {
							$bestQuality = $q;
							$downloadUrl = $url;
						}
					} elseif (empty($downloadUrl)) {
						// Use first valid URL as fallback
						$downloadUrl = $url;
					}
				}
			}
		}
		
		return $downloadUrl;
	}
}

// Updated for Rapidleech - Fixed for new HLS/get_media API (March 2026)
?>
