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
	private $debugInfo = array(); // Store debug information
	
	private function addDebug($message) {
		$this->debugInfo[] = '[' . date('H:i:s') . '] ' . $message;
	}
	
	private function showDebugInfo() {
		if (!empty($this->debugInfo)) {
			$debugHtml = '<div style="margin: 20px 0; padding: 15px; background: #f5f5f5; border: 1px solid #ddd; border-radius: 4px;">';
			$debugHtml .= '<h3 style="margin-top: 0; color: #333;">Debug Information:</h3>';
			$debugHtml .= '<textarea readonly style="width: 100%; height: 400px; font-family: monospace; font-size: 12px; padding: 10px; background: #fff; color: #000; border: 1px solid #ccc;">';
			$debugHtml .= htmlspecialchars(implode("\n", $this->debugInfo));
			$debugHtml .= '</textarea></div>';
			return $debugHtml;
		}
		return '';
	}
	
	public function Download($link) {
		$this->addDebug('=== PORNHUB DOWNLOAD DEBUG ===');
		$this->addDebug('Input URL: ' . $link);
		
		// Extract viewkey from URL
		if (!preg_match('@[?&]viewkey=([a-zA-Z0-9]+)@i', $link, $viewkey)) {
			$this->addDebug('ERROR: Failed to extract viewkey from URL');
			html_error('Invalid Pornhub link. Expected format: https://www.pornhub.com/view_video.php?viewkey=XXXXX' . $this->showDebugInfo());
		}
		
		$viewkey = $viewkey[1];
		$this->addDebug('Extracted viewkey: ' . $viewkey);
		
		$domain = parse_url($link, PHP_URL_HOST);
		if (empty($domain)) $domain = 'www.pornhub.com';
		$this->addDebug('Domain: ' . $domain);
		
		// Normalize URL
		$videoUrl = "https://{$domain}/view_video.php?viewkey={$viewkey}";
		$this->addDebug('Normalized video URL: ' . $videoUrl);
		
		$this->changeMesg(lang(300) . '<br />Pornhub: Fetching video page...');
		
		$this->addDebug('--- Fetching video page ---');
		$this->addDebug('User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
		$this->addDebug('Cookie: accessAgeDisclaimerPH=1');
		
		// Get the video page with cookies for age verification
		$page = $this->GetPage($videoUrl, 'accessAgeDisclaimerPH=1', 0, 0, 0, 0, 0, 0,
			'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
			'Accept-Language: en-US,en;q=0.9',
			'Sec-Fetch-Dest: document',
			'Sec-Fetch-Mode: navigate',
			'Sec-Fetch-Site: same-origin'
		);
		
		$this->addDebug('Page response length: ' . strlen($page) . ' bytes');
		$this->addDebug('Page first 500 chars: ' . substr($page, 0, 500));
		
		// Extract video title
		$title = 'pornhub_video';
		if (preg_match('@<title>([^<]+)</title>@i', $page, $tm)) {
			$title = trim(str_replace(' - Pornhub.com', '', $tm[1]));
			$title = str_replace(' - Pornhub.org', '', $title);
			$this->addDebug('Video title (from <title>): ' . $title);
		} elseif (preg_match('@<meta property="og:title" content="([^"]+)"@i', $page, $tm)) {
			$title = trim($tm[1]);
			$this->addDebug('Video title (from og:title): ' . $title);
		} else {
			$this->addDebug('Could not extract video title, using default');
		}
		
		// Check if video is available
		if (stripos($page, 'This video has been removed') !== false || 
		    stripos($page, 'This video is unavailable') !== false ||
		    stripos($page, 'Page Not Found') !== false) {
			$this->addDebug('ERROR: Video not available (removed, unavailable, or not found)');
			html_error('Pornhub: Video not found or has been removed.' . $this->showDebugInfo());
		}
		$this->addDebug('Video appears to be available');
		
		$this->changeMesg(lang(300) . '<br />Pornhub: Extracting video URL...');
		
		$downloadUrl = '';
		$quality = '';
		
		$this->addDebug('--- Attempting to extract video URLs ---');
		
		// Method 1 (PRIORITY): Use get_media API - URLs are bound to THIS server's IP
		// This is the most reliable method when running on a server
		$this->addDebug('Method 1: Looking for get_media API URL...');
		if (preg_match('@"videoUrl"\s*:\s*"(https?:[^"]*get_media[^"]*)"@', $page, $gm)) {
			$getMediaUrl = stripcslashes($gm[1]);
			$this->addDebug('Found get_media URL: ' . $getMediaUrl);
			$result = $this->resolveGetMediaUrl($getMediaUrl, $domain, $videoUrl);
			if (!empty($result['url'])) {
				$downloadUrl = $result['url'];
				$quality = $result['quality'];
				$this->addDebug('Method 1 SUCCESS: Got download URL (quality: ' . $quality . ')');
			} else {
				$this->addDebug('Method 1 FAILED: Could not resolve get_media URL');
			}
		} else {
			$this->addDebug('Method 1: get_media URL not found in page');
		}
		
		// Method 2: Look for direct mp4 URLs in the page (older format)
		if (empty($downloadUrl)) {
			$this->addDebug('Method 2: Looking for direct mp4 URLs in page...');
			$qualities = array('1080', '720', '480', '360', '240');
			foreach ($qualities as $q) {
				// Pattern: "quality_720p":"https://..."
				if (preg_match('@"quality_' . $q . 'p"\s*:\s*"(https?://[^"]+\.mp4[^"]*)"@', $page, $qm)) {
					$url = stripcslashes($qm[1]);
					$this->addDebug('Found quality_' . $q . 'p URL: ' . substr($url, 0, 100) . '...');
					// Make sure it's not an image URL
					if (strpos($url, '/plain/') === false && !preg_match('@\.(jpg|jpeg|png|gif)@i', $url)) {
						$downloadUrl = $url;
						$quality = $q;
						$this->addDebug('Method 2 SUCCESS: Using ' . $q . 'p quality');
						break;
					} else {
						$this->addDebug('Skipped (image URL)');
					}
				}
			}
			if (empty($downloadUrl)) {
				$this->addDebug('Method 2: No direct mp4 URLs found');
			}
		}
		
		// Method 3: Try direct mp4 URLs from mediaDefinitions (non-HLS, non-remote)
		if (empty($downloadUrl)) {
			$this->addDebug('Method 3: Looking for mediaDefinitions mp4 URLs...');
			if (preg_match_all('@"format"\s*:\s*"mp4"[^}]*"videoUrl"\s*:\s*"(https?://ev\.phncdn\.com[^"]+)"[^}]*"quality"\s*:\s*"(\d+)"@', $page, $matches, PREG_SET_ORDER)) {
				$this->addDebug('Found ' . count($matches) . ' mp4 URLs in mediaDefinitions');
				$bestQuality = 0;
				foreach ($matches as $match) {
					$url = stripcslashes($match[1]);
					$q = intval($match[2]);
					$this->addDebug('  - Quality ' . $q . 'p: ' . substr($url, 0, 80) . '...');
					if ($q > $bestQuality) {
						$bestQuality = $q;
						$downloadUrl = $url;
						$quality = $match[2];
					}
				}
				$this->addDebug('Method 3 SUCCESS: Selected ' . $quality . 'p quality');
			} else {
				$this->addDebug('Method 3: No mediaDefinitions mp4 URLs found');
			}
		}
		
		// Method 4: Extract and parse HLS m3u8 streams to get actual video URLs
		if (empty($downloadUrl)) {
			$this->addDebug('Method 4: Looking for HLS m3u8 streams...');
			// Pattern: "videoUrl":"https:\/\/ev-h.phncdn.com\/hls\/.../1080P_4000K_xxx.mp4\/master.m3u8?..."
			// Match escaped slashes in JSON: \/
			if (preg_match_all('@"videoUrl":"(https?:\\\\/\\\\/[^"]+?\\\\/(\d+)P_[^"\\\\]+\.mp4\\\\/master\.m3u8[^"]*)"@', $page, $matches, PREG_SET_ORDER)) {
				$this->addDebug('Found ' . count($matches) . ' HLS m3u8 streams');
				$bestQuality = 0;
				$bestM3u8Url = '';
				
				// Find the best quality m3u8
				foreach ($matches as $match) {
					$m3u8Url = stripcslashes($match[1]); // Unescape the URL
					$q = intval($match[2]); // Quality from URL
					$this->addDebug('  - Quality ' . $q . 'p m3u8: ' . substr($m3u8Url, 0, 100) . '...');
					if ($q > $bestQuality) {
						$bestQuality = $q;
						$bestM3u8Url = $m3u8Url;
						$quality = strval($q);
					}
				}
				
				if (!empty($bestM3u8Url)) {
					$this->addDebug('Fetching m3u8 playlist for ' . $quality . 'p...');
					
					// Fetch the m3u8 playlist - NO Origin header, CDN will reject it
					$m3u8Content = $this->GetPage($bestM3u8Url, 0, 0, $videoUrl, 0, 0, 0, 0,
						'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
						'Accept: */*',
						'Accept-Language: en-US,en;q=0.9'
					);
					$this->addDebug('m3u8 response length: ' . strlen($m3u8Content) . ' bytes');
					$this->addDebug('m3u8 content (first 500 chars): ' . substr($m3u8Content, 0, 500));
					
					// Strip HTTP headers from m3u8 content
					$m3u8Body = $m3u8Content;
					if (($pos = strpos($m3u8Content, "\r\n\r\n")) !== false) {
						$m3u8Body = substr($m3u8Content, $pos + 4);
					} elseif (($pos = strpos($m3u8Content, "\n\n")) !== false) {
						$m3u8Body = substr($m3u8Content, $pos + 2);
					}
					$m3u8Body = trim($m3u8Body);
					$this->addDebug('m3u8 body (after header strip): ' . $m3u8Body);
					
					// Parse m3u8 to find the actual mp4 URL or segments
					// Look for the highest bitrate variant
					if (preg_match('@#EXT-X-STREAM-INF:[^\n]*\n([^\n]+\.m3u8)@', $m3u8Body, $variantMatch)) {
						$variantUrl = $variantMatch[1];
						// If relative URL, make it absolute
						if (strpos($variantUrl, 'http') !== 0) {
							$baseUrl = preg_replace('@/[^/]*$@', '/', $bestM3u8Url);
							$variantUrl = $baseUrl . $variantUrl;
						}
						$this->addDebug('Found variant playlist: ' . $variantUrl);
						
						// Fetch the variant playlist - NO Origin header
						$variantContent = $this->GetPage($variantUrl, 0, 0, $bestM3u8Url, 0, 0, 0, 0,
							'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
							'Accept: */*',
							'Accept-Language: en-US,en;q=0.9'
						);
						$this->addDebug('Variant playlist length: ' . strlen($variantContent) . ' bytes');
						
						// Strip HTTP headers from variant playlist
						if (($pos = strpos($variantContent, "\r\n\r\n")) !== false) {
							$variantContent = substr($variantContent, $pos + 4);
						} elseif (($pos = strpos($variantContent, "\n\n")) !== false) {
							$variantContent = substr($variantContent, $pos + 2);
						}
						$variantContent = trim($variantContent);
						$this->addDebug('Variant playlist full content: ' . $variantContent);
						
						// Use the variant m3u8 URL itself as the download URL
						// Download managers like IDM can handle HLS m3u8 playlists automatically
						$downloadUrl = $variantUrl;
						$this->addDebug('Method 4 SUCCESS: Using variant m3u8 URL for HLS download: ' . $variantUrl);
						$this->addDebug('Note: This is an HLS stream. The downloader will fetch and merge segments automatically.');
					} else {
						$this->addDebug('Method 4: HLS video uses segmented streaming (.ts files)');
						$this->addDebug('NOTE: Segmented HLS videos cannot be downloaded directly.');
						$this->addDebug('This video requires a premium Pornhub account or different download method.');
					}
				}
			} else {
				$this->addDebug('Method 4: No HLS streams found');
			}
		}
		
		if (empty($downloadUrl)) {
			$this->addDebug('ERROR: All extraction methods failed');
			$this->addDebug('--- Searching for clues in page content ---');
			
			// Check for common blocking patterns
			if (stripos($page, 'premium') !== false) {
				$this->addDebug('Found keyword "premium" in page');
			}
			if (stripos($page, 'blocked') !== false || stripos($page, 'geo') !== false) {
				$this->addDebug('Found geo-blocking related keywords');
			}
			if (stripos($page, 'login') !== false || stripos($page, 'sign in') !== false) {
				$this->addDebug('Found login-related keywords');
			}
			
			// Look for any videoUrl patterns
			if (preg_match_all('@"videoUrl"[^,}]*@', $page, $allVideoUrls)) {
				$this->addDebug('Found ' . count($allVideoUrls[0]) . ' videoUrl entries:');
				foreach ($allVideoUrls[0] as $idx => $entry) {
					if ($idx < 10) { // Limit to first 10
						$this->addDebug('  ' . substr($entry, 0, 150));
					}
				}
			} else {
				$this->addDebug('No videoUrl patterns found at all in page');
			}
			
			html_error('Pornhub: Could not extract video download link. The video may be premium-only, geo-blocked, or require login.' . $this->showDebugInfo());
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
		
		$this->addDebug('--- Final download details ---');
		$this->addDebug('Download URL: ' . substr($downloadUrl, 0, 150) . '...');
		$this->addDebug('Filename: ' . $filename);
		$this->addDebug('Quality: ' . ($quality ? $quality . 'p' : 'unknown'));
		
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
		
		$this->addDebug('--- Resolving get_media URL ---');
		$this->addDebug('get_media URL: ' . $getMediaUrl);
		$this->addDebug('Referer: ' . $referer);
		
		// Make request to get_media endpoint
		$mediaPage = $this->GetPage($getMediaUrl, 'accessAgeDisclaimerPH=1', 0, $referer, 0, 0, 0, 0,
			'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
			'Accept-Language: en-US,en;q=0.9',
			'Referer: https://www.pornhub.com/',
			'Sec-Fetch-Dest: empty',
			'Sec-Fetch-Mode: cors'
		);
		
		$this->addDebug('get_media response length: ' . strlen($mediaPage) . ' bytes');
		$this->addDebug('get_media response first 1000 chars: ' . substr($mediaPage, 0, 1000));
		
		// Also save to file for detailed analysis
		$debugLog = "get_media response length: " . strlen($mediaPage) . "\n";
		$debugLog .= "Full response:\n" . $mediaPage;
		@file_put_contents(DOWNLOAD_DIR . 'pornhub_debug.log', $debugLog);
		$this->addDebug('Full response saved to: ' . DOWNLOAD_DIR . 'pornhub_debug.log');
		
		// Extract just the JSON body - remove HTTP headers
		$jsonBody = $mediaPage;
		
		$this->addDebug('--- Parsing get_media response ---');
		
		// Handle potential JSONP response
		if (strpos($mediaPage, 'callback(') === 0) {
			$this->addDebug('Detected JSONP response, extracting JSON...');
			$jsonBody = preg_replace('/^callback\(|\);?\s*$/', '', $mediaPage);
		} else {
			$this->addDebug('Processing as regular response...');
			// Remove HTTP headers if present
			if (($pos = strpos($mediaPage, "\r\n\r\n")) !== false) {
				$jsonBody = substr($mediaPage, $pos + 4);
			} elseif (($pos = strpos($mediaPage, "\n\n")) !== false) {
				$jsonBody = substr($mediaPage, $pos + 2);
			}
			
			// Trim and find JSON array
			$jsonBody = trim($jsonBody);
			if (($jsonStart = strpos($jsonBody, '[')) !== false) {
				$this->addDebug('Found JSON array at position ' . $jsonStart);
				$jsonBody = substr($jsonBody, $jsonStart);
			} elseif (($jsonStart = strpos($jsonBody, '{')) !== false) {
				$this->addDebug('Found JSON object at position ' . $jsonStart);
				$jsonBody = substr($jsonBody, $jsonStart);
			}
		}
		
		$this->addDebug('Parsed JSON body (first 1000 chars): ' . substr($jsonBody, 0, 1000));
		@file_put_contents(DOWNLOAD_DIR . 'pornhub_debug.log', "\n\nParsed JSON body:\n" . $jsonBody, FILE_APPEND);
		
		$downloadUrl = '';
		$bestQuality = 0;
		
		// Parse JSON response
		// Add error handling for JSON parsing
		$this->addDebug('Attempting to parse JSON...');
		$mediaData = json_decode($jsonBody, true);
		if (json_last_error() !== JSON_ERROR_NONE) {
			$this->addDebug('JSON parse error: ' . json_last_error_msg());
			// Attempt to fix common JSON issues
			$jsonBody = preg_replace('/,\s*([}\]])/', '$1', $jsonBody); // Remove trailing commas
			$jsonBody = preg_replace('/([{,]\s*)(\w+)(\s*:)/', '$1"$2"$3', $jsonBody); // Add quotes around keys
			$mediaData = json_decode($jsonBody, true);
			
			if (json_last_error() !== JSON_ERROR_NONE) {
				$this->addDebug('JSON parse still failed after fixes: ' . json_last_error_msg());
				@file_put_contents(DOWNLOAD_DIR . 'pornhub_debug.log', "\n\nJSON Parse Error: " . json_last_error_msg(), FILE_APPEND);
				return array('url' => '', 'quality' => '');
			} else {
				$this->addDebug('JSON parse succeeded after fixes');
			}
		} else {
			$this->addDebug('JSON parse successful');
		}
		
		$this->addDebug('mediaData type: ' . gettype($mediaData));
		if (is_array($mediaData)) {
			$this->addDebug('mediaData array count: ' . count($mediaData));
			if (!empty($mediaData)) {
				$this->addDebug('Processing media items...');
			} else {
				$this->addDebug('mediaData array is empty');
			}
		}
		
		if (is_array($mediaData) && !empty($mediaData)) {
			foreach ($mediaData as $idx => $item) {
				$this->addDebug('Item ' . $idx . ': ' . json_encode($item));
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
					$this->addDebug('Selected as best quality so far: ' . $q . 'p');
				}
			}
			if (!empty($downloadUrl)) {
				$this->addDebug('Final selection from JSON: ' . $bestQuality . 'p');
			} else {
				$this->addDebug('No suitable URLs found in mediaData array');
			}
		}
		
		// Fallback: Parse with regex if JSON failed
		if (empty($downloadUrl) && !empty($jsonBody)) {
			$this->addDebug('--- Attempting regex fallback for get_media response ---');
			// Pattern: "videoUrl":"https://ev.phncdn.com/.../1080P_4000K_xxx.mp4?..."
			if (preg_match_all('@"videoUrl"\s*:\s*"(https?://ev\.phncdn\.com/[^"]+\.mp4[^"]*)"@', $jsonBody, $urlMatches)) {
				$this->addDebug('Found ' . count($urlMatches[1]) . ' URLs with regex');
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
				if (!empty($downloadUrl)) {
					$this->addDebug('Regex fallback SUCCESS: Selected ' . $bestQuality . 'p');
				}
			} else {
				$this->addDebug('Regex fallback: No mp4 URLs found');
			}
		}
		
		$this->addDebug('resolveGetMediaUrl returning: url=' . (!empty($downloadUrl) ? 'found' : 'empty') . ', quality=' . $bestQuality);
		
		return array(
			'url' => $downloadUrl,
			'quality' => $bestQuality > 0 ? strval($bestQuality) : ''
		);
	}
}

// Updated for Rapidleech - Fixed for get_media API (March 2026)
// Note: Download URLs are IP-bound. The download server must fetch URLs directly.
?>
