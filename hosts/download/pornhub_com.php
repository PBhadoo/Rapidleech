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
		
		// Try to extract video URLs from various patterns
		$videoUrl = '';
		$quality = '';
		
		// Pattern 1: Look for MP4 format in mediaDefinitions (not HLS)
		// The MP4 format uses /video/get_media endpoint
		if (preg_match_all('@"format"\s*:\s*"mp4"[^}]*"videoUrl"\s*:\s*"([^"]+)"[^}]*"quality"\s*:\s*(\[[^\]]*\]|"[^"]*")@', $page, $mp4Matches, PREG_SET_ORDER)) {
			foreach ($mp4Matches as $match) {
				$url = stripcslashes($match[1]);
				$q = $match[2];
				if (!empty($url)) {
					$videoUrl = $url;
					// Parse quality
					if (preg_match('@"?(\d+)"?@', $q, $qm)) {
						$quality = $qm[1];
					}
					break;
				}
			}
		}
		
		// Pattern 2: Alternative - look for get_media URL directly
		if (empty($videoUrl)) {
			if (preg_match('@https?://[^"\'\s<>]+/video/get_media\?[^"\'\s<>]+@i', $page, $gm)) {
				$videoUrl = stripcslashes($gm[0]);
			}
		}
		
		// Pattern 3: Look for quality_ variables with direct MP4 URLs
		if (empty($videoUrl)) {
			$qualities = array('1080', '720', '480', '360', '240');
			foreach ($qualities as $q) {
				if (preg_match('@"quality_' . $q . 'p":\s*"(https?://[^"]+\.mp4[^"]*)"@', $page, $qm)) {
					$videoUrl = stripcslashes($qm[1]);
					$quality = $q;
					break;
				}
			}
		}
		
		// Pattern 4: Look for mediaDefinitions with proper videoUrl for HLS and convert to MP4
		// If we only have HLS, we'll need to use the get_media endpoint
		if (empty($videoUrl)) {
			// Try to find any mediaDefinitions entry with mp4 format
			if (preg_match_all('@\{[^{}]*"format"\s*:\s*"mp4"[^{}]*"videoUrl"\s*:\s*"([^"]+)"[^{}]*\}@', $page, $mp4Defs, PREG_SET_ORDER)) {
				foreach ($mp4Defs as $def) {
					$url = stripcslashes($def[1]);
					if (!empty($url) && strpos($url, 'get_media') !== false) {
						$videoUrl = $url;
						break;
					}
				}
			}
		}
		
		// Pattern 5: Look for the quality array patterns
		if (empty($videoUrl)) {
			// Pattern: "videoUrl":"URL","quality":"720"
			if (preg_match_all('@"videoUrl"\s*:\s*"([^"]+)"[^}]*"quality"\s*:\s*"(\d+)"@', $page, $matches, PREG_SET_ORDER)) {
				$bestQuality = 0;
				foreach ($matches as $match) {
					$url = stripcslashes($match[1]);
					$q = intval($match[2]);
					// Skip HLS streams (m3u8) and image URLs
					if (strpos($url, '.m3u8') !== false || strpos($url, '/plain/') !== false) {
						continue;
					}
					// Prefer higher quality
					if ($q > $bestQuality) {
						$bestQuality = $q;
						$videoUrl = $url;
						$quality = $match[2];
					}
				}
			}
		}
		
		if (empty($videoUrl)) {
			html_error('Pornhub: Could not extract video download link. The video may be premium-only or require login.');
		}
		
		// If we got a get_media URL, we need to follow it to get the actual video URL
		if (strpos($videoUrl, 'get_media') !== false) {
			$this->changeMesg(lang(300) . '<br />Pornhub: Resolving video URL...');
			
			// Make request to get_media endpoint
			$mediaPage = $this->GetPage($videoUrl, 'accessAgeDisclaimerPH=1', 0, $videoUrl, 0, 0, 0, 0,
				'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
			);
			
			// The response should be JSON with video URLs by quality
			if (preg_match_all('@"(\d+)"\s*:\s*"(https?://[^"]+\.mp4[^"]*)"@', $mediaPage, $mediaMatches, PREG_SET_ORDER)) {
				$bestQuality = 0;
				foreach ($mediaMatches as $match) {
					$q = intval($match[1]);
					$url = stripcslashes($match[2]);
					// Skip if it looks like an image URL
					if (preg_match('@\.(jpg|jpeg|png|gif|webp)@i', $url) || strpos($url, '/plain/') !== false) {
						continue;
					}
					if ($q >= $bestQuality) {
						$bestQuality = $q;
						$videoUrl = $url;
						$quality = $match[1];
					}
				}
			} elseif (preg_match('@"videoUrl"\s*:\s*"(https?://[^"]+)"@', $mediaPage, $directMatch)) {
				$videoUrl = stripcslashes($directMatch[1]);
			} elseif (preg_match('@Location:\s*(https?://[^\r\n]+)@i', $mediaPage, $locMatch)) {
				// Follow redirect
				$videoUrl = trim($locMatch[1]);
			}
		}
		
		// Final validation - make sure we don't have an image URL
		if (preg_match('@\.(jpg|jpeg|png|gif|webp)(\?|$)@i', $videoUrl) || strpos($videoUrl, '/plain/') !== false) {
			html_error('Pornhub: Extracted URL appears to be an image, not a video. Please try again or report this issue.');
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
			'accessAgeDisclaimerPH=1',
			0,
			$videoUrl,
			0,
			0,
			array(),
			'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
		);
	}
}

// Updated for Rapidleech - Fixed image URL extraction issue
?>
