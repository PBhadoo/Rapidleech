<?php
if (!defined('RAPIDLEECH')) {
	require_once('index.html');
	exit;
}

/**
 * TeraBox / 1024tera.com Download Plugin
 * Supports: 1024tera.com, terabox.com, teraboxapp.com, 4funbox.com, mirrobox.com
 * 
 * API Flow:
 * 1. Fetch share page to get jsToken and cookies
 * 2. Call shorturlinfo API to get file metadata (shareid, uk, sign, timestamp, fs_id)
 * 3. Call download API to get direct download link
 */
class d1024tera_com extends DownloadClass {
	private $cookie;
	private $jsToken;
	private $appId = '250528';

	public function Download($link) {
		// Extract surl from various Terabox URL formats
		$surl = $this->extractSurl($link);
		if (!$surl) {
			html_error('Invalid TeraBox link. Expected format: https://www.1024tera.com/sharing/link?surl=XXX or https://terabox.com/s/XXX');
		}

		// Determine the base domain from the link
		$baseDomain = $this->getBaseDomain($link);

		$this->changeMesg(lang(300) . '<br />TeraBox plugin');

		// Step 1: Fetch share page to get jsToken and cookies
		$this->changeMesg(lang(300) . '<br />TeraBox: Getting page tokens...');
		$shareUrl = "https://{$baseDomain}/sharing/link?surl={$surl}";
		$page = $this->GetPage($shareUrl);
		list($header, $body) = array_map('trim', explode("\r\n\r\n", $page, 2));

		// Extract cookies from response headers
		$this->cookie = '';
		if (preg_match_all('@Set-Cookie:\s*([^;\r\n]+)@i', $header, $cm)) {
			$cookies = array();
			foreach ($cm[1] as $c) {
				list($name) = explode('=', $c, 2);
				$cookies[$name] = $c;
			}
			$this->cookie = implode('; ', array_values($cookies));
		}

		// Extract jsToken from page
		if (preg_match('/jsToken\s*(?:=|:)\s*"([^"]+)"/', $body, $jm)) {
			$this->jsToken = $jm[1];
		} elseif (preg_match("/jsToken\s*(?:=|:)\s*'([^']+)'/", $body, $jm)) {
			$this->jsToken = $jm[1];
		} else {
			// Try alternative pattern
			if (preg_match('/fn\(\s*"([0-9A-F]{64,})"\s*\)/', $body, $jm)) {
				$this->jsToken = $jm[1];
			} else {
				html_error('Could not extract jsToken from TeraBox page. The page may have changed.');
			}
		}

		// Step 2: Get file info via shorturlinfo API
		$this->changeMesg(lang(300) . '<br />TeraBox: Getting file info...');
		$infoUrl = "https://{$baseDomain}/api/shorturlinfo?"
			. "app_id={$this->appId}&web=1&channel=dubox&clienttype=0"
			. "&jsToken=" . urlencode($this->jsToken)
			. "&shorturl=1{$surl}&root=1&scene=";

		$infoPage = $this->GetPage($infoUrl, $this->cookie, 0, $shareUrl);
		list($infoHeader, $infoBody) = array_map('trim', explode("\r\n\r\n", $infoPage, 2));
		$info = @json_decode($infoBody, true);

		if (!$info || !empty($info['errno']) && $info['errno'] != 0) {
			$errno = isset($info['errno']) ? $info['errno'] : 'unknown';
			html_error("TeraBox Error: Could not get file info (errno: {$errno})");
		}

		if (empty($info['list']) || !is_array($info['list'])) {
			html_error('No files found in this TeraBox share link.');
		}

		$shareid = $info['shareid'];
		$uk = $info['uk'];
		$sign = $info['sign'];
		$timestamp = $info['timestamp'];

		// Step 3: For each file, get download link
		$files = $info['list'];

		if (count($files) == 1) {
			$file = $files[0];
			$this->downloadTeraFile($file, $shareid, $uk, $sign, $timestamp, $baseDomain, $link, $shareUrl);
		} else {
			// Multiple files - show list
			echo '<div style="text-align:center;padding:20px;">';
			echo '<h3>TeraBox - ' . count($files) . ' files found</h3>';
			echo '<table class="filelist" style="width:100%;margin:20px 0;">';
			echo '<tr class="flisttblhdr"><td><b>Filename</b></td><td><b>Size</b></td></tr>';
			foreach ($files as $f) {
				echo '<tr class="flistmouseoff"><td>' . htmlspecialchars($f['server_filename']) . '</td><td>' . $this->formatSize($f['size']) . '</td></tr>';
			}
			echo '</table>';
			echo '</div>';

			// Build auto-downloader links
			$links = array();
			foreach ($files as $f) {
				$links[] = "https://{$baseDomain}/sharing/link?surl={$surl}&fsid=" . $f['fs_id'];
			}
			$this->moveToAutoDownloader($links);
		}
	}

	private function downloadTeraFile($file, $shareid, $uk, $sign, $timestamp, $baseDomain, $link, $shareUrl) {
		$fname = $file['server_filename'];
		$fsId = $file['fs_id'];
		$fsize = $file['size'];

		// Try to get download link
		$this->changeMesg(lang(300) . '<br />TeraBox: Getting download link for ' . htmlspecialchars($fname) . '...');

		// Method 1: Try dlinkext API 
		$dlUrl = "https://{$baseDomain}/share/extdownload?"
			. "app_id={$this->appId}&web=1&channel=dubox&clienttype=0"
			. "&jsToken=" . urlencode($this->jsToken)
			. "&sign={$sign}&timestamp={$timestamp}"
			. "&shareid={$shareid}&uk={$uk}"
			. "&fid_list=[{$fsId}]"
			. "&primaryid={$shareid}&product=share&nozip=1";

		$dlPage = $this->GetPage($dlUrl, $this->cookie, 0, $shareUrl);
		list($dlHeader, $dlBody) = array_map('trim', explode("\r\n\r\n", $dlPage, 2));
		$dlInfo = @json_decode($dlBody, true);

		$dlink = '';
		if ($dlInfo && isset($dlInfo['errno']) && $dlInfo['errno'] == 0 && !empty($dlInfo['list'])) {
			foreach ($dlInfo['list'] as $item) {
				if (!empty($item['dlink'])) {
					$dlink = $item['dlink'];
					break;
				}
			}
		}

		// Method 2: Try sharedownload API
		if (empty($dlink)) {
			$dlUrl2 = "https://{$baseDomain}/api/sharedownload?"
				. "app_id={$this->appId}&web=1&channel=dubox&clienttype=0"
				. "&jsToken=" . urlencode($this->jsToken)
				. "&sign={$sign}&timestamp={$timestamp}";

			$postData = "shareid={$shareid}&uk={$uk}&fid_list=[{$fsId}]&primaryid={$shareid}&product=share";

			$dlPage2 = $this->GetPage($dlUrl2, $this->cookie, $postData, $shareUrl . "\r\nContent-Type: application/x-www-form-urlencoded");
			list($dlHeader2, $dlBody2) = array_map('trim', explode("\r\n\r\n", $dlPage2, 2));
			$dlInfo2 = @json_decode($dlBody2, true);

			if ($dlInfo2 && isset($dlInfo2['errno']) && $dlInfo2['errno'] == 0 && !empty($dlInfo2['list'])) {
				foreach ($dlInfo2['list'] as $item) {
					if (!empty($item['dlink'])) {
						$dlink = $item['dlink'];
						break;
					}
				}
			}
		}

		// Method 3: If we have dlink from shorturlinfo
		if (empty($dlink) && !empty($file['dlink'])) {
			$dlink = $file['dlink'];
		}

		if (empty($dlink)) {
			html_error('Could not get download link from TeraBox. The file may require login or may be restricted.');
		}

		// Download with User-Agent header (TeraBox checks this)
		$this->RedirectDownload(
			$dlink,
			$fname,
			$this->cookie,
			0,
			$link,
			0,
			0,
			array(),
			'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
		);
	}

	private function extractSurl($link) {
		// Format: /sharing/link?surl=XXX or /s/1XXX or /s/XXX
		if (preg_match('/[?&]surl=([a-zA-Z0-9_\-]+)/', $link, $m)) {
			return $m[1];
		}
		// Format with fsid: /sharing/link?surl=XXX&fsid=YYY
		if (preg_match('/[?&]surl=([a-zA-Z0-9_\-]+)/', $link, $m)) {
			return $m[1];
		}
		// Short URL format: /s/1XXX
		if (preg_match('@/s/1?([a-zA-Z0-9_\-]+)@', $link, $m)) {
			return $m[1];
		}
		return false;
	}

	private function getBaseDomain($link) {
		if (preg_match('@https?://([^/]+)@i', $link, $m)) {
			$host = strtolower($m[1]);
			// Remove www. prefix
			$host = preg_replace('/^www\./', '', $host);
			return 'www.' . $host;
		}
		return 'www.1024tera.com';
	}

	private function formatSize($bytes) {
		if ($bytes <= 0) return '0 B';
		$s = array('B', 'KB', 'MB', 'GB', 'TB');
		$e = floor(log($bytes) / log(1024));
		return round($bytes / pow(1024, $e), 2) . ' ' . $s[$e];
	}
}
