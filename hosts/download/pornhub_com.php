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
		
		// Check if quality is being selected (can come from GET or POST)
		$selectedQuality = isset($_POST['ph_quality']) ? intval($_POST['ph_quality']) : (isset($_GET['ph_quality']) ? intval($_GET['ph_quality']) : 0);
		$this->addDebug('Selected quality from request: ' . ($selectedQuality > 0 ? $selectedQuality . 'p' : 'auto (best)'));
		
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
				
				// Collect all available qualities
				$availableQualities = array();
				foreach ($matches as $match) {
					$m3u8Url = stripcslashes($match[1]);
					$q = intval($match[2]);
					$availableQualities[$q] = $m3u8Url;
					$this->addDebug('  - Quality ' . $q . 'p m3u8: ' . substr($m3u8Url, 0, 100) . '...');
				}
				
				// If no quality selected, show quality selector
				if ($selectedQuality == 0 && count($availableQualities) > 1) {
					// Pass the original video link to quality selector
					$this->showQualitySelector($link, $viewkey, $title, $availableQualities);
					exit;
				}
				
				// Select quality (user choice or best available)
				$bestQuality = 0;
				$bestM3u8Url = '';
				
				if ($selectedQuality > 0 && isset($availableQualities[$selectedQuality])) {
					// Use user-selected quality
					$bestQuality = $selectedQuality;
					$bestM3u8Url = $availableQualities[$selectedQuality];
					$quality = strval($bestQuality);
					$this->addDebug('Using user-selected quality: ' . $quality . 'p');
				} else {
					// Find the best quality automatically
					foreach ($availableQualities as $q => $url) {
						if ($q > $bestQuality) {
							$bestQuality = $q;
							$bestM3u8Url = $url;
							$quality = strval($q);
						}
					}
					$this->addDebug('Auto-selected best quality: ' . $quality . 'p');
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
					if (preg_match('@#EXT-X-STREAM-INF:[^\n]*\n([^\n]+\.m3u8[^\n]*)@', $m3u8Body, $variantMatch)) {
						$variantUrl = trim($variantMatch[1]);
						$this->addDebug('Found variant playlist (relative): ' . $variantUrl);
						
						// If relative URL, make it absolute while preserving query parameters
						if (strpos($variantUrl, 'http') !== 0) {
							$baseUrl = preg_replace('@/[^/]*\?.*$|/[^/]*$@', '/', $bestM3u8Url);
							$variantUrl = $baseUrl . $variantUrl;
						}
						$this->addDebug('Found variant playlist (absolute): ' . $variantUrl);
						
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
						
						// Check if variant playlist has segments
						if (preg_match_all('@#EXTINF:[^\n]*\n([^\n]+)@', $variantContent, $segMatches)) {
							$segments = $segMatches[1];
							$this->addDebug('Found ' . count($segments) . ' segments in variant playlist');
							
							// Make first segment URL absolute for testing
							$firstSegment = trim($segments[0]);
							$baseUrl = preg_replace('@/[^/]*$@', '/', $variantUrl);
							if (strpos($firstSegment, 'http') !== 0) {
								$firstSegment = $baseUrl . $firstSegment;
							}
							$this->addDebug('First segment URL: ' . $firstSegment);
							$this->addDebug('Base URL for segments: ' . $baseUrl);
							$this->addDebug('Total segments to download: ' . count($segments));
							
							// Prepare filename before calling download
							$filename = preg_replace('@[^\w\s\-\.\(\)\[\]]@u', '_', $title);
							$filename = preg_replace('@_+@', '_', $filename);
							$filename = preg_replace('@\s+@', '_', $filename);
							$filename = trim($filename, '_');
							$filename = substr($filename, 0, 180);
							if (!empty($quality)) {
								$filename .= "_[{$quality}p]";
							}
							$filename .= '_[pornhub].mp4';
							$this->addDebug('Output filename: ' . $filename);
							
							// Download all HLS segments and merge them
							$this->downloadHLSSegments($segments, $baseUrl, $filename, $quality, $videoUrl);
							exit; // Stop execution after HLS download
						} else {
							$this->addDebug('Method 4: Could not find segments in variant playlist');
						}
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
		$this->addDebug('Full Download URL: ' . $downloadUrl);
		$this->addDebug('Filename: ' . $filename);
		$this->addDebug('Quality: ' . ($quality ? $quality . 'p' : 'unknown'));
		
		// Don't show debug here - will be shown at bottom only
		
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
	
	/**
	 * Download HLS video segments and merge them into a single file
	 */
	private function downloadHLSSegments($segments, $baseUrl, $filename, $quality, $referer) {
		$this->addDebug('=== STARTING HLS SEGMENT DOWNLOAD ===');
		$this->addDebug('Total segments: ' . count($segments));
		$this->addDebug('Output file: ' . $filename);
		
		// Wrap everything in centered container with strong centering
		echo '<div style="max-width: 900px; margin-left: auto !important; margin-right: auto !important; margin-top: 50px; margin-bottom: 50px; padding: 20px; display: block;">';
		
		// Show progress (debug will be shown at bottom only)
		echo '<div style="margin: 20px auto; padding: 15px; background: #e3f2fd; border: 1px solid #2196f3; border-radius: 4px; color: #000; text-align: left;">';
		echo '<h3 style="color: #1976d2; margin-top: 0;">Downloading HLS Stream</h3>';
		echo '<p><strong>Quality:</strong> ' . $quality . 'p (1080p)</p>';
		echo '<p><strong>Segments:</strong> ' . count($segments) . ' parts</p>';
		echo '<p><strong>Method:</strong> Downloading and merging .ts segments</p>';
		echo '<p><strong>Output:</strong> ' . htmlspecialchars($filename) . '</p>';
		echo '<div id="progress" style="margin-top: 15px; font-weight: bold;"></div>';
		echo '</div>';
		flush();
		
		$outputPath = DOWNLOAD_DIR . $filename;
		$tempFile = $outputPath . '.tmp';
		
		// Open output file for writing
		$out = @fopen($tempFile, 'wb');
		if (!$out) {
			html_error('Failed to create output file: ' . $tempFile);
		}
		
		$downloadedCount = 0;
		$failedCount = 0;
		$totalSegments = count($segments);
		
		// Download each segment
		foreach ($segments as $idx => $segment) {
			$segment = trim($segment);
			$segmentUrl = strpos($segment, 'http') === 0 ? $segment : $baseUrl . $segment;
			
			// Progress update every 5 segments
			if ($idx % 5 == 0 || $idx == $totalSegments - 1) {
				$progress = round((($idx + 1) / $totalSegments) * 100);
				$sizeSoFar = @filesize($tempFile);
				$sizeMB = $sizeSoFar > 0 ? round($sizeSoFar / (1024 * 1024), 2) : 0;
				echo '<script>document.getElementById("progress").innerHTML = "Downloading segment ' . ($idx + 1) . '/' . $totalSegments . ' (' . $progress . '%) - ' . $sizeMB . ' MB downloaded";</script>';
				flush();
			}
			
			// Download segment with detailed debugging for first 3
			$segmentData = $this->GetPage($segmentUrl, 0, 0, $referer, 0, 0, 0, 0,
				'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
				'Accept: */*'
			);
			
			if ($idx < 3) {
				$this->addDebug('Segment ' . ($idx + 1) . ' raw length: ' . strlen($segmentData) . ' bytes');
				$this->addDebug('Segment ' . ($idx + 1) . ' first 200 chars: ' . substr($segmentData, 0, 200));
			}
			
			// Strip HTTP headers if present
			if (($pos = strpos($segmentData, "\r\n\r\n")) !== false) {
				$segmentData = substr($segmentData, $pos + 4);
			} elseif (($pos = strpos($segmentData, "\n\n")) !== false) {
				$segmentData = substr($segmentData, $pos + 2);
			}
			
			if (!empty($segmentData) && strlen($segmentData) > 1000) {
				@fwrite($out, $segmentData);
				$downloadedCount++;
			} else {
				$failedCount++;
				// Log but continue
				if ($failedCount < 5) { // Only log first few failures
					$this->addDebug('Segment ' . ($idx + 1) . ' failed or too small (' . strlen($segmentData) . ' bytes)');
				}
			}
		}
		
		@fclose($out);
		
		// Rename temp file to final
		if ($downloadedCount > 0) {
			@rename($tempFile, $outputPath);
			
			$fileSize = @filesize($outputPath);
			$fileSizeMB = round($fileSize / (1024 * 1024), 2);
			
			// Create download URL - use relative path from web root
			$downloadLink = 'files/' . $filename;
			
			echo '<div style="margin: 20px auto; padding: 15px; background: #e8f5e9; border: 1px solid #4caf50; border-radius: 4px; color: #000; text-align: left;">';
			echo '<h3 style="color: #2e7d32; margin-top: 0;">✓ Download Complete!</h3>';
			echo '<p><strong>Downloaded:</strong> ' . $downloadedCount . '/' . $totalSegments . ' segments</p>';
			if ($failedCount > 0) {
				echo '<p style="color: #f57c00;"><strong>Failed:</strong> ' . $failedCount . ' segments (may cause playback issues)</p>';
			}
			echo '<p><strong>File Size:</strong> ' . $fileSizeMB . ' MB (' . number_format($fileSize) . ' bytes)</p>';
			echo '<p><strong>Saved to:</strong> ' . htmlspecialchars($filename) . '</p>';
			echo '<p><strong>Location:</strong> ' . htmlspecialchars(DOWNLOAD_DIR . $filename) . '</p>';
			echo '<div style="margin-top: 15px;">';
			echo '<a href="' . htmlspecialchars($downloadLink) . '" style="display: inline-block; padding: 10px 20px; margin-right: 10px; background: #4caf50; color: #fff; text-decoration: none; border-radius: 4px; font-weight: bold;">⬇ Download File</a>';
			echo '<a href="' . htmlspecialchars('?GO=files') . '" style="display: inline-block; padding: 10px 20px; background: #2196f3; color: #fff; text-decoration: none; border-radius: 4px;">View All Files</a>';
			echo '</div>';
			echo '</div>';
			
			// Collapsible debug section at the end
			echo '<div style="margin: 20px auto; border: 1px solid #ddd; border-radius: 4px; overflow: hidden;">';
			echo '<div onclick="this.nextElementSibling.style.display=this.nextElementSibling.style.display==\'none\'?\'block\':\'none\'" style="padding: 15px; background: #f5f5f5; cursor: pointer; color: #000; user-select: none;">';
			echo '<h3 style="margin: 0; display: inline;">📋 Debug Information</h3>';
			echo '<span style="float: right; font-weight: bold;">▼ Click to expand</span>';
			echo '</div>';
			echo '<div style="display: none; padding: 15px; background: #fff;">';
			echo $this->showDebugInfo();
			echo '</div>';
			echo '</div>';
			
			// Close centered container
			echo '</div>';
		} else {
			@unlink($tempFile);
			echo '</div>'; // Close centered container
			html_error('Failed to download any video segments. All requests failed.');
		}
	}
	
	/**
	 * Show quality selector UI - uses forms to preserve POST data
	 */
	private function showQualitySelector($originalLink, $viewkey, $title, $availableQualities) {
		echo '<div style="max-width: 800px; margin-left: auto !important; margin-right: auto !important; margin-top: 50px; margin-bottom: 50px; padding: 30px; background: #fff; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); color: #000; display: block;">';
		echo '<h2 style="color: #333; margin-top: 0;">📹 Select Video Quality</h2>';
		echo '<h3 style="color: #666; font-weight: normal; margin-bottom: 30px;">' . htmlspecialchars($title) . '</h3>';
		
		echo '<form method="POST" action="" id="qualityForm">';
		// Preserve all original POST/GET parameters
		foreach ($_POST as $key => $value) {
			if ($key !== 'ph_quality') {
				echo '<input type="hidden" name="' . htmlspecialchars($key) . '" value="' . htmlspecialchars($value) . '">';
			}
		}
		foreach ($_GET as $key => $value) {
			if ($key !== 'ph_quality') {
				echo '<input type="hidden" name="' . htmlspecialchars($key) . '" value="' . htmlspecialchars($value) . '">';
			}
		}
		
		echo '<div style="margin-bottom: 30px;">';
		krsort($availableQualities); // Sort descending (1080p first)
		foreach ($availableQualities as $q => $url) {
			$sizeEstimate = '';
			switch($q) {
				case 1080: $sizeEstimate = '~200-400 MB'; break;
				case 720: $sizeEstimate = '~100-200 MB'; break;
				case 480: $sizeEstimate = '~50-100 MB'; break;
				case 360: $sizeEstimate = '~30-60 MB'; break;
				case 240: $sizeEstimate = '~20-40 MB'; break;
			}
			
			$bgColor = $q >= 720 ? '#e8f5e9' : '#fff3e0';
			$borderColor = $q >= 720 ? '#4caf50' : '#ff9800';
			$badge = $q == 1080 ? '<span style="background: #f44336; color: #fff; padding: 2px 8px; border-radius: 3px; font-size: 11px; margin-left: 10px;">BEST</span>' : '';
			
			echo '<button type="submit" name="ph_quality" value="' . $q . '" style="width: 100%; padding: 20px; margin-bottom: 15px; background: ' . $bgColor . '; border: 2px solid ' . $borderColor . '; border-radius: 6px; cursor: pointer; color: #000; transition: all 0.2s; text-align: left; font-size: 16px;" onmouseover="this.style.transform=\'scale(1.02)\'" onmouseout="this.style.transform=\'scale(1)\'">';
			echo '<div style="font-size: 24px; font-weight: bold; color: ' . $borderColor . ';">' . $q . 'p' . $badge . '</div>';
			echo '<div style="margin-top: 5px; color: #666;">Resolution: ' . $this->getResolution($q) . '</div>';
			if ($sizeEstimate) {
				echo '<div style="margin-top: 5px; color: #999; font-size: 14px;">Estimated size: ' . $sizeEstimate . '</div>';
			}
			echo '</button>';
		}
		echo '</div>';
		echo '</form>';
		
		echo '<div style="padding: 15px; background: #f5f5f5; border-radius: 4px; color: #666; font-size: 14px;">';
		echo '<strong>💡 Tip:</strong> Higher quality = better video but larger file size and longer download time.';
		echo '</div>';
		
		echo '<div style="margin-top: 20px; text-align: center;">';
		echo '<a href="?" style="color: #2196f3; text-decoration: none;">← Back to main page</a>';
		echo '</div>';
		
		echo '</div>';
	}
	
	/**
	 * Get resolution string for quality
	 */
	private function getResolution($quality) {
		$resolutions = array(
			1080 => '1920x1080 (Full HD)',
			720 => '1280x720 (HD)',
			480 => '854x480 (SD)',
			360 => '640x360',
			240 => '426x240'
		);
		return isset($resolutions[$quality]) ? $resolutions[$quality] : $quality . 'p';
	}
}

// Updated for Rapidleech - Fixed for get_media API (March 2026)
// Note: Download URLs are IP-bound. The download server must fetch URLs directly.
?>
