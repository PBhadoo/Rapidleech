<?php
/**
 * yt-dlp Universal Download Plugin for Rapidleech
 *
 * Downloads media from hundreds of websites using the yt-dlp command-line tool.
 * This plugin acts as a universal fallback for any site supported by yt-dlp.
 *
 * Requirements:
 *   - yt-dlp binary installed on the server (https://github.com/yt-dlp/yt-dlp)
 *   - PHP exec() / shell_exec() must NOT be in disable_functions
 *   - ffmpeg recommended for best quality muxing
 *
 * Configuration:
 *   Set $options['ytdlp_binary'] in configs/config.php to the path of yt-dlp.
 *   Default: /usr/local/bin/yt-dlp  (Linux) or yt-dlp.exe in project root (Windows)
 *
 * @author  Rapidleech yt-dlp Plugin
 * @version 2.0.0
 * @date    2026-03-22
 */

if (!defined('RAPIDLEECH')) {
	require_once('index.html');
	exit();
}

class ytdlp_universal extends DownloadClass {

	/**
	 * Resolve the yt-dlp binary path from config or sensible defaults.
	 */
	private function getBinaryPath() {
		global $options;
		if (!empty($options['ytdlp_binary'])) {
			return $options['ytdlp_binary'];
		}
		// Check project root first (works on all OS, no sudo needed)
		$localBin = ROOT_DIR . PATH_SPLITTER . (strtoupper(substr(PHP_OS, 0, 3)) === 'WIN' ? 'yt-dlp.exe' : 'yt-dlp');
		if (file_exists($localBin)) return $localBin;

		// Then check common system paths (Linux)
		if (strtoupper(substr(PHP_OS, 0, 3)) !== 'WIN') {
			foreach (array('/usr/local/bin/yt-dlp', '/usr/bin/yt-dlp') as $sysPath) {
				if (file_exists($sysPath)) return $sysPath;
			}
		}
		// Fallback: hope it's in PATH
		return (strtoupper(substr(PHP_OS, 0, 3)) === 'WIN') ? 'yt-dlp.exe' : 'yt-dlp';
	}

	/**
	 * Verify the binary is accessible and executable.
	 */
	private function verifyBinary($bin) {
		// Check if exec is available
		if (!function_exists('exec')) {
			html_error('[yt-dlp] PHP exec() function is disabled. Please enable it in php.ini (remove from disable_functions).');
		}
		$disabled = array_map('trim', explode(',', strtolower(ini_get('disable_functions'))));
		if (in_array('exec', $disabled)) {
			html_error('[yt-dlp] PHP exec() is listed in disable_functions. Please remove it in php.ini.');
		}

		// Quick version check
		$escaped = escapeshellarg($bin);
		$out = array();
		$ret = -1;
		@exec($escaped . ' --version 2>&1', $out, $ret);
		if ($ret !== 0 || empty($out)) {
			html_error('[yt-dlp] Cannot execute yt-dlp binary at: <b>' . htmlspecialchars($bin) . '</b><br/>'
				. 'Return code: ' . $ret . '<br/>'
				. 'Output: ' . htmlspecialchars(implode("\n", $out)) . '<br/><br/>'
				. 'Make sure the binary exists, is executable, and the path is correct.<br/>'
				. 'Configure via <code>$options[\'ytdlp_binary\']</code> in configs/config.php');
		}
		return trim($out[0]); // version string
	}

	/**
	 * Format bytes to human readable string.
	 */
	private function formatBytes($bytes) {
		if ($bytes <= 0) return '0 B';
		$units = array('B', 'KB', 'MB', 'GB', 'TB');
		$i = floor(log($bytes, 1024));
		return round($bytes / pow(1024, $i), 2) . ' ' . $units[$i];
	}

	/**
	 * Main entry point called by Rapidleech core.
	 */
	public function Download($link) {
		global $options;

		// ── Step 0: Validate & resolve binary ──────────────────────────────
		$bin = $this->getBinaryPath();
		$version = $this->verifyBinary($bin);

		$this->changeMesg('<b>yt-dlp</b> v' . htmlspecialchars($version) . ' — Preparing download…');

		// ── Step 1: Sanitize the URL ───────────────────────────────────────
		$link = trim($link);
		if (!preg_match('@^https?://@i', $link)) {
			html_error('[yt-dlp] Invalid URL scheme. Only http:// and https:// are supported.');
		}
		$safeUrl = escapeshellarg($link);

		// ── Step 2: Determine output directory ─────────────────────────────
		$downloadDir = realpath(DOWNLOAD_DIR);
		if (!$downloadDir || !is_dir($downloadDir) || !is_writable($downloadDir)) {
			html_error('[yt-dlp] Download directory is not writable: ' . htmlspecialchars(DOWNLOAD_DIR));
		}
		// Ensure trailing separator
		$downloadDir = rtrim($downloadDir, '/\\') . PATH_SPLITTER;

		$safeBin  = escapeshellarg($bin);
		$safeDir  = escapeshellarg($downloadDir);

		// ── Step 3: Handle user-provided cookies ───────────────────────────
		$cookieFile = ROOT_DIR . PATH_SPLITTER . 'configs' . PATH_SPLITTER . 'ytdlp_cookies.txt';

		// Option A: User pasted full cookies.txt content (from yt-dlp format page)
		if (!empty($_POST['ytdlp_user_cookies']) && trim($_POST['ytdlp_user_cookies']) !== '') {
			@file_put_contents($cookieFile, $_POST['ytdlp_user_cookies']);
			@chmod($cookieFile, 0644);
		}
		// Option B: User entered cookies via main form "Additional Cookie Value" (Key=Value format)
		elseif (!empty($_GET['cookieuse']) && $_GET['cookieuse'] === 'on' && !empty($_GET['cookie'])) {
			$rawCookie = trim($_GET['cookie']);
			if (!empty($rawCookie) && strpos($rawCookie, "\t") === false) {
				// Convert Key=Value; Key2=Value2 format to Netscape cookies.txt format
				// Detect the domain from the URL
				$urlParts = parse_url($link);
				$domain = !empty($urlParts['host']) ? $urlParts['host'] : '.youtube.com';
				$netscapeCookies = "# Netscape HTTP Cookie File\n# Converted from Rapidleech cookie input\n";
				$pairs = array_map('trim', explode(';', $rawCookie));
				foreach ($pairs as $pair) {
					if (strpos($pair, '=') !== false) {
						list($name, $value) = explode('=', $pair, 2);
						$name = trim($name);
						$value = trim($value);
						if ($name !== '') {
							$netscapeCookies .= ".$domain\tTRUE\t/\tTRUE\t0\t$name\t$value\n";
						}
					}
				}
				@file_put_contents($cookieFile, $netscapeCookies);
				@chmod($cookieFile, 0644);
			}
		}

		// ── Step 3b (optional): Show format selector ───────────────────────
		if (empty($_POST['ytdlp_step'])) {
			return $this->showFormatSelector($link, $safeBin, $safeUrl);
		}

		// ── Step 4: Build the yt-dlp command ───────────────────────────────
		$formatArg = '';
		if (!empty($_POST['ytdlp_format']) && $_POST['ytdlp_format'] !== 'best') {
			$fmt = preg_replace('/[^a-zA-Z0-9\+\/]/', '', $_POST['ytdlp_format']);
			$formatArg = ' -f ' . escapeshellarg($fmt);
		} else {
			// Best video+audio merged
			$formatArg = ' -f ' . escapeshellarg('bestvideo+bestaudio/best');
		}

		// Output template: flat in download dir, restricted filenames
		// PHP's escapeshellarg() on Windows strips % characters, so we write
		// the output template to a tiny temp config file and pass --config-location.
		$outputTemplate = $downloadDir . '%(title).200B [%(id)s].%(ext)s';

		$tmpConf = tempnam(sys_get_temp_dir(), 'ytdlp_');
		$confLines  = "# Auto-generated yt-dlp config for Rapidleech\n";
		$confLines .= '-o "' . $outputTemplate . '"' . "\n";
		$confLines .= "--restrict-filenames\n";
		$confLines .= "--no-playlist\n";
		$confLines .= "--no-overwrites\n";
		$confLines .= "--newline\n";
		$confLines .= "--no-part\n";
		$confLines .= "--no-mtime\n";
		$confLines .= "--merge-output-format mp4\n";
		$confLines .= "--print after_move:filepath\n";

		// Cookie support: if a cookies.txt file exists in configs/, pass it to yt-dlp
		// This enables downloading age-restricted / login-required videos
		$cookieFile = ROOT_DIR . PATH_SPLITTER . 'configs' . PATH_SPLITTER . 'ytdlp_cookies.txt';
		if (file_exists($cookieFile) && filesize($cookieFile) > 0) {
			$confLines .= '--cookies "' . $cookieFile . '"' . "\n";
		}

		file_put_contents($tmpConf, $confLines);

		$cmd  = $safeBin;
		$cmd .= ' --ignore-config';                        // ignore user/system configs
		$cmd .= ' --config-location ' . escapeshellarg($tmpConf);
		$cmd .= $formatArg;
		$cmd .= ' ' . $safeUrl;
		$cmd .= ' 2>&1';                  // capture stderr into stdout

		$this->changeMesg('<br/>Downloading via yt-dlp…');

		// ── Step 5: Execute ────────────────────────────────────────────────
		$output = array();
		$returnCode = -1;
		$startTime = microtime(true);
		@exec($cmd, $output, $returnCode);
		$elapsed = microtime(true) - $startTime;

		// Clean up temp config file
		@unlink($tmpConf);

		$allOutput = implode("\n", $output);

		// ── Step 6: Find the downloaded file ───────────────────────────────
		// The last non-empty line is the printed filepath (from --print after_move:filepath)
		$filePath = '';
		for ($i = count($output) - 1; $i >= 0; $i--) {
			$line = trim($output[$i]);
			if ($line !== '' && !preg_match('/^\[/', $line) && !preg_match('/^(ERROR|WARNING)/', $line) && !preg_match('/^\d+\.?\d*%/', $line)) {
				// This should be the filepath printed by --print after_move:filepath
				if (file_exists($line)) {
					$filePath = $line;
					break;
				}
			}
		}

		// Fallback: scan output for "Destination:" or "has already been downloaded"
		if (empty($filePath)) {
			foreach ($output as $line) {
				// [download] Destination: /path/to/file.mp4
				if (preg_match('/\[(?:download|Merger)\]\s+(?:Destination:\s*|Merging formats into ")(.+?)(?:"|$)/i', $line, $m)) {
					$candidate = trim($m[1], " \t\n\r\"");
					if (file_exists($candidate)) {
						$filePath = $candidate;
					}
				}
				// [download] /path/file.mp4 has already been downloaded
				if (preg_match('/\[download\]\s+(.+?)\s+has already been downloaded/i', $line, $m)) {
					$candidate = trim($m[1]);
					if (file_exists($candidate)) {
						$filePath = $candidate;
					}
				}
			}
		}

		// Fallback: scan download dir for newest file
		if (empty($filePath) && $returnCode === 0) {
			$newestTime = 0;
			$newestFile = '';
			$dh = opendir($downloadDir);
			if ($dh) {
				while (($entry = readdir($dh)) !== false) {
					if ($entry === '.' || $entry === '..' || $entry === 'index.html') continue;
					$full = $downloadDir . $entry;
					if (is_file($full) && filemtime($full) >= (int)$startTime) {
						if (filemtime($full) > $newestTime) {
							$newestTime = filemtime($full);
							$newestFile = $full;
						}
					}
				}
				closedir($dh);
			}
			if ($newestFile) $filePath = $newestFile;
		}

		// ── Step 7: Error handling ─────────────────────────────────────────
		if ($returnCode !== 0 || empty($filePath) || !file_exists($filePath)) {
			// Parse a clean error from yt-dlp output
			$errorMsg = 'Unknown error';
			foreach ($output as $line) {
				if (stripos($line, 'ERROR:') !== false) {
					$errorMsg = trim(preg_replace('/^ERROR:\s*/i', '', $line));
					break;
				}
			}

			$debugBlock = '<br/><br/><details><summary>Full yt-dlp output (click to expand)</summary>'
				. '<pre style="text-align:left;max-height:400px;overflow:auto;background:#1e1e2e;color:#cdd6f4;padding:12px;border-radius:6px;font-size:12px;">'
				. htmlspecialchars($allOutput)
				. '</pre></details>';

			if ($returnCode !== 0) {
				html_error('[yt-dlp] Download failed (exit code ' . $returnCode . '): <b>'
					. htmlspecialchars($errorMsg) . '</b>' . $debugBlock);
			} else {
				html_error('[yt-dlp] Download appeared to succeed but the output file was not found on disk.'
					. '<br/>Expected directory: ' . htmlspecialchars($downloadDir) . $debugBlock);
			}
		}

		// ── Step 8: Verify file integrity ──────────────────────────────────
		$fileSize = filesize($filePath);
		if ($fileSize === 0) {
			@unlink($filePath);
			html_error('[yt-dlp] Downloaded file is empty (0 bytes). The source may be unavailable.');
		}

		$fileName = basename($filePath);
		$humanSize = $this->formatBytes($fileSize);
		$speed = ($elapsed > 0) ? $this->formatBytes($fileSize / $elapsed) . '/s' : 'N/A';
		$timeStr = ($elapsed >= 60) ? round($elapsed / 60, 1) . ' min' : round($elapsed, 1) . ' sec';

		// ── Step 9: Register file in Rapidleech's file list ────────────────
		$fileRecord = array(
			'name'    => $filePath,
			'size'    => $humanSize,
			'date'    => time(),
			'link'    => $link,
			'comment' => 'Downloaded via yt-dlp',
			'owner'   => (defined('USER_TOKEN') ? USER_TOKEN : ''),
		);
		if (!write_file(CONFIG_DIR . 'files.lst', serialize($fileRecord) . "\r\n", 0)) {
			// Non-fatal: file exists but wasn't tracked
		}

		// ── Step 10: Display success ───────────────────────────────────────
		echo '<script type="text/javascript">document.getElementById("mesg").innerHTML = "";</script>';
		echo '<div style="text-align:center;padding:20px;">';
		echo '<h3 style="color:#22c55e;">✅ Download Complete!</h3>';
		echo '<table style="margin:10px auto;text-align:left;border-collapse:collapse;">';
		echo '<tr><td style="padding:4px 12px;font-weight:bold;">File:</td><td style="padding:4px 12px;">' . link_for_file($filePath) . '</td></tr>';
		echo '<tr><td style="padding:4px 12px;font-weight:bold;">Size:</td><td style="padding:4px 12px;">' . htmlspecialchars($humanSize) . '</td></tr>';
		echo '<tr><td style="padding:4px 12px;font-weight:bold;">Time:</td><td style="padding:4px 12px;">' . htmlspecialchars($timeStr) . '</td></tr>';
		echo '<tr><td style="padding:4px 12px;font-weight:bold;">Speed:</td><td style="padding:4px 12px;">' . htmlspecialchars($speed) . '</td></tr>';
		echo '</table>';

		echo "\n<form method='POST' name='flist' action='{$_SERVER['SCRIPT_NAME']}'>\n";
		echo "\t<input type='hidden' name='files[]' value='" . $fileRecord['date'] . "' /><br />\n";
		echo "\t<div style='text-align:center;'>\n";
		if (function_exists('renderActions')) echo renderActions();
		echo "\t</div>\n";
		echo "</form>\n";

		echo '<br/><a href="' . htmlspecialchars($_SERVER['SCRIPT_NAME']) . '">← Back to main page</a>';
		echo '</div>';

		// Show collapsible debug output
		echo '<div style="max-width:800px;margin:20px auto;border:1px solid #333;border-radius:6px;overflow:hidden;">';
		echo '<div onclick="this.nextElementSibling.style.display=this.nextElementSibling.style.display==\'none\'?\'block\':\'none\'" '
			. 'style="padding:10px 16px;cursor:pointer;user-select:none;font-weight:bold;">📋 yt-dlp output (click to expand)</div>';
		echo '<pre style="display:none;max-height:400px;overflow:auto;padding:12px;margin:0;font-size:12px;background:#1e1e2e;color:#cdd6f4;">'
			. htmlspecialchars($allOutput) . '</pre>';
		echo '</div>';

		include(TEMPLATE_DIR . 'footer.php');
		exit();
	}

	/**
	 * Query available formats and show a selection UI.
	 */
	private function showFormatSelector($link, $safeBin, $safeUrl) {
		// Query available formats with JSON output
		$cookieArg = '';
		$cookieFile = ROOT_DIR . PATH_SPLITTER . 'configs' . PATH_SPLITTER . 'ytdlp_cookies.txt';
		if (file_exists($cookieFile) && filesize($cookieFile) > 0) {
			$cookieArg = ' --cookies ' . escapeshellarg($cookieFile);
		}
		$cmd = $safeBin . ' --dump-json --no-download --no-playlist' . $cookieArg . ' ' . $safeUrl . ' 2>&1';
		$output = array();
		$ret = -1;
		@exec($cmd, $output, $ret);
		$allOutput = implode("\n", $output);

		// Try to parse JSON (may have warning lines before it)
		$json = null;
		$jsonStr = '';
		foreach ($output as $line) {
			$line = trim($line);
			if (!empty($line) && $line[0] === '{') {
				$jsonStr = $line;
				break;
			}
		}
		if ($jsonStr) {
			$json = @json_decode($jsonStr, true);
		}

		if (!$json || empty($json['formats'])) {
			// Could not get format info – offer a direct "best" download
			$this->changeMesg('<br/>Could not list formats. Will attempt best quality download.');

			echo '<div style="text-align:center;padding:20px;">';
			echo '<h3>yt-dlp Download</h3>';
			echo '<p>Could not retrieve format list. Click below to download in best available quality.</p>';
			echo '<form method="POST" action="' . htmlspecialchars($_SERVER['SCRIPT_NAME']) . '">';
			$params = $this->DefaultParamArr($link);
			foreach ($params as $k => $v) echo '<input type="hidden" name="' . htmlspecialchars($k) . '" value="' . htmlspecialchars($v) . '" />';
			echo '<input type="hidden" name="ytdlp_step" value="1" />';
			echo '<input type="hidden" name="ytdlp_format" value="best" />';
			echo '<button type="submit" style="padding:12px 28px;border-radius:8px;border:0;background:#6366f1;color:#fff;font-size:16px;font-weight:600;cursor:pointer;">⬇️ Download Best Quality</button>';
			echo '</form>';

			// Show raw output for debugging
			if (!empty($allOutput)) {
				echo '<details style="max-width:700px;margin:20px auto;text-align:left;"><summary>Debug output</summary>';
				echo '<pre style="font-size:12px;background:#1e1e2e;color:#cdd6f4;padding:12px;border-radius:6px;max-height:300px;overflow:auto;">' . htmlspecialchars($allOutput) . '</pre>';
				echo '</details>';
			}
			echo '</div>';
			include(TEMPLATE_DIR . 'footer.php');
			exit();
		}

		// ── Parse format information ───────────────────────────────────────
		$title = !empty($json['title']) ? $json['title'] : 'Unknown Title';
		$duration = !empty($json['duration']) ? gmdate("H:i:s", (int)$json['duration']) : '';
		$thumbnail = !empty($json['thumbnail']) ? $json['thumbnail'] : '';
		$uploader = !empty($json['uploader']) ? $json['uploader'] : '';

		$videoFormats = array();
		$audioFormats = array();
		$combinedFormats = array();

		foreach ($json['formats'] as $fmt) {
			$id = !empty($fmt['format_id']) ? $fmt['format_id'] : '';
			$ext = !empty($fmt['ext']) ? $fmt['ext'] : '?';
			$vcodec = (!empty($fmt['vcodec']) && $fmt['vcodec'] !== 'none') ? $fmt['vcodec'] : '';
			$acodec = (!empty($fmt['acodec']) && $fmt['acodec'] !== 'none') ? $fmt['acodec'] : '';
			$filesize = !empty($fmt['filesize']) ? (int)$fmt['filesize'] : (!empty($fmt['filesize_approx']) ? (int)$fmt['filesize_approx'] : 0);
			$resolution = !empty($fmt['resolution']) ? $fmt['resolution'] : '';
			$fps = !empty($fmt['fps']) ? (int)$fmt['fps'] : 0;
			$tbr = !empty($fmt['tbr']) ? round($fmt['tbr']) : 0;
			$note = !empty($fmt['format_note']) ? $fmt['format_note'] : '';
			$height = !empty($fmt['height']) ? (int)$fmt['height'] : 0;

			$entry = array(
				'id'         => $id,
				'ext'        => $ext,
				'vcodec'     => $vcodec,
				'acodec'     => $acodec,
				'filesize'   => $filesize,
				'resolution' => $resolution,
				'height'     => $height,
				'fps'        => $fps,
				'tbr'        => $tbr,
				'note'       => $note,
			);

			if ($vcodec && $acodec) {
				$combinedFormats[] = $entry;
			} elseif ($vcodec) {
				$videoFormats[] = $entry;
			} elseif ($acodec) {
				$audioFormats[] = $entry;
			}
		}

		// Sort by quality descending
		usort($combinedFormats, function($a, $b) { return $b['height'] - $a['height']; });
		usort($videoFormats, function($a, $b) { return $b['height'] - $a['height']; });
		usort($audioFormats, function($a, $b) { return $b['tbr'] - $a['tbr']; });

		// ── Render the format selection page ───────────────────────────────
		echo '<div style="max-width:900px;margin:20px auto;padding:20px;">';
		echo '<h2>📥 yt-dlp — Select Download Quality</h2>';

		// Video info card
		echo '<div style="display:flex;gap:20px;align-items:center;margin-bottom:24px;padding:16px;border-radius:10px;border:1px solid #333;">';
		if ($thumbnail) {
			echo '<img src="' . htmlspecialchars($thumbnail) . '" style="width:200px;border-radius:8px;flex-shrink:0;" />';
		}
		echo '<div>';
		echo '<h3 style="margin:0 0 8px 0;">' . htmlspecialchars($title) . '</h3>';
		if ($uploader) echo '<p style="margin:4px 0;opacity:0.7;">by ' . htmlspecialchars($uploader) . '</p>';
		if ($duration) echo '<p style="margin:4px 0;opacity:0.7;">Duration: ' . htmlspecialchars($duration) . '</p>';
		echo '</div></div>';

		echo '<form method="POST" action="' . htmlspecialchars($_SERVER['SCRIPT_NAME']) . '" id="ytdlpForm">';
		$params = $this->DefaultParamArr($link);
		foreach ($params as $k => $v) echo '<input type="hidden" name="' . htmlspecialchars($k) . '" value="' . htmlspecialchars($v) . '" />';
		echo '<input type="hidden" name="ytdlp_step" value="1" />';

		// ── Best Quality (recommended) ─────────────────────────────────────
		echo '<div style="margin-bottom:24px;">';
		echo '<h4>⭐ Recommended</h4>';
		echo '<button type="submit" name="ytdlp_format" value="bestvideo+bestaudio/best" '
			. 'style="width:100%;padding:16px 20px;border-radius:8px;border:2px solid #22c55e;background:rgba(34,197,94,0.1);cursor:pointer;text-align:left;font-size:15px;">';
		echo '<div style="font-size:20px;font-weight:bold;color:#22c55e;">Best Quality (Video + Audio merged)</div>';
		echo '<div style="margin-top:4px;opacity:0.7;">yt-dlp will automatically select and merge the highest quality streams</div>';
		echo '</button>';
		echo '</div>';

		// ── Combined formats (video+audio in one file) ─────────────────────
		if (!empty($combinedFormats)) {
			echo '<h4>🎬 Video + Audio Combined (' . count($combinedFormats) . ' formats)</h4>';
			echo '<div style="margin-bottom:20px;">';
			foreach ($combinedFormats as $fmt) {
				$sizeStr = $fmt['filesize'] ? $this->formatBytes($fmt['filesize']) : '';
				$label = $fmt['height'] . 'p';
				if ($fmt['fps'] > 30) $label .= $fmt['fps'];
				$borderColor = ($fmt['height'] >= 1080) ? '#f59e0b' : (($fmt['height'] >= 720) ? '#22c55e' : '#6366f1');

				echo '<button type="submit" name="ytdlp_format" value="' . htmlspecialchars($fmt['id']) . '" '
					. 'style="width:100%;padding:12px 16px;margin-bottom:8px;border-radius:8px;border:1px solid ' . $borderColor . ';background:transparent;cursor:pointer;text-align:left;font-size:14px;">';
				echo '<span style="font-weight:bold;color:' . $borderColor . ';">' . htmlspecialchars($label) . '</span>';
				echo ' <span style="opacity:0.7;">' . strtoupper($fmt['ext']) . '</span>';
				echo ' <span style="opacity:0.5;">| V: ' . htmlspecialchars($fmt['vcodec']) . ' | A: ' . htmlspecialchars($fmt['acodec']) . '</span>';
				if ($fmt['tbr']) echo ' <span style="opacity:0.5;">| ' . $fmt['tbr'] . ' kbps</span>';
				if ($sizeStr) echo ' <span style="opacity:0.5;">| ~' . $sizeStr . '</span>';
				if ($fmt['note']) echo ' <span style="opacity:0.4;">(' . htmlspecialchars($fmt['note']) . ')</span>';
				echo '</button>';
			}
			echo '</div>';
		}

		// ── Video-only formats ─────────────────────────────────────────────
		if (!empty($videoFormats)) {
			echo '<details><summary style="cursor:pointer;font-weight:bold;margin-bottom:12px;">🎞️ Video Only (' . count($videoFormats) . ' formats)</summary>';
			echo '<div style="margin:12px 0;">';
			echo '<p style="opacity:0.6;font-size:13px;">These contain only video. yt-dlp can merge with a separate audio stream when using "Best Quality" above.</p>';
			foreach ($videoFormats as $fmt) {
				$sizeStr = $fmt['filesize'] ? $this->formatBytes($fmt['filesize']) : '';
				$label = $fmt['height'] ? $fmt['height'] . 'p' : $fmt['resolution'];
				if ($fmt['fps'] > 30) $label .= $fmt['fps'];
				echo '<button type="submit" name="ytdlp_format" value="' . htmlspecialchars($fmt['id']) . '" '
					. 'style="width:100%;padding:10px 14px;margin-bottom:6px;border-radius:6px;border:1px solid #444;background:transparent;cursor:pointer;text-align:left;font-size:13px;">';
				echo '<span style="font-weight:bold;">' . htmlspecialchars($label) . '</span>';
				echo ' <span style="opacity:0.7;">' . strtoupper($fmt['ext']) . '</span>';
				echo ' <span style="opacity:0.5;">V: ' . htmlspecialchars($fmt['vcodec']) . '</span>';
				if ($fmt['tbr']) echo ' <span style="opacity:0.5;">| ' . $fmt['tbr'] . ' kbps</span>';
				if ($sizeStr) echo ' <span style="opacity:0.5;">| ~' . $sizeStr . '</span>';
				echo '</button>';
			}
			echo '</div></details>';
		}

		// ── Audio-only formats ─────────────────────────────────────────────
		if (!empty($audioFormats)) {
			echo '<details><summary style="cursor:pointer;font-weight:bold;margin-bottom:12px;">🎵 Audio Only (' . count($audioFormats) . ' formats)</summary>';
			echo '<div style="margin:12px 0;">';
			foreach ($audioFormats as $fmt) {
				$sizeStr = $fmt['filesize'] ? $this->formatBytes($fmt['filesize']) : '';
				echo '<button type="submit" name="ytdlp_format" value="' . htmlspecialchars($fmt['id']) . '" '
					. 'style="width:100%;padding:10px 14px;margin-bottom:6px;border-radius:6px;border:1px solid #2196f3;background:transparent;cursor:pointer;text-align:left;font-size:13px;">';
				echo '<span style="font-weight:bold;color:#2196f3;">' . htmlspecialchars($fmt['acodec']) . '</span>';
				echo ' <span style="opacity:0.7;">' . strtoupper($fmt['ext']) . '</span>';
				if ($fmt['tbr']) echo ' <span style="opacity:0.5;">| ' . $fmt['tbr'] . ' kbps</span>';
				if ($sizeStr) echo ' <span style="opacity:0.5;">| ~' . $sizeStr . '</span>';
				echo '</button>';
			}
			echo '</div></details>';
		}

		echo '</form>';

		// ── Cookie input for users (collapsible) ───────────────────────────
		$existingCookies = '';
		$cookieFile = ROOT_DIR . PATH_SPLITTER . 'configs' . PATH_SPLITTER . 'ytdlp_cookies.txt';
		if (file_exists($cookieFile)) $existingCookies = @file_get_contents($cookieFile) ?: '';

		echo '<details style="margin-top:24px;border:1px solid #333;border-radius:10px;overflow:hidden;">';
		echo '<summary style="padding:14px 18px;cursor:pointer;font-weight:600;">🍪 Login Required? Paste Browser Cookies</summary>';
		echo '<div style="padding:18px;">';
		echo '<p style="opacity:0.6;font-size:13px;margin-bottom:12px;">';
		echo 'Some videos require authentication. Export cookies from your browser and paste below.<br/>';
		echo '<b>How:</b> Install <a href="https://chromewebstore.google.com/detail/get-cookiestxt-locally/cclelndahbckbenkjhflpdbgdldlbecc" target="_blank" style="color:#818cf8;">Get cookies.txt LOCALLY</a> extension → ';
		echo 'Log into YouTube → Click extension icon → Export → Paste here.</p>';
		echo '<form method="POST" action="' . htmlspecialchars($_SERVER['SCRIPT_NAME']) . '">';
		$params2 = $this->DefaultParamArr($link);
		foreach ($params2 as $k => $v) echo '<input type="hidden" name="' . htmlspecialchars($k) . '" value="' . htmlspecialchars($v) . '" />';
		echo '<textarea name="ytdlp_user_cookies" rows="6" style="width:100%;font:12px/1.4 monospace;padding:10px;border-radius:8px;border:1px solid #444;background:rgba(0,0,0,.3);color:inherit;resize:vertical;" '
			. 'placeholder="# Netscape HTTP Cookie File&#10;# Paste your cookies.txt content here...">'
			. htmlspecialchars($existingCookies) . '</textarea>';
		echo '<div style="margin-top:10px;display:flex;gap:8px;">';
		echo '<button type="submit" style="padding:8px 18px;font-size:13px;">🍪 Save Cookies & Reload</button>';
		echo '</div>';
		echo '</form>';
		echo '</div></details>';

		echo '<div style="margin-top:20px;text-align:center;">';
		echo '<a href="' . htmlspecialchars($_SERVER['SCRIPT_NAME']) . '">← Back to main page</a>';
		echo '</div>';
		echo '</div>';

		include(TEMPLATE_DIR . 'footer.php');
		exit();
	}
}

/*
 * yt-dlp Universal Plugin for Rapidleech
 * Version 2.0.0 - 2026-03-22
 *
 * Changelog:
 *  v2.0.0 - Initial release
 *    - Full format selector with combined/video-only/audio-only categories
 *    - Secure URL sanitisation via escapeshellarg()
 *    - Configurable binary path via $options['ytdlp_binary']
 *    - File registered in Rapidleech file list after download
 *    - Comprehensive error handling with debug output
 *    - Multiple fallback methods for locating downloaded file
 */
