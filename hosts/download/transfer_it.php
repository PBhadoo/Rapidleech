<?php
if (!defined('RAPIDLEECH')) {
	require_once('index.html');
	exit;
}

/**
 * Transfer.it Download Plugin
 * Transfer.it is powered by MEGA's API. This plugin extracts the transfer ID,
 * queries the MEGA API for file metadata, and converts files into mega.nz links
 * for the existing mega_co_nz plugin to handle.
 */
class transfer_it extends DownloadClass {
	private $seqno;

	public function Download($link) {
		// Extract transfer ID from URL
		// Formats: transfer.it/t/ID or transfer.it/t/ID/filename
		if (!preg_match('@transfer\.it/t/([a-zA-Z0-9_\-]+)@i', $link, $match)) {
			html_error('Invalid transfer.it link. Expected format: https://transfer.it/t/TRANSFER_ID');
		}
		$transferId = $match[1];

		$this->seqno = mt_rand();
		$this->changeMesg(lang(300) . '<br />Transfer.it plugin (powered by MEGA)');

		// Step 1: Get the API server for this transfer
		$apiServer = $this->getApiServer($transferId);

		// Step 2: Fetch file list from MEGA API with transfer context
		$files = $this->apiReq(
			array('a' => 'f', 'c' => 1, 'r' => 1),
			$apiServer,
			$transferId
		);

		if (is_numeric($files[0])) {
			$this->checkErr($files[0]);
		}
		if (empty($files[0]['f']) || !is_array($files[0]['f'])) {
			html_error('No files found in this transfer, or the transfer has expired.');
		}

		// Step 3: Parse the file tree
		$nodes = $files[0]['f'];
		$rootNode = null;
		$fileNodes = array();

		foreach ($nodes as $node) {
			if ($node['t'] == 1 && empty($node['p'])) {
				// Root folder node - contains the master key
				$rootNode = $node;
			} elseif ($node['t'] == 0) {
				// File node
				$fileNodes[] = $node;
			}
		}

		if (empty($fileNodes)) {
			html_error('No downloadable files found in this transfer.');
		}

		if (empty($rootNode) || empty($rootNode['k'])) {
			html_error('Transfer key not found. The transfer may have expired or is invalid.');
		}

		// Step 4: Decode root folder key  
		// Transfer.it root keys can be in format "handle:key" or just "key"
		$rootKeyStr = $rootNode['k'];
		if (strpos($rootKeyStr, ':') !== false) {
			list(, $rootKeyStr) = explode(':', $rootKeyStr, 2);
		}
		// Also handle slash-separated multi-keys
		if (strpos($rootKeyStr, '/') !== false) {
			$parts = explode('/', $rootKeyStr);
			foreach ($parts as $part) {
				if (strpos($part, ':') !== false) {
					list(, $rootKeyStr) = explode(':', $part, 2);
					break;
				}
			}
		}
		$folderKey = $this->base64_to_a32($rootKeyStr);

		// Step 5: For each file, decrypt the key and build download info
		$downloadFiles = array();
		foreach ($fileNodes as $fnode) {
			$fileKey = $this->decryptFileKey($fnode['k'], $folderKey);
			if ($fileKey === false) continue;

			$attr = $this->decryptAttr($fnode['a'], $fileKey);
			if ($attr === false || empty($attr['n'])) continue;

			$downloadFiles[] = array(
				'handle' => $fnode['h'],
				'name' => $attr['n'],
				'size' => isset($fnode['s']) ? $fnode['s'] : 0,
				'key_b64' => $this->a32_to_base64($fileKey),
			);
		}

		if (empty($downloadFiles)) {
			html_error('Could not decrypt any files from this transfer. Keys may be invalid.');
		}

		// Step 6: If single file, download directly. If multiple, send to auto-downloader.
		if (count($downloadFiles) == 1) {
			$f = $downloadFiles[0];
			// Request download URL from MEGA API
			$dlReply = $this->apiReq(
				array('a' => 'g', 'g' => 1, 'n' => $f['handle'], 'ssl' => 0),
				$apiServer,
				$transferId
			);
			if (is_numeric($dlReply[0])) $this->checkErr($dlReply[0]);
			if (empty($dlReply[0]['g'])) html_error('Could not get download URL from MEGA.');

			// Redirect to download with MEGA decryption key
			$this->RedirectDownload($dlReply[0]['g'], $f['name'], 0, 0, $link, 0, 0, array('T8[fkey]' => $f['key_b64']));
		} else {
			// Multiple files: build mega.nz compatible links for auto-downloader
			// We'll use a custom approach: download each file via the MEGA API
			echo '<div style="text-align:center;padding:20px;">';
			echo '<h3>Transfer.it - ' . count($downloadFiles) . ' files found</h3>';
			echo '<p>Total: ' . $this->formatSize(array_sum(array_column($downloadFiles, 'size'))) . '</p>';
			echo '<table class="filelist" style="width:100%;margin:20px 0;">';
			echo '<tr class="flisttblhdr"><td><b>Filename</b></td><td><b>Size</b></td></tr>';
			foreach ($downloadFiles as $f) {
				echo '<tr class="flistmouseoff"><td>' . htmlspecialchars($f['name']) . '</td><td>' . $this->formatSize($f['size']) . '</td></tr>';
			}
			echo '</table>';
			echo '</div>';

			// Build links array for auto-downloader
			// Each link encodes the transfer info needed to download
			$links = array();
			foreach ($downloadFiles as $f) {
				// Encode as a special transfer.it direct link that this plugin can parse
				$links[] = 'https://transfer.it/t/' . $transferId . '/' . urlencode($f['handle']) . '#' . $f['key_b64'];
			}
			$this->moveToAutoDownloader($links);
		}
	}

	private function getApiServer($transferId) {
		// First, query the global MEGA API to get the right server
		$page = $this->GetPage(
			'https://g.api.mega.co.nz/cs?id=' . ($this->seqno++) . '&v=3&lang=en&domain=transferit',
			0,
			json_encode(array(array('a' => 'gmf'))),
			"https://transfer.it/\r\nContent-Type: application/json"
		);
		list($header, $body) = array_map('trim', explode("\r\n\r\n", $page, 2));

		// Try to extract server from response, fallback to default
		$reply = @json_decode($body, true);
		if (!empty($reply[0]) && is_string($reply[0])) {
			return $reply[0]; // Server URL
		}

		// Fallback: use the transfer-specific endpoint
		return 'https://g.api.mega.co.nz';
	}

	private function apiReq($attr, $server, $transferId) {
		$url = $server . '/cs?id=' . ($this->seqno++) . '&v=3&lang=en&domain=transferit&x=' . urlencode($transferId) . '&bc=1';

		$page = $this->GetPage(
			$url,
			0,
			json_encode(array($attr)),
			"https://transfer.it/\r\nContent-Type: text/plain;charset=UTF-8"
		);

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
	// MEGA Crypto Helper Functions
	// ============================================
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
		$data = str_pad($data, 16 * ceil(strlen($data) / 16), "\0");
		return openssl_decrypt($data, 'aes-128-cbc', $key, OPENSSL_RAW_DATA | OPENSSL_ZERO_PADDING, "\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0");
	}

	private function aes_cbc_decrypt_a32($data, $key) {
		return $this->str_to_a32($this->aes_cbc_decrypt($this->a32_to_str($data), $this->a32_to_str($key)));
	}

	private function decrypt_key($a, $key) {
		$x = array();
		for ($i = 0; $i < count($a); $i += 4) {
			$x = array_merge($x, $this->aes_cbc_decrypt_a32(array_slice($a, $i, 4), $key));
		}
		return $x;
	}

	private function decryptFileKey($keyStr, $folderKey) {
		// File keys in transfer.it can be in format "handle:key", "handle:key/handle:key" or just "key"
		if (strpos($keyStr, '/') !== false || strpos($keyStr, ':') !== false) {
			$parts = explode('/', $keyStr);
			$found = '';
			foreach ($parts as $part) {
				if (strpos($part, ':') !== false) {
					list(, $found) = explode(':', $part, 2);
					break;
				}
			}
			if (!empty($found)) $keyStr = $found;
		}

		if (empty($keyStr)) return false;

		$encKey = $this->base64_to_a32($keyStr);
		$decKey = $this->decrypt_key($encKey, $folderKey);

		if (count($decKey) < 8) return false;

		// XOR the two halves to get the actual file key
		return array(
			$decKey[0] ^ $decKey[4],
			$decKey[1] ^ $decKey[5],
			$decKey[2] ^ $decKey[6],
			$decKey[3] ^ $decKey[7]
		);
	}

	private function decryptAttr($attrB64, $key) {
		$attr = trim($this->aes_cbc_decrypt($this->base64url_decode($attrB64), $this->a32_to_str($key)));
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
