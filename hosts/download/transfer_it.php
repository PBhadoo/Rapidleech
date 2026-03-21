<?php
if (!defined('RAPIDLEECH')) {
	require_once('index.html');
	exit;
}

/**
 * Transfer.it Download Plugin
 * Transfer.it is powered by MEGA's infrastructure. Files are AES-CTR encrypted.
 * 
 * API Flow:
 * 1. POST gmf to g.api.mega.co.nz -> get config
 * 2. POST xi to API server -> get transfer info (name, size, server)
 * 3. POST f to API server with x=transferId -> get file nodes with raw keys
 * 4. POST g to API server with x=transferId -> get download URL
 * 5. Download with AES-CTR decryption (same as MEGA)
 */
class transfer_it extends DownloadClass {
	private $seqno;
	private $useOpenSSL;
	private $useOldFilter;
	private $apiServer;

	public function Download($link) {
		$this->checkCryptDependences();
		$this->seqno = mt_rand();

		// Extract transfer ID from URL
		// Formats: 
		//   transfer.it/t/ID              -> list/download all files
		//   transfer.it/t/ID/HANDLE#KEY   -> direct single file (from auto-downloader)
		if (!preg_match('@transfer\.it/t/([a-zA-Z0-9_\-]+)(?:/([a-zA-Z0-9_\-]+))?@i', $link, $match)) {
			html_error('Invalid transfer.it link. Expected format: https://transfer.it/t/TRANSFER_ID');
		}
		$transferId = $match[1];
		$directHandle = !empty($match[2]) ? $match[2] : null;
		$directKey = null;

		// Check for key in URL fragment (#key)
		if (preg_match('@#(.+)$@', $link, $km)) {
			$directKey = $km[1];
		}

		$this->changeMesg(lang(300) . '<br />Transfer.it plugin (powered by MEGA)');

		// If we have both handle and key from auto-downloader, download directly
		if ($directHandle && $directKey) {
			$keyA32 = $this->base64_to_a32($directKey);
			if (count($keyA32) >= 8) {
				$aesKey = array(
					$keyA32[0] ^ $keyA32[4],
					$keyA32[1] ^ $keyA32[5],
					$keyA32[2] ^ $keyA32[6],
					$keyA32[3] ^ $keyA32[7]
				);
				// Decrypt attributes via g API to get filename
				$dlReply = $this->apiReq(
					array('a' => 'g', 'g' => 1, 'n' => $directHandle, 'ssl' => 0),
					$transferId
				);
				if (!is_numeric($dlReply[0]) && !empty($dlReply[0]['g'])) {
					$fname = 'transfer_it_file';
					if (!empty($dlReply[0]['at'])) {
						$attr = $this->dec_attr($this->base64url_decode($dlReply[0]['at']), $aesKey);
						if ($attr && !empty($attr['n'])) $fname = $attr['n'];
					}
					$this->RedirectDownload($dlReply[0]['g'], $fname, 0, 0, $link, 0, 0, array('T8[fkey]' => $directKey));
					return;
				}
				if (is_numeric($dlReply[0])) $this->checkErr($dlReply[0]);
			}
		}

		// Step 1: Get transfer info via xi call
		$xiReply = $this->apiReqGlobal(array('a' => 'xi', 'xh' => $transferId));
		if (is_numeric($xiReply[0])) $this->checkErr($xiReply[0]);

		// Step 2: Fetch file list with x=transferId
		$files = $this->apiReq(
			array('a' => 'f', 'c' => 1, 'r' => 1, 'xnc' => 1),
			$transferId
		);

		if (is_numeric($files[0])) $this->checkErr($files[0]);
		if (empty($files[0]['f']) || !is_array($files[0]['f'])) {
			html_error('No files found in this transfer, or the transfer has expired.');
		}

		// Step 3: Parse the file tree
		$nodes = $files[0]['f'];
		$fileNodes = array();

		foreach ($nodes as $node) {
			if ($node['t'] == 0) {
				// File node - key is raw (NOT encrypted with folder key)
				$rawKey = $node['k'];
				
				// Handle keys in format "handle:key" or "handle:key/handle:key"
				if (strpos($rawKey, '/') !== false || strpos($rawKey, ':') !== false) {
					$parts = explode('/', $rawKey);
					$found = '';
					foreach ($parts as $part) {
						if (strpos($part, ':') !== false) {
							list(, $found) = explode(':', $part, 2);
							break;
						}
					}
					if (!empty($found)) $rawKey = $found;
				}
				
				$keyA32 = $this->base64_to_a32($rawKey);

				if (count($keyA32) < 8) continue;

				// Derive AES key by XOR-ing halves
				$aesKey = array(
					$keyA32[0] ^ $keyA32[4],
					$keyA32[1] ^ $keyA32[5],
					$keyA32[2] ^ $keyA32[6],
					$keyA32[3] ^ $keyA32[7]
				);

				// Decrypt attributes to get filename
				$attr = $this->dec_attr($this->base64url_decode($node['a']), $aesKey);
				if ($attr === false || empty($attr['n'])) continue;

				$fileNodes[] = array(
					'handle' => $node['h'],
					'name' => $attr['n'],
					'size' => isset($node['s']) ? $node['s'] : 0,
					'key_b64' => $rawKey,
				);
			}
		}

		if (empty($fileNodes)) {
			html_error('No downloadable files found in this transfer.');
		}

		// Step 4: Download
		if (count($fileNodes) == 1) {
			$this->downloadFile($fileNodes[0], $transferId, $link);
		} else {
			// Multiple files
			echo '<div style="text-align:center;padding:20px;">';
			echo '<h3>Transfer.it - ' . count($fileNodes) . ' files found</h3>';
			echo '<p>Total: ' . $this->formatSize(array_sum(array_column($fileNodes, 'size'))) . '</p>';
			echo '<table class="filelist" style="width:100%;margin:20px 0;">';
			echo '<tr class="flisttblhdr"><td><b>Filename</b></td><td><b>Size</b></td></tr>';
			foreach ($fileNodes as $f) {
				echo '<tr class="flistmouseoff"><td>' . htmlspecialchars($f['name']) . '</td><td>' . $this->formatSize($f['size']) . '</td></tr>';
			}
			echo '</table>';
			echo '</div>';

			// Build links for auto-downloader - encode handle and key in URL
			$links = array();
			foreach ($fileNodes as $f) {
				$links[] = 'https://transfer.it/t/' . $transferId . '/' . urlencode($f['handle']) . '#' . $f['key_b64'];
			}
			$this->moveToAutoDownloader($links);
		}
	}

	private function downloadFile($file, $transferId, $link) {
		// Request download URL from MEGA API
		$dlReply = $this->apiReq(
			array('a' => 'g', 'g' => 1, 'n' => $file['handle'], 'ssl' => 0),
			$transferId
		);
		if (is_numeric($dlReply[0])) $this->checkErr($dlReply[0]);
		if (!empty($dlReply[0]['e']) && is_numeric($dlReply[0]['e'])) $this->checkErr($dlReply[0]['e']);
		if (empty($dlReply[0]['g'])) html_error('Could not get download URL from transfer.it/MEGA.');

		// Pass the full key (8 int32s as base64) for AES-CTR decryption in CheckBack
		$this->RedirectDownload($dlReply[0]['g'], $file['name'], 0, 0, $link, 0, 0, array('T8[fkey]' => $file['key_b64']));
	}

	/**
	 * CheckBack is called by the download framework after HTTP headers are received.
	 * Sets up AES-CTR stream decryption filter (same as MEGA).
	 */
	public function CheckBack($header) {
		if (($statuscode = intval(substr($header, 9, 3))) != 200) {
			switch ($statuscode) {
				case 509: html_error('[Transfer.it] Transfer quota exceeded.');
				case 503: html_error('[Transfer.it] Too many connections.');
				case 403: html_error('[Transfer.it] Link expired.');
				case 404: html_error('[Transfer.it] File not found.');
				default : html_error('[Transfer.it][HTTP] ' . trim(substr($header, 9, strpos($header, "\n") - 8)));
			}
		}

		global $fp, $sFilters;
		if (empty($fp) || !is_resource($fp)) html_error("Error: Your rapidleech version is outdated.");
		$this->checkCryptDependences();

		// Get the file key from URL params
		if (!empty($_GET['T8']['fkey'])) {
			$key = $this->base64_to_a32(urldecode($_GET['T8']['fkey']));
		} else {
			// Try to extract from referer URL fragment
			if (preg_match('@transfer\.it/t/[^/]+/[^#]+#(.+)$@', $_GET['referer'], $m)) {
				$key = $this->base64_to_a32(urldecode($m[1]));
			} else {
				html_error("[Transfer.it] File key not found.");
			}
		}

		if (count($key) < 8) html_error("[Transfer.it] Invalid file key.");

		// IV: elements [4,5] from the full key, plus two zeros (CTR nonce)
		$iv = array($key[4], $key[5], 0, 0);
		// AES key: XOR of the two halves
		$aesKey = array($key[0] ^ $key[4], $key[1] ^ $key[5], $key[2] ^ $key[6], $key[3] ^ $key[7]);

		$opts = array(
			'iv' => $this->a32_to_str($iv),
			'key' => $this->a32_to_str($aesKey)
		);

		// Register AES-CTR decryption stream filter
		$filterClass = $this->useOldFilter ? 'Th3822_MegaDlDecrypt_Old' : 'Th3822_MegaDlDecrypt';
		if (!in_array('MegaDlDecrypt', stream_get_filters())) {
			if (!stream_filter_register('MegaDlDecrypt', $filterClass)) {
				html_error('Error: Cannot register decryption filter.');
			}
		}

		if (!isset($sFilters) || !is_array($sFilters)) $sFilters = array();
		if (empty($sFilters['MegaDlDecrypt'])) {
			$sFilters['MegaDlDecrypt'] = stream_filter_append($fp, 'MegaDlDecrypt', STREAM_FILTER_READ, $opts);
		}
		if (!$sFilters['MegaDlDecrypt']) html_error('Error: Failed to initialize decryption filter.');
	}

	// ============================================
	// API Methods
	// ============================================

	/**
	 * Global API call (to g.api.mega.co.nz without transfer context)
	 * Used for xi (transfer info) which also tells us which API server to use
	 */
	private function apiReqGlobal($attr) {
		$url = 'https://g.api.mega.co.nz/cs?id=' . ($this->seqno++) . '&v=3&lang=en&domain=transferit&bc=1';

		$page = $this->GetPage(
			$url,
			0,
			json_encode(array($attr)),
			"https://transfer.it/\r\nContent-Type: text/plain;charset=UTF-8"
		);

		list($header, $body) = array_map('trim', explode("\r\n\r\n", $page, 2));

		// Extract the API server from the response URL redirect or use default
		// The actual server is determined by the response - we use the server from the URL
		if (preg_match('@https?://([a-z0-9]+\.api\.mega\.co\.nz)@i', $url, $sm)) {
			$this->apiServer = 'https://' . $sm[1];
		}

		// Also try to detect server from redirect or just use g.api
		$this->apiServer = 'https://g.api.mega.co.nz';

		if (is_numeric(trim($body))) return array(intval(trim($body)));
		$result = @json_decode($body, true);
		if ($result === null) html_error('Invalid API response.');
		return $result;
	}

	/**
	 * Transfer-specific API call (with x=transferId parameter)
	 */
	private function apiReq($attr, $transferId) {
		$try = 0;
		do {
			if ($try > 0) sleep(2);
			$ret = $this->doApiReq($attr, $transferId);
			$try++;
		} while ($try < 6 && isset($ret[0]) && $ret[0] === -3);
		return $ret;
	}

	private function doApiReq($attr, $transferId) {
		$url = 'https://g.api.mega.co.nz/cs?id=' . ($this->seqno++) 
			 . '&v=3&lang=en&domain=transferit&x=' . urlencode($transferId) . '&bc=1';

		$page = $this->GetPage(
			$url,
			0,
			json_encode(array($attr)),
			"https://transfer.it/\r\nContent-Type: text/plain;charset=UTF-8"
		);

		if (in_array(intval(substr($page, 9, 3)), array(500, 503))) return array(-3);
		list($header, $body) = array_map('trim', explode("\r\n\r\n", $page, 2));

		if (is_numeric(trim($body))) return array(intval(trim($body)));
		$result = @json_decode($body, true);
		if ($result === null) html_error('Invalid API response from MEGA.');
		return $result;
	}

	private function checkErr($code) {
		$errors = array(
			-1 => 'Internal error',
			-2 => 'Invalid arguments',
			-3 => 'Temporary server error, try again',
			-4 => 'Rate limited, wait and try again',
			-9 => 'Transfer not found or expired',
			-11 => 'Access violation',
			-14 => 'Decryption failed',
			-16 => 'Transfer blocked or unavailable',
			-17 => 'Over quota',
			-18 => 'Temporarily unavailable',
		);
		$msg = isset($errors[$code]) ? $errors[$code] : 'Unknown error';
		html_error("Transfer.it Error: [$code] $msg");
	}

	// ============================================
	// Crypto Functions (same as MEGA)
	// ============================================

	private function checkCryptDependences() {
		$this->useOpenSSL = (version_compare(PHP_VERSION, '5.4.0', '>=') && extension_loaded('openssl') && in_array('aes-128-cbc', ($ossl_ciphers = openssl_get_cipher_methods()), true));

		if (!$this->useOpenSSL || !in_array('aes-128-ctr', $ossl_ciphers, true)) {
			$this->useOldFilter = true;
			if (!extension_loaded('mcrypt') || !in_array('rijndael-128', mcrypt_list_algorithms(), true)) {
				html_error("OpenSSL / Mcrypt module isn't installed or doesn't support the needed encryption.");
			}
		} else {
			$this->useOldFilter = false;
		}
	}

	private function str_to_a32($b) {
		$b = str_pad($b, 4 * ceil(strlen($b) / 4), "\0");
		return array_values(unpack('N*', $b));
	}

	private function a32_to_str($hex) {
		return call_user_func_array('pack', array_merge(array('N*'), $hex));
	}

	private function base64url_encode($data) {
		return strtr(rtrim(base64_encode($data), '='), '+/', '-_');
	}

	private function base64url_decode($data) {
		if (($s = (2 - strlen($data) * 3) % 4) < 2) $data .= substr(',,', $s);
		return base64_decode(strtr($data, '-_,', '+/='));
	}

	private function base64_to_a32($s) {
		return $this->str_to_a32($this->base64url_decode($s));
	}

	private function a32_to_base64($a) {
		return $this->base64url_encode($this->a32_to_str($a));
	}

	private function aes_cbc_decrypt($data, $key) {
		if ($this->useOpenSSL) {
			$data = str_pad($data, 16 * ceil(strlen($data) / 16), "\0");
			return openssl_decrypt($data, 'aes-128-cbc', $key, OPENSSL_RAW_DATA | OPENSSL_ZERO_PADDING, "\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0");
		} else {
			return mcrypt_decrypt(MCRYPT_RIJNDAEL_128, $key, $data, MCRYPT_MODE_CBC, "\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0");
		}
	}

	private function dec_attr($attr, $key) {
		$attr = trim($this->aes_cbc_decrypt($attr, $this->a32_to_str($key)));
		if (substr($attr, 0, 6) != 'MEGA{"') return false;
		$attr = substr($attr, 4);
		$attr = substr($attr, 0, strrpos($attr, '}') + 1);
		return @json_decode($attr, true);
	}

	private function formatSize($bytes) {
		if ($bytes <= 0) return '0 B';
		$s = array('B', 'KB', 'MB', 'GB', 'TB');
		$e = floor(log($bytes) / log(1024));
		return round($bytes / pow(1024, $e), 2) . ' ' . $s[$e];
	}
}
