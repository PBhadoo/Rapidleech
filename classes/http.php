<?php
if (!defined('RAPIDLEECH')) {
	require('../deny.php');
	exit();
}

// Allow user-agent to be changed easily
if (!defined('rl_UserAgent')) define('rl_UserAgent', 'Mozilla/5.0 (Windows NT 6.1; rv:52.0) Gecko/20100101 Firefox/52.0');

/*
 * Pauses for countdown timer in file hosts
 * @param int The number of seconds to count down
 * @param string The text you want to display when counting down
 * @param string The text you want to display when count down is complete
 * @param bool
 * @return bool
 */
function insert_timer($countd, $caption = '', $timeouttext = '', $hide = false) {
	if (empty($countd) || !is_numeric($countd) || $countd < 0) return false;
	$countd = ceil($countd);

	$timerid = jstime();
	echo "\n<div id='timer_$timerid' align='center'>\n\t<br /><span class='caption'>$caption</span>&nbsp;&nbsp;\n\t<span id='timerlabel_$timerid' class='caption'></span>\n</div>\n<script type='text/javascript'>/* <![CDATA[ */\n\tvar count_$timerid = $countd;\n\tfunction timer_$timerid() {\n\t\tif (count_$timerid > 0) {\n\t\t\t$('#timerlabel_$timerid').html('". sprintf(lang(87), "' + count_$timerid + '") . "');\n\t\t\tcount_$timerid--;\n\t\t\tsetTimeout('timer_$timerid()', 1000);\n\t\t}";
	if ($hide) echo "else $('#timer_$timerid').css('display', 'none');";
	elseif (!empty($timeouttext)) echo "else $('#timer_$timerid').html('" . addslashes($timeouttext) . "');";
	echo "\n\t} timer_$timerid();\n/* ]]> */</script>";
	flush();
	sleep($countd);
	return true;
}

/*
 * Counter for those filehosts that displays mirror after countdown
 * @param int The number of seconds to count down
 * @param string Text you want to display above the counter
 * @param string The text you want to display when counting down
 * @param string The text you want to display when count down is complete
 */
function insert_new_timer($countd, $displaytext, $caption = '', $text = '') {
	if (!is_numeric($countd)) return html_error(lang(85));
	echo ('<div id="code"></div>');
	echo ('<div align="center">');
	echo ('<div id="dl"><h4>' . lang(86) . '</h4></div></div>');
	echo ('<script type="text/javascript">var c = ' . $countd . ';fc("' . $caption . '","' . $displaytext . '");</script>');
	if (!empty($text)) print $text;
	require (TEMPLATE_DIR . '/footer.php');
}

/*
 * Function to check if geturl function has completed successfully
 */
function is_page($lpage) {
	global $lastError;
	if (!$lpage) return html_error(lang(84) . "<br />$lastError");
}

function readCustomHeaders(&$referer) {
	$headers = array();
	if (!empty($referer)) {
		$tmp = array_map('trim', explode("\n", $referer));
		$referer = array_shift($tmp);
		if (count($tmp) > 0) {
			foreach (array_filter($tmp) as $tmp) {
				$tmp = array_map('trim', explode(':', $tmp, 2));
				// Avoid set an empty method header (key: '')
				if ($tmp[0] !== '' || $tmp[1] !== '') {
					// Key must be lowercase (for override default header)
					$headers[strtolower($tmp[0])] = $tmp[1];
				}
			}
		}
	}
	return $headers;
}

function headers2request(array $headers, $data = '') {
	if (empty($headers) || empty($headers[''])) return html_error('Empty headers array or Non HTTP method');
	$request = trim($headers['']) . "\r\n";
	unset($headers['']);
	foreach ($headers as $header => $value) {
		$header = strtolower($header);
		if ($header != 'connection' && $value !== '') {
			$request .= strtr(ucwords(strtr(trim($header), '-', ' ')), ' ', '-') . ': ' . trim($value) . "\r\n";
		}
	}
	$request .= "Connection: Close\r\n\r\n$data";
	return $request;
}

function geturl($host, $port, $url, $referer = 0, $cookie = 0, $post = 0, $saveToFile = 0, $proxy = 0, $pauth = 0, $auth = 0, $scheme = 'http', $resume_from = 0, $XMLRequest = 0) {
	global $nn, $lastError, $Resume, $bytesReceived, $fp, $fs, $force_name, $options, $sFilters;
	$scheme = strtolower($scheme) . '://';

	// Try parallel download for file downloads (when saveToFile is provided)
	// Only use parallel when: no POST data, no resume in progress, file is large enough, cURL available
	if ($saveToFile && $post === 0 && empty($Resume['use']) && extension_loaded('curl') && function_exists('curl_multi_init')) {
		// Build full URL
		$fullScheme = ($scheme == 'ssl://') ? 'https://' : (($scheme == 'https://') ? 'https://' : 'http://');
		$fullUrl = $fullScheme . $host . ($port != 0 && $port != 80 && $port != 443 ? ':' . $port : '') . $url;
		
		// Check if URL supports resume
		$cookieStr = '';
		if (!empty($cookie)) {
			$cookieStr = is_array($cookie) ? CookiesToStr($cookie) : trim($cookie);
		}
		
		$resumeInfo = checkResumeSupport($fullUrl, $cookieStr, $referer, $proxy, $pauth, $auth);
		
		// Use parallel download if:
		// 1. Resume is supported
		// 2. File size is known and > 2MB (worth parallelizing)
		// 3. parallel_download option is not disabled
		$minSizeForParallel = 2 * 1024 * 1024; // 2MB minimum
		$useParallel = !empty($options['parallel_download']) || !isset($options['parallel_download']); // Default enabled
		
		if ($resumeInfo && $resumeInfo['supports_resume'] && $resumeInfo['content_length'] > $minSizeForParallel && $useParallel) {
			// Check file size limit
			if ($options['file_size_limit'] > 0 && ($resumeInfo['content_length'] > ($options['file_size_limit'] * 1024 * 1024))) {
				$lastError = lang(336) . bytesToKbOrMbOrGb($options['file_size_limit'] * 1024 * 1024) . '.';
				return false;
			}
			
			if ($proxy) echo '<p>' . sprintf(lang(89), $proxy, '') . '<br />GET: <b>' . htmlspecialchars($fullUrl) . "</b>...<br />\n";
			else echo '<p>'.sprintf(lang(90), $host, $port).'</p>';
			
			// Use filename from headers if available
			if (!empty($resumeInfo['filename']) && empty($force_name)) {
				$force_name = $resumeInfo['filename'];
			}
			
			$numChunks = isset($options['parallel_chunks']) ? (int)$options['parallel_chunks'] : 8;
			$result = parallelDownload($fullUrl, $saveToFile, $resumeInfo['content_length'], $numChunks, $cookieStr, $referer, $proxy, $pauth, $auth);
			
			if ($result !== false) {
				return $result;
			}
			// If parallel download failed, fall through to single-stream download
		}
	}

	if (($post !== 0) && ($scheme == 'http://' || $scheme == 'https://')) {
		$method = 'POST';
		$postdata = is_array($post) ? formpostdata($post) : $post;
	} else {
		$method = 'GET';
		$postdata = '';
	}

	if (!empty($cookie)) {
		if (is_array($cookie)) $cookies = (count($cookie) > 0) ? CookiesToStr($cookie) : 0;
		else $cookies = trim($cookie);
	}

	if ($scheme == 'https://') {
		if (!extension_loaded('openssl')) return html_error('You need to install/enable PHP\'s OpenSSL extension to support downloading via HTTPS.');
		$scheme = 'ssl://';
		if ($port == 0 || $port == 80) $port = 443;
	} else if ($port == 0) $port = 80;

	if ($proxy) {
		list($proxyHost, $proxyPort) = explode(':', $proxy, 2);
		if ($scheme != 'ssl://') {
			$host = $host . ($port != 80 && $port != 443 ? ":$port" : '');
			$url = "$scheme$host$url";
		}
	}

	if ($scheme != 'ssl://') $scheme = '';

	$cHeaders = readCustomHeaders($referer);
	$request = array();
	$request[''] = $method . ' ' . str_replace(' ', '%20', $url) . ' HTTP/1.1';
	$request['host'] = $host;
	$request['user-agent'] = rl_UserAgent;
	$request['accept'] = 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8';
	if (!$saveToFile) $request['accept-encoding'] = 'gzip, deflate';
	$request['accept-language'] = 'en-US,en;q=0.5';
	if (!empty($referer)) $request['referer'] = $referer;
	if (!empty($cookies)) $request['cookie'] = $cookies;
	$request['cache-control'] = $request['pragma'] = 'no-cache';
//	if (!empty($Resume['use']) && $Resume['use'] === TRUE) $request['range'] = 'bytes=' . $Resume['from'] . '-';
	if (!empty($auth)) $request['authorization'] = "Basic $auth";
	if (!empty($pauth) && !$scheme) $request['proxy-authorization'] = "Basic $pauth";
	if ($method == 'POST') {
		$request['content-type'] = 'application/x-www-form-urlencoded';
		$request['content-length'] = strlen($postdata);
	}
	if ($XMLRequest) $request['x-requested-with'] = 'XMLHttpRequest';

	$request = headers2request(array_merge($request, $cHeaders), $postdata);

	$errno = 0;
	$errstr = '';
	if ($scheme == 'ssl://') {
		$hosts = (!empty($proxyHost) ? $proxyHost : $scheme . $host) . ':' . (!empty($proxyPort) ? $proxyPort : $port);
		if ($proxy) $url = "https://$host$url"; // For the 'connected to' message
	} else $hosts = (!empty($proxyHost) ? $scheme . $proxyHost : $scheme . $host) . ':' . (!empty($proxyPort) ? $proxyPort : $port);
	$fp = @stream_socket_client($hosts, $errno, $errstr, 120, STREAM_CLIENT_CONNECT);

	if (!$fp) {
		if (!function_exists('stream_socket_client')) return html_error('[ERROR] stream_socket_client() is disabled.');
		$dis_host = !empty($proxyHost) ? $proxyHost : $host;
		$dis_port = !empty($proxyPort) ? $proxyPort : $port;
		return html_error(sprintf(lang(88), $dis_host, $dis_port));
	}

	if ($errno || $errstr) {
		$lastError = $errstr;
		return false;
	}

	stream_set_timeout($fp, $saveToFile ? 600 : 120);

	if ($saveToFile) {
		if ($proxy) echo '<p>' . sprintf(lang(89), $proxyHost, $proxyPort) . '<br />GET: <b>' . htmlspecialchars($url) . "</b>...<br />\n";
		else echo '<p>'.sprintf(lang(90), $host, $port).'</p>';
	}

	if ($scheme == 'ssl://' && $proxy) {
		$connRequest = array();
		$connRequest[''] = "CONNECT $host:$port HTTP/1.1";
		if (!empty($pauth)) $connRequest['proxy-authorization'] = "Basic $pauth";
		$connRequest['proxy-connection'] = 'Close';
		$connRequest = headers2request($connRequest);

		fwrite($fp, $connRequest);
		fflush($fp);

		$llen = 0;
		$header = '';
		do {
			$header .= fgets($fp, 16384);
			$len = strlen($header);
			if (!$header || $len == $llen) {
				$lastError = 'No response from proxy after CONNECT.';
				stream_socket_shutdown($fp, STREAM_SHUT_RDWR);
				fclose($fp);
				return false;
			}
			$llen = $len;
		} while (strpos($header, $nn . $nn) === false);

		$status = intval(substr($header, 9, 3));
		if ($status != 200) {
			return html_error("Proxy returned $status after CONNECT.");
		}

		// Start TLS.
		if (!stream_socket_enable_crypto($fp, true, (defined('STREAM_CRYPTO_METHOD_TLSv1_2_CLIENT') ? STREAM_CRYPTO_METHOD_TLSv1_0_CLIENT | STREAM_CRYPTO_METHOD_TLSv1_1_CLIENT | STREAM_CRYPTO_METHOD_TLSv1_2_CLIENT : STREAM_CRYPTO_METHOD_TLS_CLIENT))) return html_error('TLS Startup Error.');
	}

	#########################################################################
	fwrite($fp, $request);
	fflush($fp);
	$timeStart = microtime(true);

	// Rewrote the get header function according to the proxy script
	// Also made sure it goes faster and I think 8192 is the best value for retrieving headers
	// Oops.. The previous function hooked up everything and now I'm returning it back to normal

	$llen = 0;
	$header = '';
	do {
		$header .= fgets($fp, 16384);
		$len = strlen($header);
		if (!$header || $len == $llen) {
			$lastError = lang(91);
			stream_socket_shutdown($fp, STREAM_SHUT_RDWR);
			fclose($fp);
			return false;
		}
		$llen = $len;
	} while (strpos($header, $nn . $nn) === false);

	// Array for active stream filters
	$sFilters = array();
	if (stripos($header, "\nTransfer-Encoding: chunked") !== false && in_array('dechunk', stream_get_filters())) {
		// Add built-in dechunk filter
		$sFilters['dechunk'] = stream_filter_append($fp, 'dechunk', STREAM_FILTER_READ);
		if (!$sFilters['dechunk'] && $saveToFile) return html_error('Unknown error while initializing dechunk filter, cannot continue download.');
	}

	#########################################################################

	if ($saveToFile) {
		if (!isset($_GET['dis_plug']) || $_GET['dis_plug'] != 'on') {
			$cbhost = (strpos($host, ':') !== false) ? substr($host, 0, strpos($host, ':')) : $host; // Remove the port that may be added when it's using proxy
			$chkhost = preg_match('/^\d{1,3}.\d{1,3}.\d{1,3}.\d{1,3}$/', $cbhost) ? false : true;
			if (!empty($referer)) {
				$cbrefhost = (stripos($referer, 'www.') === 0) ? substr($referer, 4) : $referer;
				$cbrefhost = parse_url($cbrefhost, PHP_URL_HOST);
				$chkref = (empty($cbrefhost) || preg_match('/^\d{1,3}.\d{1,3}.\d{1,3}.\d{1,3}$/', $cbrefhost)) ? false : (($chkhost && strtolower($cbhost) == strtolower($cbrefhost)) ? false : true);
			} else $chkref = false;
			$found = false;
			if ($chkhost || $chkref) foreach ($GLOBALS['host'] as $site => $file) {
				if ($chkhost && host_matches($site, $cbhost)) {
					$found = true;
					break;
				} elseif ($chkref && host_matches($site, $cbrefhost)) {
					$found = true;
					break;
				}
			}
			if ($found) {
				require_once(HOST_DIR . 'DownloadClass.php');
				require_once(HOST_DIR . "download/$file");
				$class = substr($file, 0, -4);
				$firstchar = substr($file, 0, 1);
				if ($firstchar > 0) $class = "d$class";
				if (class_exists($class) && method_exists($class, 'CheckBack')) { // is_callable(array($class , 'CheckBack'))
					$hostClass = new $class(false);
					$hostClass->CheckBack($header);
				}
			}
			unset($cbhost, $cbrefhost, $chkhost, $chkref, $found);
		}
		if (preg_match('/^HTTP\/1\.[0|1] (\d+) .*/', $header, $responsecode) && ($responsecode[1] == 404 || $responsecode[1] == 403)) {
			// Do some checking, please, at least tell them what error it was
			if ($responsecode [1] == 403) {
				$lastError = lang(92);
			} elseif ($responsecode [1] == 404) {
				$lastError = lang(93);
			} else {
				// Weird, it shouldn't come here...
				$lastError = lang(94);
			}
			return false;
		}
		//$bytesTotal = intval ( trim ( cut_str ( $header, "Content-Length:", "\n" ) ) );
		$bytesTotal = trim(cut_str($header, "\nContent-Length: ", "\n"));

		global $options;
		// Block downloads that don't provide file size (no Content-Length header)
		// DISABLED: Some servers don't send Content-Length for chunked/streaming transfers
		// if (!empty($options['require_content_length']) && (empty($bytesTotal) || !is_numeric($bytesTotal) || $bytesTotal <= 0)) {
		// 	$lastError = 'Download blocked: Server did not provide file size (Content-Length header missing). This is required for security.';
		// 	stream_socket_shutdown($fp, STREAM_SHUT_RDWR);
		// 	fclose($fp);
		// 	return false;
		// }
		if ($options['file_size_limit'] > 0 && ($bytesTotal > ($options['file_size_limit'] * 1024 * 1024))) {
			$lastError = lang(336) . bytesToKbOrMbOrGb ($options['file_size_limit'] * 1024 * 1024) . '.';
			return false;
		}
		if (stripos($header, "\nLocation: ") !== false && preg_match('/\nLocation: ([^\r\n]+)/i', $header, $redir)) {
			$redirect = trim($redir[1]);
			$lastError = sprintf(lang(95), $redirect);
			return FALSE;
		}
		if (in_array(cut_str($header, "\nWWW-Authenticate: ", ' '), array('Basic', 'Digest'))) {
			$lastError = lang(96);
			return FALSE;
		}
		//$ContentType = trim (cut_str($header, "\nContent-Type:", "\n")); // Unused
		if (!empty($Resume['use']) && $Resume['use'] === TRUE && stripos($header, "\nContent-Range: ") === false) {
			$lastError = (stripos($header, '503 Limit Exceeded') !== false) ? lang(97) : lang(98);
			return FALSE;
		}

		if ($force_name) $FileName = $force_name;
		else {
			$ContentDisposition = cut_str($header, "\nContent-Disposition: ", "\n");
			if (!empty($ContentDisposition) && stripos($ContentDisposition, 'filename') !== false) {
				if (preg_match("@filename\*=UTF-8''((?:[\w\-\.]|%[0-F]{2})+)@i", $ContentDisposition, $fn)) $FileName = rawurldecode($fn[1]);
				else if (preg_match('@filename=(\")?([^\r\n]+?)(?(1)\"|[;\r\n])@i', $ContentDisposition, $fn)) {
					if (preg_match('@&(?:[A-Z]+|#[0-9]+|#X[0-9A-F]+);@i', $fn[2])) $fn[3] = html_entity_decode($fn[2], ENT_QUOTES, 'UTF-8');
					$FileName = (empty($fn[3]) ? $fn[2] : $fn[3]);
				}
				else $FileName = $saveToFile;
			} else $FileName = $saveToFile;
		}
		$FileName = str_replace(array_merge(range(chr(0), chr(31)), str_split("<>:\"/|?*\x5C\x7F")), '', basename(trim($FileName)));

		$extPos = strrpos($FileName, '.');
		$ext = ($extPos ? substr($FileName, $extPos) : '');
		if (is_array($options['forbidden_filetypes']) && in_array(strtolower($ext), array_map('strtolower', $options['forbidden_filetypes']))) {
			if ($options['forbidden_filetypes_block']) return html_error(sprintf(lang(82), $ext));
			if (empty($options['rename_these_filetypes_to'])) $options['rename_these_filetypes_to'] = '.xxx';
			else if (strpos($options['rename_these_filetypes_to'], '.') === false) $options['rename_these_filetypes_to'] = '.' . $options['rename_these_filetypes_to'];
			$FileName = substr_replace($FileName, $options['rename_these_filetypes_to'], $extPos);
		}

		if (!empty($options['rename_prefix'])) $FileName = $options['rename_prefix'] . '_' . $FileName;
		if (!empty($options['rename_suffix'])) $FileName = ($extPos > 0 ? substr($FileName, 0, $extPos) : $FileName) . '_' . $options['rename_suffix'] . $ext;
		if (!empty($options['rename_underscore'])) $FileName = str_replace(array(' ', '%20'), '_', $FileName);

		$saveToFile = dirname($saveToFile) . PATH_SPLITTER . $FileName;

		if (!empty($Resume['use']) && $Resume['use'] !== TRUE && @file_exists($saveToFile)) {
			if ($options['bw_save']) return html_error(lang(99) . ': ' . link_for_file($saveToFile));
			$FileName = time() . '_' . $FileName;
			$saveToFile = dirname($saveToFile) . PATH_SPLITTER . $FileName;
		}
		$fs = @fopen($saveToFile, ((!empty($Resume['use']) && $Resume['use'] === TRUE) ? 'ab' : 'wb'));
		if (!$fs) {
			$lastError = sprintf(lang(101), $FileName, dirname($saveToFile)) . '<br />' . lang(102) . '<br /><a href="javascript:location.reload();">' . lang(103) . '</a>';
			return FALSE;
		}

		flock($fs, LOCK_EX);
		if (!empty($Resume['use']) && $Resume['use'] === TRUE && stripos($header, "\nContent-Range: ") !== false) {
			list($temp, $Resume['range']) = explode(' ', trim(cut_str($header, "\nContent-Range: ", "\n")));
			list($Resume['range'], $fileSize) = explode('/', $Resume['range']);
			$fileSizeBytes = (int)$fileSize;
			$fileSize = bytesToKbOrMbOrGb($fileSize);
		} else {
			$fileSizeBytes = (int)$bytesTotal;
			$fileSize = bytesToKbOrMbOrGb($bytesTotal);
		}
		
		// Create metadata file to track download progress for pending downloads display
		$metaFile = dirname($saveToFile) . '/.' . basename($saveToFile) . '.meta';
		@file_put_contents($metaFile, json_encode(array(
			'filename' => $FileName,
			'filesize' => $fileSizeBytes,
			'started' => time()
		)));
		
		$chunkSize = GetChunkSize($bytesTotal);
		echo(lang(104) . " <b>$FileName</b>, " . lang(56) . " <b>$fileSize</b>...<br />");

		//$scriptStarted = false;
		require_once(TEMPLATE_DIR . '/transloadui.php');
		if (!empty($Resume['use']) && $Resume['use'] === TRUE) {
			$received = bytesToKbOrMbOrGb(filesize($saveToFile));
			$percent = round($Resume['from'] / ($bytesTotal + $Resume['from']) * 100, 2);
			echo "<script type='text/javascript'>pr('$percent', '$received', '0');</script>";
			//$scriptStarted = true;
			flush();
		} else $Resume = array('use' => false, 'from' => 0, 'range' => 0);

		$time = $last = $lastChunkTime = $lastProgressTime = 0;
		do {
			$data = @fread($fp, $chunkSize);
			$datalen = strlen($data);
			if ($datalen <= 0) break;
			$bytesSaved = fwrite($fs, $data);
			if ($bytesSaved !== false && $datalen == $bytesSaved) {
				$bytesReceived += $bytesSaved;
				// Runtime size limit enforcement (catches chunked transfers with no Content-Length)
				if ($options['file_size_limit'] > 0 && ($bytesReceived + $Resume['from']) > ($options['file_size_limit'] * 1024 * 1024)) {
					flock($fs, LOCK_UN);
					fclose($fs);
					@unlink($saveToFile);
					$metaFile = dirname($saveToFile) . '/.' . basename($saveToFile) . '.meta';
					if (file_exists($metaFile)) @unlink($metaFile);
					$lastError = 'Download exceeded size limit of ' . bytesToKbOrMbOrGb($options['file_size_limit'] * 1024 * 1024) . '. Download aborted and file deleted.';
					stream_socket_shutdown($fp, STREAM_SHUT_RDWR);
					fclose($fp);
					return false;
				}
			} else {
				$lastError = sprintf(lang(105), $FileName);
				return false;
			}
			if ($bytesReceived >= $bytesTotal) $percent = 100;
			else $percent = @round(($bytesReceived + $Resume['from']) / ($bytesTotal + $Resume['from']) * 100, 2);
			// Update progress every 0.5 seconds or every chunk worth of data
			$now = microtime(true);
			$timeSinceLastProgress = $now - $timeStart - $lastProgressTime;
			if ($timeSinceLastProgress >= 0.5 || $bytesReceived >= $bytesTotal) {
				$received = bytesToKbOrMbOrGb($bytesReceived + $Resume['from']);
				$time = $now - $timeStart;
				$chunkTime = $time - $lastChunkTime;
				$chunkTime = ($chunkTime > 0) ? $chunkTime : 1;
				$lastChunkTime = $time;
				$lastProgressTime = $time;
				$speed = @round((($bytesReceived - $last) / 1024) / $chunkTime, 2);
				echo "<script type='text/javascript'>pr('$percent', '$received', '$speed');</script>";
				flush();
				$last = $bytesReceived;
				
				if (!empty($GLOBALS['current_download_id']) && function_exists('update_download_progress')) {
					update_download_progress($GLOBALS['current_download_id'], $bytesReceived + $Resume['from'], $bytesTotal + $Resume['from']);
				}
			}
		} while (!feof($fp));

		flock($fs, LOCK_UN);
		fclose($fs);
		if ($bytesReceived <= 0) {
			$lastError = lang(106);
			stream_socket_shutdown($fp, STREAM_SHUT_RDWR);
			fclose($fp);
			return FALSE;
		}
		// When dechunk filter is active, Content-Length includes chunk overhead
		// but bytesReceived is the actual data after dechunking, so they won't match.
		// Also handle cases where Content-Length is 0 or missing (chunked-only transfer).
		// Since we reached EOF successfully, the download is complete.
		if ($bytesReceived > 0 && ($bytesReceived != $bytesTotal)) {
			$bytesTotal = $bytesReceived;
			$fileSize = bytesToKbOrMbOrGb($bytesReceived);
		}
	} else {
		$length = trim(cut_str($header, "\nContent-Length: ", "\n"));
		if (!$length || !is_numeric($length)) $length = -1;
		$page = stream_get_contents($fp, $length);
	}

	stream_socket_shutdown($fp, STREAM_SHUT_RDWR);
	fclose($fp);
	if ($saveToFile) {
		// Cleanup metadata file on completion
		$metaFile = dirname($saveToFile) . '/.' . basename($saveToFile) . '.meta';
		if (file_exists($metaFile)) {
			@unlink($metaFile);
		}
		return array('time' => sec2time(round($time)), 'speed' => @round($bytesTotal / 1024 / (microtime(true) - $timeStart), 2), 'received' => true, 'size' => $fileSize, 'bytesReceived' => ($bytesReceived + $Resume['from']), 'bytesTotal' => ($bytesTotal + $Resume ['from']), 'file' => $saveToFile, 'name' => $FileName);
	} else {
		if (empty($sFilters['dechunk']) && stripos($header, "\nTransfer-Encoding: chunked") !== false && function_exists('http_chunked_decode')) {
			$dechunked = http_chunked_decode($page);
			if ($dechunked !== false) $page = $dechunked;
			unset($dechunked);
		}
		if (stripos($header, "\nContent-Encoding: gzip") !== false) {
			$decompressed = gzinflate(substr($page, 10));
			if ($decompressed !== false) $page = $decompressed;
			unset($decompressed);
		} else if (stripos($header, "\nContent-Encoding: deflate") !== false) {
			$decompressed = gzinflate(in_array(substr($page, 0, 2), array("x\x01", "x\x9C", "x\xDA")) ? substr($page, 2) : $page);
			if ($decompressed !== false) $page = $decompressed;
			unset($decompressed);
		}
		$page = $header.$page;
		return $page;
	}
}

function cURL($link, $cookie = 0, $post = 0, $referer = 0, $auth = 0, $opts = 0) {
	static $NSS, $ch, $lastProxy;
	if (empty($link) || !is_string($link)) return html_error(lang(24));
	if (!extension_loaded('curl') || !function_exists('curl_init') || !function_exists('curl_exec')) return html_error('cURL isn\'t enabled or cURL\'s functions are disabled');
	if (!empty($referer)) {
		$arr = array_map('trim', explode("\n", $referer));
		$referer = array_shift($arr);
		$header = array_filter($arr);
	} else $header = array();
	$link = str_replace(array(' ', "\r", "\n"), array('%20'), $link);
	$opt = array(CURLOPT_HEADER => 1, CURLOPT_SSL_VERIFYPEER => 0,
		CURLOPT_SSL_VERIFYHOST => 0, CURLOPT_RETURNTRANSFER => 1,
		CURLOPT_FOLLOWLOCATION => 0, CURLOPT_FAILONERROR => 0,
		CURLOPT_FORBID_REUSE => 0, CURLOPT_FRESH_CONNECT => 0,
		CURLINFO_HEADER_OUT => 1, CURLOPT_URL => $link,
		CURLOPT_SSLVERSION => (defined('CURL_SSLVERSION_TLSv1') ? CURL_SSLVERSION_TLSv1 : 1),
		CURLOPT_HTTP_VERSION => CURL_HTTP_VERSION_1_1,
		CURLOPT_ENCODING => 'gzip, deflate', CURLOPT_USERAGENT => rl_UserAgent);

	// Fixes "Unknown cipher in list: TLSv1" on cURL with NSS
	if (!isset($NSS)) {
		$cV = curl_version();
		$NSS = (!empty($cV['ssl_version']) && strtoupper(substr($cV['ssl_version'], 0, 4)) == 'NSS/');
	}
	if (!$NSS) $opt[CURLOPT_SSL_CIPHER_LIST] = 'TLSv1';


	// Uncomment next line if do you have IPv6 problems
	// $opt[CURLOPT_IPRESOLVE] = CURL_IPRESOLVE_V4;

	$opt[CURLOPT_REFERER] = !empty($referer) ? $referer : false;
	$opt[CURLOPT_COOKIE] = !empty($cookie) ? (is_array($cookie) ? CookiesToStr($cookie) : trim($cookie)) : false;

	if (!empty($_GET['useproxy']) && !empty($_GET['proxy'])) {
		$opt[CURLOPT_HTTPPROXYTUNNEL] = strtolower(parse_url($link, PHP_URL_SCHEME) == 'https') ? true : false; // cURL https proxy support... Experimental.
		// $opt[CURLOPT_HTTPPROXYTUNNEL] = false; // Uncomment this line for disable https proxy over curl.
		$opt[CURLOPT_PROXY] = $_GET['proxy'];
		$opt[CURLOPT_PROXYUSERPWD] = (!empty($GLOBALS['pauth']) ? base64_decode($GLOBALS['pauth']) : false);
	} else $opt[CURLOPT_PROXY] = false;

	// Send more headers...
	$headers = array('Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8', 'Accept-Language: en-US,en;q=0.5', 'Pragma: no-cache', 'Cache-Control: no-cache', 'Connection: Keep-Alive');
	if (empty($opt[CURLOPT_REFERER])) $headers[] = 'Referer:';
	if (empty($opt[CURLOPT_COOKIE])) $headers[] = 'Cookie:';
	if (!empty($opt[CURLOPT_PROXY]) && empty($opt[CURLOPT_PROXYUSERPWD])) $headers[] = 'Proxy-Authorization:';
	if (count($header) > 0) $headers = array_merge($headers, $header);
	$opt[CURLOPT_HTTPHEADER] = $headers;

	if ($post != '0') {
		$opt[CURLOPT_POST] = 1;
		$opt[CURLOPT_POSTFIELDS] = is_array($post) ? formpostdata($post) : $post;
	} else $opt[CURLOPT_HTTPGET] = 1;

	if ($auth) {
		$opt[CURLOPT_HTTPAUTH] = CURLAUTH_BASIC;
		$opt[CURLOPT_USERPWD] = base64_decode($auth);
	} else $opt[CURLOPT_HTTPAUTH] = false;

	$opt[CURLOPT_CONNECTTIMEOUT] = $opt[CURLOPT_TIMEOUT] = 120;
	if (is_array($opts) && count($opts) > 0) foreach ($opts as $O => $V) $opt[$O] = $V;

	if (!isset($lastProxy)) $lastProxy = $opt[CURLOPT_PROXY];
	if (!isset($ch)) $ch = curl_init();
	elseif ($lastProxy != $opt[CURLOPT_PROXY]) {
		// cURL seems that doesn't like switching proxies on a active resource, there is a bug about that @ https://bugs.php.net/bug.php?id=68211
		curl_close($ch);
		$ch = curl_init();
		$lastProxy = $opt[CURLOPT_PROXY];
	}

	foreach ($opt as $O => $V) curl_setopt($ch, $O, $V); // Using this instead of 'curl_setopt_array'

	$page = curl_exec($ch);
	$info = curl_getinfo($ch);
	$errz = curl_errno($ch);
	$errz2 = curl_error($ch);
	// curl_close($ch);

	if (substr($page, 9, 3) == '100' || !empty($opt[CURLOPT_PROXY])) $page = preg_replace("@^HTTP/1\.[01] \d{3}(?:\s[^\r\n]+)?\r\n\r\n(HTTP/1\.[01] \d+ [^\r\n]+)@i", "$1", $page, 1); // The "100 Continue" or "200 Connection established" can break some functions in plugins, lets remove it...
	if ($errz != 0) return html_error("[cURL:$errz] $errz2");

	return $page;
}

// This new function requires less line and actually reduces filesize :P
// Besides, using less globals means more variables available for us to use
function formpostdata($post=array()) {
	$postdata = '';
	foreach ($post as $k => $v) $postdata .= "$k=$v&";

	// Remove the last '&'
	$postdata = substr($postdata, 0, -1);
	return $postdata;
}

// function to convert an array of cookies into a string
function CookiesToStr($cookie=array()) {
	if (empty($cookie)) return '';
	$cookies = '';
	foreach ($cookie as $k => $v) $cookies .= "$k=$v; ";

	// Remove the last '; '
	$cookies = substr($cookies, 0, -2);
	return $cookies;
}

function GetCookies($content) {
	if (($hpos = strpos($content, "\r\n\r\n")) > 0) $content = substr($content, 0, $hpos); // We need only the headers
	if (empty($content) || stripos($content, "\nSet-Cookie: ") === false) return '';
	// The U option will make sure that it matches the first character
	// So that it won't grab other information about cookie such as expire, domain and etc
	preg_match_all('/\nSet-Cookie: (.*)(;|\r\n)/Ui', $content, $temp);
	$cookie = $temp[1];
	$cookie = implode('; ', $cookie);
	return $cookie;
}

/**
 * Function to get cookies & converted into array
 * @param string The content you want to get the cookie from
 * @param array Array of cookies to be updated [optional]
 * @param bool Options to remove "deleted" or expired cookies (usually it named as 'deleted') [optional]
 * @param mixed The default name for temporary cookie, values are accepted in an array [optional]
 */
function GetCookiesArr($content, $cookie=array(), $del=true, $dval=array('','deleted')) {
	if (!is_array($cookie)) $cookie = array();
	if (($hpos = strpos($content, "\r\n\r\n")) > 0) $content = substr($content, 0, $hpos); // We need only the headers
	if (empty($content) || stripos($content, "\nSet-Cookie: ") === false || !preg_match_all ('/\nSet-Cookie: ([^\r\n]+)/i', $content, $temp)) return $cookie;
	foreach ($temp[1] as $v) {
		if (strpos($v, ';') !== false) list($v, $p) = explode(';', $v, 2);
		else $p = false;
		$v = explode('=', $v, 2);
		$cookie[$v[0]] = $v[1];
		if ($del) {
			if (!is_array($dval)) $dval = array($dval);
			if (in_array($v[1], $dval)) unset($cookie[$v[0]]);
			elseif (!empty($p)) {
				if (stripos($p, 'Max-Age=') !== false && preg_match('/[ \;]?Max-Age=(-?\d+)/i', $p, $P) && (int)$P[1] < 1) unset($cookie[$v[0]]);
				elseif (stripos($p, 'expires=') !== false && preg_match('/[ \;]?expires=([a-zA-Z]{3}, \d{1,2} [a-zA-Z]{3} \d{4} \d{1,2}:\d{1,2}:\d{1,2} GMT)/i', $p, $P) && ($P = strtotime($P[1])) !== false && $P <= time()) unset($cookie[$v[0]]);
			}
		}
	}
	return $cookie;
}

/**
 * Function to convert a string of cookies into an array
 * @param string The existing string cookie value
 * @param array The existing array cookie value that we want to merged/updated [optional]
 * @param bool Options to remove temporary cookie (usually it named as 'deleted') [optional]
 * @param mixed The default name for temporary cookie, values are accepted in an array [optional]
 */
function StrToCookies($cookies, $cookie=array(), $del=true, $dval=array('','deleted')) {
	if (!is_array($cookie)) $cookie = array();
	$cookies = trim($cookies);
	if (empty($cookies)) return $cookie;
	foreach (array_filter(array_map('trim', explode(';', $cookies))) as $v) {
		$v = array_map('trim', explode('=', $v, 2));
		$cookie[$v[0]] = $v[1];
		if ($del) {
			if (!is_array($dval)) $dval = array($dval);
			if (in_array($v[1], $dval)) unset($cookie[$v[0]]);
		}
	}
	return $cookie;
}

/**
 * Detect correct file extension using magic bytes (file signatures)
 * @param string $filePath Path to the file
 * @return string|false Returns the correct extension (with dot) or false if unknown
 */
function detectExtensionByMagicBytes($filePath) {
	if (!is_file($filePath) || !is_readable($filePath)) return false;
	
	$fp = @fopen($filePath, 'rb');
	if (!$fp) return false;
	
	// Read first 16 bytes for signature detection
	$header = fread($fp, 16);
	fclose($fp);
	
	if (strlen($header) < 4) return false;
	
	// Magic bytes signatures (hex) => extension
	// Check longer signatures first for accuracy
	$signatures = array(
		// Video formats
		array('bytes' => "\x1A\x45\xDF\xA3", 'ext' => '.mkv'),    // Matroska/WebM
		array('bytes' => "\x00\x00\x00", 'check' => function($h) { // MP4/MOV/3GP family (ftyp box)
			if (strlen($h) < 8) return false;
			$box = substr($h, 4, 4);
			return ($box === 'ftyp') ? true : false;
		}, 'ext_fn' => function($h) {
			$brand = substr($h, 8, 4);
			if (in_array($brand, array('isom', 'iso2', 'mp41', 'mp42', 'M4V ', 'dash', 'avc1'))) return '.mp4';
			if (in_array($brand, array('qt  ', 'MSNV'))) return '.mov';
			if (in_array($brand, array('3gp4', '3gp5', '3gp6', '3ge6', '3ge7'))) return '.3gp';
			if (in_array($brand, array('M4A ', 'M4B '))) return '.m4a';
			return '.mp4'; // Default for ftyp
		}),
		array('bytes' => "\x46\x4C\x56\x01", 'ext' => '.flv'),    // FLV
		array('bytes' => "\x00\x00\x01\xBA", 'ext' => '.mpg'),    // MPEG
		array('bytes' => "\x00\x00\x01\xB3", 'ext' => '.mpg'),    // MPEG
		
		// Audio formats
		array('bytes' => "\x49\x44\x33", 'ext' => '.mp3'),        // MP3 with ID3
		array('bytes' => "\xFF\xFB", 'ext' => '.mp3'),             // MP3
		array('bytes' => "\xFF\xF3", 'ext' => '.mp3'),             // MP3
		array('bytes' => "\xFF\xF2", 'ext' => '.mp3'),             // MP3
		array('bytes' => "OggS", 'ext' => '.ogg'),                 // OGG
		array('bytes' => "fLaC", 'ext' => '.flac'),                // FLAC
		array('bytes' => "RIFF", 'check' => function($h) {        // WAV/AVI
			return strlen($h) >= 12;
		}, 'ext_fn' => function($h) {
			$type = substr($h, 8, 4);
			if ($type === 'WAVE') return '.wav';
			if ($type === 'AVI ') return '.avi';
			return false;
		}),
		
		// Image formats
		array('bytes' => "\x89PNG", 'ext' => '.png'),
		array('bytes' => "\xFF\xD8\xFF", 'ext' => '.jpg'),
		array('bytes' => "GIF87a", 'ext' => '.gif'),
		array('bytes' => "GIF89a", 'ext' => '.gif'),
		array('bytes' => "BM", 'ext' => '.bmp'),
		array('bytes' => "RIFF", 'check' => function($h) {
			return strlen($h) >= 12 && substr($h, 8, 4) === 'WEBP';
		}, 'ext' => '.webp'),
		
		// Archive formats
		array('bytes' => "PK\x03\x04", 'ext' => '.zip'),
		array('bytes' => "Rar!\x1A\x07", 'ext' => '.rar'),
		array('bytes' => "\x1F\x8B\x08", 'ext' => '.gz'),
		array('bytes' => "BZh", 'ext' => '.bz2'),
		array('bytes' => "\xFD\x37\x7A\x58\x5A\x00", 'ext' => '.xz'),
		array('bytes' => "\x37\x7A\xBC\xAF\x27\x1C", 'ext' => '.7z'),
		
		// Document formats
		array('bytes' => "%PDF", 'ext' => '.pdf'),
		array('bytes' => "\xD0\xCF\x11\xE0\xA1\xB1\x1A\xE1", 'ext' => '.doc'), // MS Office legacy
		
		// Executable
		array('bytes' => "MZ", 'ext' => '.exe'),
		
		// ISO
		// ISO9660 has signature at offset 32769, skip for now
	);
	
	foreach ($signatures as $sig) {
		$bytes = $sig['bytes'];
		$len = strlen($bytes);
		
		if (strlen($header) < $len) continue;
		
		if (substr($header, 0, $len) === $bytes) {
			// Custom check function
			if (isset($sig['check']) && !$sig['check']($header)) continue;
			
			// Custom extension function
			if (isset($sig['ext_fn'])) {
				$ext = $sig['ext_fn']($header);
				if ($ext !== false) return $ext;
				continue;
			}
			
			return $sig['ext'];
		}
	}
	
	return false;
}

/**
 * Fix file extension based on magic bytes detection
 * Renames the file if the detected extension differs from the current one
 * @param string $filePath Path to the downloaded file
 * @return string The (possibly updated) file path
 */
function fixFileExtension($filePath) {
	$detectedExt = detectExtensionByMagicBytes($filePath);
	if ($detectedExt === false) return $filePath;
	
	$currentExt = strtolower(pathinfo($filePath, PATHINFO_EXTENSION));
	$detectedExtClean = ltrim(strtolower($detectedExt), '.');
	
	// If extensions already match, no change needed
	if ($currentExt === $detectedExtClean) return $filePath;
	
	// Map equivalent extensions (don't rename these)
	$equivalents = array(
		'jpg' => array('jpeg', 'jpe', 'jfif'),
		'mpg' => array('mpeg', 'mpe'),
		'mp4' => array('m4v'),
		'gz' => array('tgz'),
		'doc' => array('xls', 'ppt', 'msi'), // All use same magic bytes
	);
	
	foreach ($equivalents as $main => $alts) {
		if ($detectedExtClean === $main && in_array($currentExt, $alts)) return $filePath;
		if (in_array($detectedExtClean, $alts) && $currentExt === $main) return $filePath;
	}
	
	// Rename the file with correct extension
	$dir = dirname($filePath);
	$baseName = pathinfo($filePath, PATHINFO_FILENAME);
	$newPath = $dir . PATH_SPLITTER . $baseName . $detectedExt;
	
	// Avoid overwriting
	if (file_exists($newPath)) {
		$newPath = $dir . PATH_SPLITTER . $baseName . '_' . time() . $detectedExt;
	}
	
	if (@rename($filePath, $newPath)) {
		echo "<br /><b>⚠ Extension corrected:</b> " . htmlspecialchars(basename($filePath)) . " → " . htmlspecialchars(basename($newPath)) . "<br />";
		return $newPath;
	}
	
	return $filePath;
}

function GetChunkSize($fsize) {
	if ($fsize <= 0) return 65536;         // 64KB default for unknown size
	if ($fsize < 65536) return intval($fsize);
	if ($fsize <= 1024 * 1024) return 65536;              // 64KB for < 1MB
	if ($fsize <= 1024 * 1024 * 10) return 131072;        // 128KB for < 10MB
	if ($fsize <= 1024 * 1024 * 50) return 262144;        // 256KB for < 50MB
	if ($fsize <= 1024 * 1024 * 100) return 524288;       // 512KB for < 100MB
	if ($fsize <= 1024 * 1024 * 500) return 1048576;      // 1MB for < 500MB
	if ($fsize <= 1024 * 1024 * 1024) return 2097152;     // 2MB for < 1GB
	return 4194304;                                        // 4MB for 1GB+
}

function upfile($host, $port, $url, $referer, $cookie, $post, $file, $filename, $fieldname, $field2name = '', $proxy = 0, $pauth = 0, $upagent = 0, $scheme = 'http') {
	global $nn, $lastError, $fp, $fs;

	if (empty($upagent)) $upagent = rl_UserAgent;
	$scheme = strtolower("$scheme://");

	$bound = '--------' . md5(microtime());
	$saveToFile = 0;

	$postdata = '';
	if (!empty($post) && is_array($post)) foreach ($post as $key => $value) {
		$postdata .= '--' . $bound . $nn;
		$postdata .= "Content-Disposition: form-data; name=\"$key\"$nn$nn";
		$postdata .= $value . $nn;
	}

	$fieldname = $fieldname ? $fieldname : 'file' . md5($filename);

	if (!is_readable($file)) {
		$lastError = sprintf(lang(65), $file);
		return FALSE;
	}

	$fileSize = filesize($file);

	if (!empty($field2name)) {
		$postdata .= '--' . $bound . $nn;
		$postdata .= "Content-Disposition: form-data; name=\"$field2name\"; filename=\"\"$nn";
		$postdata .= "Content-Type: application/octet-stream$nn$nn";
	}

	$postdata .= '--' . $bound . $nn;
	$postdata .= "Content-Disposition: form-data; name=\"$fieldname\"; filename=\"$filename\"$nn";
	$postdata .= "Content-Type: application/octet-stream$nn$nn";

	if (!empty($cookie)) {
		if (is_array($cookie)) $cookies = (count($cookie) > 0) ? CookiesToStr($cookie) : 0;
		else $cookies = trim($cookie);
	}

	if ($scheme == 'https://') {
		if (!extension_loaded('openssl')) return html_error('You need to install/enable PHP\'s OpenSSL extension to support uploading via HTTPS.');
		$scheme = 'ssl://';
		if ($port == 0 || $port == 80) $port = 443;
	} else if ($port == 0) $port = 80;

	if (!empty($referer) && ($pos = strpos("\r\n", $referer)) !== 0) {
		$origin = parse_url($pos ? substr($referer, 0, $pos) : $referer);
		$origin = strtolower($origin['scheme']) . '://' . strtolower($origin['host']) . (!empty($origin['port']) && $origin['port'] != defport(array('scheme' => $origin['scheme'])) ? ':' . $origin['port'] : '');
	} else $origin = ($scheme == 'ssl://' ? 'https://' : $scheme) . $host . ($port != 80 && ($scheme != 'ssl://' || $port != 443) ? ':' . $port : '');

	if ($proxy) {
		list($proxyHost, $proxyPort) = explode(':', $proxy, 2);
		if ($scheme != 'ssl://') {
			$host = $host . ($port != 80 && $port != 443 ? ":$port" : '');
			$url = "$scheme$host$url";
		}
	}

	if ($scheme != 'ssl://') $scheme = '';

	$cHeaders = readCustomHeaders($referer);
	$request = array();
	$request[''] = 'POST ' . str_replace(' ', '%20', $url) . ' HTTP/1.1';
	$request['host'] = $host;
	$request['user-agent'] = $upagent;
	$request['accept'] = 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8';
	$request['accept-encoding'] = 'gzip, deflate';
	$request['accept-language'] = 'en-US,en;q=0.5';
	if (!empty($referer)) $request['referer'] = $referer;
	if (!empty($cookies)) $request['cookie'] = $cookies;
	if (!empty($pauth) && !$scheme) $request['proxy-authorization'] = "Basic $pauth";
	$request['origin'] = $origin;
	$request['content-type'] = "multipart/form-data; boundary=$bound";
	$request['content-length'] = (strlen($postdata) + strlen($nn . "--" . $bound . "--" . $nn) + $fileSize);

	$request = headers2request(array_merge($request, $cHeaders), $postdata);

	$errno = 0;
	$errstr = '';
	if ($scheme == 'ssl://') {
		$hosts = (!empty($proxyHost) ? $proxyHost : $scheme . $host) . ':' . (!empty($proxyPort) ? $proxyPort : $port);
		if ($proxy) $url = "https://$host$url"; // For the 'connected to' message
	} else $hosts = (!empty($proxyHost) ? $scheme . $proxyHost : $scheme . $host) . ':' . (!empty($proxyPort) ? $proxyPort : $port);
	$fp = @stream_socket_client($hosts, $errno, $errstr, 120, STREAM_CLIENT_CONNECT);

	if (!$fp) {
		if (!function_exists('stream_socket_client')) return html_error('[ERROR] stream_socket_client() is disabled.');
		$dis_host = !empty($proxyHost) ? $proxyHost : $host;
		$dis_port = !empty($proxyPort) ? $proxyPort : $port;
		return html_error(sprintf(lang(88), $dis_host, $dis_port));
	}

	if ($errno || $errstr) {
		$lastError = $errstr;
		return false;
	}

	if ($proxy) echo '<p>' . sprintf(lang(89), $proxyHost, $proxyPort) . '<br />UPLOAD: <b>' . htmlspecialchars($url) . "</b>...<br />\n";
	else echo '<p>'.sprintf(lang(90), $host, $port).'</p>';

	if ($scheme == 'ssl://' && $proxy) {
		$connRequest = array();
		$connRequest[''] = "CONNECT $host:$port HTTP/1.1";
		if (!empty($pauth)) $connRequest['proxy-authorization'] = "Basic $pauth";
		$connRequest['proxy-connection'] = 'Close';
		$connRequest = headers2request($connRequest);

		fwrite($fp, $connRequest);
		fflush($fp);

		$llen = 0;
		$header = '';
		do {
			$header .= fgets($fp, 16384);
			$len = strlen($header);
			if (!$header || $len == $llen) {
				$lastError = 'No response from proxy after CONNECT.';
				stream_socket_shutdown($fp, STREAM_SHUT_RDWR);
				fclose($fp);
				return false;
			}
			$llen = $len;
		} while (strpos($header, $nn . $nn) === false);

		$status = intval(substr($header, 9, 3));
		if ($status != 200) {
			return html_error("Proxy returned $status after CONNECT.");
		}

		// Start TLS.
		if (!stream_socket_enable_crypto($fp, true, (defined('STREAM_CRYPTO_METHOD_TLSv1_2_CLIENT') ? STREAM_CRYPTO_METHOD_TLSv1_0_CLIENT | STREAM_CRYPTO_METHOD_TLSv1_1_CLIENT | STREAM_CRYPTO_METHOD_TLSv1_2_CLIENT : STREAM_CRYPTO_METHOD_TLS_CLIENT))) return html_error('TLS Startup Error.');
	}

	echo(lang(104) . ' <b>' . htmlspecialchars($filename) . '</b>, ' . lang(56) . ' <b>' . bytesToKbOrMbOrGb($fileSize) . '</b>...<br />');
	$GLOBALS['id'] = md5(time() * rand(0, 10));
	require (TEMPLATE_DIR . '/uploadui.php');
	flush();

	fwrite($fp, $request);
	fflush($fp);
	$timeStart = microtime(true);
	$chunkSize = GetChunkSize($fileSize);

	$fs = fopen($file, 'r');

	$totalsend = $time = $lastChunkTime = 0;
	while (!feof($fs) && !$errno && !$errstr) {
		$data = fread($fs, $chunkSize);
		if ($data === false) {
			fclose($fs);
			fclose($fp);
			return html_error(lang(112));
		}

		$sendbyte = @fwrite($fp, $data);
		fflush($fp);

		if ($sendbyte === false || strlen($data) > $sendbyte) {
			fclose($fs);
			fclose($fp);
			return html_error(lang(113));
		}

		$totalsend += $sendbyte;

		$time = microtime(true) - $timeStart;
		$chunkTime = $time - $lastChunkTime;
		$chunkTime = $chunkTime ? $chunkTime : 1;
		$chunkTime = ($chunkTime > 0) ? $chunkTime : 1;
		$lastChunkTime = $time;
		$speed = round($sendbyte / 1024 / $chunkTime, 2);
		$percent = round($totalsend / $fileSize * 100, 2);
		echo "<script type='text/javascript'>pr('$percent', '" . bytesToKbOrMbOrGb($totalsend) . "', '$speed');</script>\n";
		flush();
	}

	if ($errno || $errstr) {
		$lastError = $errstr;
		return false;
	}
	fclose($fs);

	fwrite($fp, $nn . "--" . $bound . "--" . $nn);
	fflush($fp);

	$llen = 0;
	$header = '';
	do {
		$header .= fgets($fp, 16384);
		$len = strlen($header);
		if (!$header || $len == $llen) {
			$lastError = lang(91);
			stream_socket_shutdown($fp, STREAM_SHUT_RDWR);
			fclose($fp);
			return false;
		}
		$llen = $len;
	} while (strpos($header, $nn . $nn) === false);

	// Array for active stream filters
	$sFilters = array();
	if (stripos($header, "\nTransfer-Encoding: chunked") !== false && in_array('dechunk', stream_get_filters())) $sFilters['dechunk'] = stream_filter_append($fp, 'dechunk', STREAM_FILTER_READ); // Add built-in dechunk filter

	$length = trim(cut_str($header, "\nContent-Length: ", "\n"));
	if (!$length || !is_numeric($length)) $length = -1;
	$page = stream_get_contents($fp, $length);

	stream_socket_shutdown($fp, STREAM_SHUT_RDWR);
	fclose($fp);

	if (empty($sFilters['dechunk']) && stripos($header, "\nTransfer-Encoding: chunked") !== false && function_exists('http_chunked_decode')) {
		$dechunked = http_chunked_decode($page);
		if ($dechunked !== false) $page = $dechunked;
		unset($dechunked);
	}
	if (stripos($header, "\nContent-Encoding: gzip") !== false) {
		$decompressed = gzinflate(substr($page, 10));
		if ($decompressed !== false) $page = $decompressed;
		unset($decompressed);
	} else if (stripos($header, "\nContent-Encoding: deflate") !== false) {
		$decompressed = gzinflate(in_array(substr($page, 0, 2), array("x\x01", "x\x9C", "x\xDA")) ? substr($page, 2) : $page);
		if ($decompressed !== false) $page = $decompressed;
		unset($decompressed);
	}
	$page = $header.$page;
	return $page;
}

/**
 * Check if a URL supports resume/partial downloads
 * @param string $url The URL to check
 * @param string $cookie Cookie string
 * @param string $referer Referer URL
 * @param string $proxy Proxy in host:port format
 * @param string $pauth Proxy auth
 * @param string $auth HTTP auth
 * @return array|false Returns array with 'supports_resume', 'content_length', 'filename' or false on error
 */
function checkResumeSupport($url, $cookie = '', $referer = '', $proxy = '', $pauth = '', $auth = '') {
    if (!extension_loaded('curl') || !function_exists('curl_init')) {
        return false;
    }
    
    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, $url);
    curl_setopt($ch, CURLOPT_NOBODY, true);
    curl_setopt($ch, CURLOPT_HEADER, true);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
    curl_setopt($ch, CURLOPT_MAXREDIRS, 10);
    curl_setopt($ch, CURLOPT_TIMEOUT, 30);
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
    curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, false);
    curl_setopt($ch, CURLOPT_USERAGENT, rl_UserAgent);
    
    if (!empty($cookie)) {
        curl_setopt($ch, CURLOPT_COOKIE, is_array($cookie) ? CookiesToStr($cookie) : $cookie);
    }
    if (!empty($referer)) {
        curl_setopt($ch, CURLOPT_REFERER, $referer);
    }
    if (!empty($proxy)) {
        curl_setopt($ch, CURLOPT_PROXY, $proxy);
        if (!empty($pauth)) {
            curl_setopt($ch, CURLOPT_PROXYUSERPWD, base64_decode($pauth));
        }
    }
    if (!empty($auth)) {
        curl_setopt($ch, CURLOPT_USERPWD, base64_decode($auth));
    }
    
    $headers = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $contentLength = curl_getinfo($ch, CURLINFO_CONTENT_LENGTH_DOWNLOAD);
    curl_close($ch);
    
    if ($httpCode < 200 || $httpCode >= 400) {
        return false;
    }
    
    // Check for Accept-Ranges header
    $supportsResume = (stripos($headers, 'Accept-Ranges: bytes') !== false);
    
    // Try to get filename from Content-Disposition
    $filename = '';
    if (preg_match('/Content-Disposition:.*filename[*]?=(?:UTF-8\'\')?["\']?([^"\'\r\n;]+)/i', $headers, $match)) {
        $filename = rawurldecode(trim($match[1], '"\''));
    }
    
    return array(
        'supports_resume' => $supportsResume,
        'content_length' => (int)$contentLength,
        'filename' => $filename
    );
}

/**
 * Download file using parallel chunks (like IDM)
 * @param string $url The URL to download
 * @param string $saveToFile The path to save the file
 * @param int $fileSize The total file size
 * @param int $numChunks Number of chunks (default 8)
 * @param string $cookie Cookie string
 * @param string $referer Referer URL
 * @param string $proxy Proxy in host:port format
 * @param string $pauth Proxy auth
 * @param string $auth HTTP auth
 * @return array|false Returns download info array or false on error
 */
function parallelDownload($url, $saveToFile, $fileSize, $numChunks = 8, $cookie = '', $referer = '', $proxy = '', $pauth = '', $auth = '') {
    global $nn, $lastError, $bytesReceived, $options, $force_name;
    
    if (!extension_loaded('curl') || !function_exists('curl_multi_init')) {
        $lastError = 'cURL multi not available';
        return false;
    }
    
    // Minimum chunk size of 1MB, reduce chunks for smaller files
    $minChunkSize = 1024 * 1024;
    if ($fileSize < $minChunkSize * $numChunks) {
        $numChunks = max(1, floor($fileSize / $minChunkSize));
    }
    
    $chunkSize = ceil($fileSize / $numChunks);
    $chunks = array();
    
    // Create chunk ranges
    for ($i = 0; $i < $numChunks; $i++) {
        $start = $i * $chunkSize;
        $end = min(($i + 1) * $chunkSize - 1, $fileSize - 1);
        $chunks[$i] = array(
            'start' => $start,
            'end' => $end,
            'size' => $end - $start + 1,
            'downloaded' => 0,
            'file' => dirname($saveToFile) . '/.chunk_' . md5($url) . '_' . $i . '.tmp'
        );
    }
    
    // Get filename
    $FileName = $force_name ? $force_name : basename($saveToFile);
    $FileName = str_replace(array_merge(range(chr(0), chr(31)), str_split("<>:\"/|?*\x5C\x7F")), '', basename(trim($FileName)));
    
    $extPos = strrpos($FileName, '.');
    $ext = ($extPos ? substr($FileName, $extPos) : '');
    if (is_array($options['forbidden_filetypes']) && in_array(strtolower($ext), array_map('strtolower', $options['forbidden_filetypes']))) {
        if ($options['forbidden_filetypes_block']) return html_error(sprintf(lang(82), $ext));
        if (empty($options['rename_these_filetypes_to'])) $options['rename_these_filetypes_to'] = '.xxx';
        elseif (strpos($options['rename_these_filetypes_to'], '.') === false) $options['rename_these_filetypes_to'] = '.' . $options['rename_these_filetypes_to'];
        $FileName = substr_replace($FileName, $options['rename_these_filetypes_to'], $extPos);
    }
    
    if (!empty($options['rename_prefix'])) $FileName = $options['rename_prefix'] . '_' . $FileName;
    if (!empty($options['rename_suffix'])) $FileName = ($extPos > 0 ? substr($FileName, 0, $extPos) : $FileName) . '_' . $options['rename_suffix'] . $ext;
    if (!empty($options['rename_underscore'])) $FileName = str_replace(array(' ', '%20'), '_', $FileName);
    
    $saveToFile = dirname($saveToFile) . PATH_SPLITTER . $FileName;
    
    // Check if file exists
    if (@file_exists($saveToFile)) {
        if ($options['bw_save']) return html_error(lang(99) . ': ' . link_for_file($saveToFile));
        $FileName = time() . '_' . $FileName;
        $saveToFile = dirname($saveToFile) . PATH_SPLITTER . $FileName;
    }
    
    // Create metadata file to track filename for pending downloads display
    $chunkHash = md5($url);
    $metaFile = dirname($saveToFile) . '/.chunk_' . $chunkHash . '.meta';
    @file_put_contents($metaFile, json_encode(array(
        'filename' => $FileName,
        'filesize' => $fileSize,
        'chunks' => $numChunks,
        'url' => $url,
        'started' => time()
    )));
    
    $fileSizeDisplay = bytesToKbOrMbOrGb($fileSize);
    echo(lang(104) . " <b>$FileName</b>, " . lang(56) . " <b>$fileSizeDisplay</b>...<br />");
    
    require_once(TEMPLATE_DIR . '/transloadui.php');
    flush();
    
    $timeStart = microtime(true);
    $mh = curl_multi_init();
    $handles = array();
    $fileHandles = array();
    
    // Initialize all chunk downloads
    for ($i = 0; $i < $numChunks; $i++) {
        $ch = curl_init();
        curl_setopt($ch, CURLOPT_URL, $url);
        curl_setopt($ch, CURLOPT_RANGE, $chunks[$i]['start'] . '-' . $chunks[$i]['end']);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, false);
        curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
        curl_setopt($ch, CURLOPT_MAXREDIRS, 10);
        curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
        curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, false);
        curl_setopt($ch, CURLOPT_USERAGENT, rl_UserAgent);
        curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 60);
        curl_setopt($ch, CURLOPT_TIMEOUT, 0); // No timeout for download
        
        if (!empty($cookie)) {
            curl_setopt($ch, CURLOPT_COOKIE, is_array($cookie) ? CookiesToStr($cookie) : $cookie);
        }
        if (!empty($referer)) {
            curl_setopt($ch, CURLOPT_REFERER, $referer);
        }
        if (!empty($proxy)) {
            curl_setopt($ch, CURLOPT_PROXY, $proxy);
            if (!empty($pauth)) {
                curl_setopt($ch, CURLOPT_PROXYUSERPWD, base64_decode($pauth));
            }
        }
        if (!empty($auth)) {
            curl_setopt($ch, CURLOPT_USERPWD, base64_decode($auth));
        }
        
        // Open chunk file for writing
        $fp = @fopen($chunks[$i]['file'], 'wb');
        if (!$fp) {
            $lastError = "Failed to create chunk file: " . $chunks[$i]['file'];
            curl_multi_close($mh);
            return false;
        }
        flock($fp, LOCK_EX);
        $fileHandles[$i] = $fp;
        curl_setopt($ch, CURLOPT_FILE, $fp);
        
        $handles[$i] = $ch;
        curl_multi_add_handle($mh, $ch);
    }
    
    // Execute all downloads in parallel
    $running = null;
    $lastUpdate = 0;
    $bytesReceived = 0;
    
    do {
        $status = curl_multi_exec($mh, $running);
        
        if ($status > CURLM_OK) {
            $lastError = 'cURL multi error: ' . curl_multi_strerror($status);
            break;
        }
        
        // Update progress every second
        $now = microtime(true);
        if ($now - $lastUpdate >= 1) {
            $totalDownloaded = 0;
            foreach ($handles as $i => $ch) {
                $info = curl_getinfo($ch);
                $totalDownloaded += $info['size_download'];
            }
            
            $bytesReceived = $totalDownloaded;
            $percent = $fileSize > 0 ? round($totalDownloaded / $fileSize * 100, 2) : 0;
            $time = $now - $timeStart;
            $speed = $time > 0 ? round($totalDownloaded / 1024 / $time, 2) : 0;
            $received = bytesToKbOrMbOrGb($totalDownloaded);
            
            echo "<script type='text/javascript'>pr('$percent', '$received', '$speed');</script>";
            flush();
            $lastUpdate = $now;
        }
        
        // Wait for activity
        if ($running > 0) {
            curl_multi_select($mh, 0.5);
        }
        
    } while ($running > 0);
    
    // Close all handles and file pointers
    $allSuccess = true;
    if (function_exists('rl_log')) rl_log('INFO', 'Parallel download chunks finished, checking results', array('filename' => $FileName, 'chunks' => $numChunks));
    foreach ($handles as $i => $ch) {
        $info = curl_getinfo($ch);
        $httpCode = $info['http_code'];
        $downloaded = $info['size_download'];
        $curlError = curl_error($ch);
        
        flock($fileHandles[$i], LOCK_UN);
        fclose($fileHandles[$i]);
        
        curl_multi_remove_handle($mh, $ch);
        curl_close($ch);
        
        // Check if chunk downloaded successfully
        if ($httpCode < 200 || $httpCode >= 400 || $downloaded < $chunks[$i]['size'] * 0.95) {
            $allSuccess = false;
            if (function_exists('rl_log')) rl_log('ERROR', 'Chunk failed', array('chunk' => $i, 'http_code' => $httpCode, 'downloaded' => $downloaded, 'expected' => $chunks[$i]['size'], 'curl_error' => $curlError));
        }
        $chunks[$i]['downloaded'] = $downloaded;
    }
    curl_multi_close($mh);
    
    if (!$allSuccess) {
        // Cleanup chunk files and metadata
        foreach ($chunks as $chunk) {
            if (file_exists($chunk['file'])) {
                @unlink($chunk['file']);
            }
        }
        if (isset($metaFile) && file_exists($metaFile)) {
            @unlink($metaFile);
        }
        $lastError = lang(106);
        return false;
    }
    
    // Merge chunks into final file — update meta to show "merging" status in pending downloads
    if (function_exists('rl_log')) rl_log('INFO', 'Starting chunk merge', array('filename' => $FileName, 'chunks' => $numChunks, 'totalSize' => bytesToKbOrMbOrGb($fileSize)));
    if (isset($metaFile)) {
        @file_put_contents($metaFile, json_encode(array(
            'filename' => $FileName,
            'filesize' => $fileSize,
            'chunks' => $numChunks,
            'url' => $url,
            'started' => time(),
            'status' => 'merging'
        )));
    }
    echo "<script type='text/javascript'>document.title='Merging Parts...';var _ht=document.getElementById('dl-heading-text');if(_ht)_ht.textContent='Merging Parts...';var _hd=document.getElementById('dl-heading');if(_hd)_hd.style.color='#f59e0b';var _pb=document.getElementById('progress');if(_pb){_pb.style.width='100%';_pb.style.background='linear-gradient(90deg,#f59e0b,#d97706)';}</script>\n";
    flush();
    $finalFp = @fopen($saveToFile, 'wb');
    if (!$finalFp) {
        $lastError = sprintf(lang(101), $FileName, dirname($saveToFile));
        foreach ($chunks as $chunk) {
            @unlink($chunk['file']);
        }
        if (isset($metaFile) && file_exists($metaFile)) {
            @unlink($metaFile);
        }
        return false;
    }
    
    flock($finalFp, LOCK_EX);
    $bytesReceived = 0;
    
    for ($i = 0; $i < $numChunks; $i++) {
        $chunkFp = @fopen($chunks[$i]['file'], 'rb');
        if ($chunkFp === false) {
            flock($finalFp, LOCK_UN);
            fclose($finalFp);
            @unlink($saveToFile);
            foreach ($chunks as $chunk) {
                @unlink($chunk['file']);
            }
            if (isset($metaFile) && file_exists($metaFile)) {
                @unlink($metaFile);
            }
            $lastError = 'Failed to read chunk ' . $i;
            if (function_exists('rl_log')) rl_log('ERROR', 'Chunk merge failed', array('chunk' => $i, 'file' => $chunks[$i]['file']));
            return false;
        }
        // Stream copy chunk to final file (memory-safe for large files)
        while (!feof($chunkFp)) {
            $buf = fread($chunkFp, 8 * 1024 * 1024); // 8MB buffer
            if ($buf === false) break;
            fwrite($finalFp, $buf);
            $bytesReceived += strlen($buf);
        }
        fclose($chunkFp);
        @unlink($chunks[$i]['file']);
    }
    
    flock($finalFp, LOCK_UN);
    fclose($finalFp);
    
    // Cleanup metadata file
    if (isset($metaFile) && file_exists($metaFile)) {
        @unlink($metaFile);
    }
    
    $time = microtime(true) - $timeStart;
    $speed = $time > 0 ? round($bytesReceived / 1024 / $time, 2) : 0;
    
    echo '<script type="text/javascript">pr(100, \'' . bytesToKbOrMbOrGb($bytesReceived) . '\', \'' . $speed . '\')</script>';
    flush();
    
    return array(
        'time' => sec2time(round($time)),
        'speed' => $speed,
        'received' => true,
        'size' => $fileSizeDisplay,
        'bytesReceived' => $bytesReceived,
        'bytesTotal' => $fileSize,
        'file' => $saveToFile,
        'name' => $FileName
    );
}

function putfile($host, $port, $url, $referer, $cookie, $file, $filename, $proxy = 0, $pauth = 0, $upagent = 0, $scheme = 'http') {
	global $nn, $lastError, $fp, $fs;

	if (empty($upagent)) $upagent = rl_UserAgent;
	$scheme = strtolower("$scheme://");

	if (!is_readable($file)) {
		$lastError = sprintf(lang(65), $file);
		return FALSE;
	}

	$fileSize = filesize($file);

	if (!empty($cookie)) {
		if (is_array($cookie)) $cookies = (count($cookie) > 0) ? CookiesToStr($cookie) : 0;
		else $cookies = trim($cookie);
	}

	if ($scheme == 'https://') {
		if (!extension_loaded('openssl')) return html_error('You need to install/enable PHP\'s OpenSSL extension to support uploading via HTTPS.');
		$scheme = 'ssl://';
		if ($port == 0 || $port == 80) $port = 443;
	} else if ($port == 0) $port = 80;

	if (!empty($referer) && ($pos = strpos("\r\n", $referer)) !== 0) {
		$origin = parse_url($pos ? substr($referer, 0, $pos) : $referer);
		$origin = strtolower($origin['scheme']) . '://' . strtolower($origin['host']) . (!empty($origin['port']) && $origin['port'] != defport(array('scheme' => $origin['scheme'])) ? ':' . $origin['port'] : '');
	} else $origin = ($scheme == 'ssl://' ? 'https://' : $scheme) . $host . ($port != 80 && ($scheme != 'ssl://' || $port != 443) ? ':' . $port : '');

	if ($proxy) {
		list($proxyHost, $proxyPort) = explode(':', $proxy, 2);
		if ($scheme != 'ssl://') {
			$host = $host . ($port != 80 && $port != 443 ? ":$port" : '');
			$url = "$scheme$host$url";
		}
	}

	if ($scheme != 'ssl://') $scheme = '';

	$cHeaders = readCustomHeaders($referer);
	$request = array();
	$request[''] = 'PUT ' . str_replace(' ', '%20', $url) . ' HTTP/1.1';
	$request['host'] = $host;
	$request['user-agent'] = $upagent;
	$request['accept'] = 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8';
	$request['accept-encoding'] = 'gzip, deflate';
	$request['accept-language'] = 'en-US,en;q=0.5';
	if (!empty($referer)) $request['referer'] = $referer;
	if (!empty($cookies)) $request['cookie'] = $cookies;
	if (!empty($pauth) && !$scheme) $request['proxy-authorization'] = "Basic $pauth";
	$request['origin'] = $origin;
	$request['content-disposition'] = 'attachment';
	$request['content-type'] = 'multipart/form-data';
	$request['x-file-name'] = $filename;
	$request['x-file-size'] = $request['content-length'] = $fileSize;

	$request = headers2request(array_merge($request, $cHeaders));

	$errno = 0;
	$errstr = '';
	if ($scheme == 'ssl://') {
		$hosts = (!empty($proxyHost) ? $proxyHost : $scheme . $host) . ':' . (!empty($proxyPort) ? $proxyPort : $port);
		if ($proxy) $url = "https://$host$url"; // For the 'connected to' message
	} else $hosts = (!empty($proxyHost) ? $scheme . $proxyHost : $scheme . $host) . ':' . (!empty($proxyPort) ? $proxyPort : $port);
	$fp = @stream_socket_client($hosts, $errno, $errstr, 120, STREAM_CLIENT_CONNECT);

	if (!$fp) {
		if (!function_exists('stream_socket_client')) return html_error('[ERROR] stream_socket_client() is disabled.');
		$dis_host = !empty($proxyHost) ? $proxyHost : $host;
		$dis_port = !empty($proxyPort) ? $proxyPort : $port;
		return html_error(sprintf(lang(88), $dis_host, $dis_port));
	}

	if ($errno || $errstr) {
		$lastError = $errstr;
		return false;
	}

	if ($proxy) echo '<p>' . sprintf(lang(89), $proxyHost, $proxyPort) . '<br />PUT: <b>' . htmlspecialchars($url) . "</b>...<br />\n";
	else echo '<p>'.sprintf(lang(90), $host, $port).'</p>';

	if ($scheme == 'ssl://' && $proxy) {
		$connRequest = array();
		$connRequest[''] = "CONNECT $host:$port HTTP/1.1";
		if (!empty($pauth)) $connRequest['proxy-authorization'] = "Basic $pauth";
		$connRequest['proxy-connection'] = 'Close';
		$connRequest = headers2request($connRequest);

		fwrite($fp, $connRequest);
		fflush($fp);

		$llen = 0;
		$header = '';
		do {
			$header .= fgets($fp, 16384);
			$len = strlen($header);
			if (!$header || $len == $llen) {
				$lastError = 'No response from proxy after CONNECT.';
				stream_socket_shutdown($fp, STREAM_SHUT_RDWR);
				fclose($fp);
				return false;
			}
			$llen = $len;
		} while (strpos($header, $nn . $nn) === false);

		$status = intval(substr($header, 9, 3));
		if ($status != 200) {
			return html_error("Proxy returned $status after CONNECT.");
		}

		// Start TLS.
		if (!stream_socket_enable_crypto($fp, true, (defined('STREAM_CRYPTO_METHOD_TLSv1_2_CLIENT') ? STREAM_CRYPTO_METHOD_TLSv1_0_CLIENT | STREAM_CRYPTO_METHOD_TLSv1_1_CLIENT | STREAM_CRYPTO_METHOD_TLSv1_2_CLIENT : STREAM_CRYPTO_METHOD_TLS_CLIENT))) return html_error('TLS Startup Error.');
	}

	echo(lang(104) . ' <b>' . htmlspecialchars($filename) . '</b>, ' . lang(56) . ' <b>' . bytesToKbOrMbOrGb($fileSize) . '</b>...<br />');
	$GLOBALS['id'] = md5(time() * rand(0, 10));
	require (TEMPLATE_DIR . '/uploadui.php');
	flush();

	fwrite($fp, $request);
	fflush($fp);
	$timeStart = microtime(true);
	$chunkSize = GetChunkSize($fileSize);

	$fs = fopen($file, 'r');

	$totalsend = $time = $lastChunkTime = 0;
	while (!feof($fs) && !$errno && !$errstr) {
		$data = fread($fs, $chunkSize);
		if ($data === false) {
			fclose($fs);
			fclose($fp);
			return html_error(lang(112));
		}

		$sendbyte = @fwrite($fp, $data);
		fflush($fp);

		if ($sendbyte === false || strlen($data) > $sendbyte) {
			fclose($fs);
			fclose($fp);
			return html_error(lang(113));
		}

		$totalsend += $sendbyte;

		$time = microtime(true) - $timeStart;
		$chunkTime = $time - $lastChunkTime;
		$chunkTime = ($chunkTime > 0) ? $chunkTime : 1;
		$lastChunkTime = $time;
		$speed = round($sendbyte / 1024 / $chunkTime, 2);
		$percent = round($totalsend / $fileSize * 100, 2);
		echo "<script type='text/javascript'>pr('$percent', '" . bytesToKbOrMbOrGb($totalsend) . "', '$speed');</script>\n";
		flush();
	}

	if ($errno || $errstr) {
		$lastError = $errstr;
		return false;
	}
	fclose($fs);

	fflush($fp);

	$llen = 0;
	$header = '';
	do {
		$header .= fgets($fp, 16384);
		$len = strlen($header);
		if (!$header || $len == $llen) {
			$lastError = lang(91);
			stream_socket_shutdown($fp, STREAM_SHUT_RDWR);
			fclose($fp);
			return false;
		}
		$llen = $len;
	} while (strpos($header, $nn . $nn) === false);

	// Array for active stream filters
	$sFilters = array();
	if (stripos($header, "\nTransfer-Encoding: chunked") !== false && in_array('dechunk', stream_get_filters())) $sFilters['dechunk'] = stream_filter_append($fp, 'dechunk', STREAM_FILTER_READ); // Add built-in dechunk filter

	$length = trim(cut_str($header, "\nContent-Length: ", "\n"));
	if (!$length || !is_numeric($length)) $length = -1;
	$page = stream_get_contents($fp, $length);

	stream_socket_shutdown($fp, STREAM_SHUT_RDWR);
	fclose($fp);

	if (empty($sFilters['dechunk']) && stripos($header, "\nTransfer-Encoding: chunked") !== false && function_exists('http_chunked_decode')) {
		$dechunked = http_chunked_decode($page);
		if ($dechunked !== false) $page = $dechunked;
		unset($dechunked);
	}
	if (stripos($header, "\nContent-Encoding: gzip") !== false) {
		$decompressed = gzinflate(substr($page, 10));
		if ($decompressed !== false) $page = $decompressed;
		unset($decompressed);
	} else if (stripos($header, "\nContent-Encoding: deflate") !== false) {
		$decompressed = gzinflate(in_array(substr($page, 0, 2), array("x\x01", "x\x9C", "x\xDA")) ? substr($page, 2) : $page);
		if ($decompressed !== false) $page = $decompressed;
		unset($decompressed);
	}
	$page = $header.$page;
	return $page;
}
