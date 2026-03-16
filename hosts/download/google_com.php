<?php

if (!defined('RAPIDLEECH')) {
	require_once ("index.html");
	exit();
}

class google_com extends DownloadClass {
	public $fNames = array('odt' => 'OpenDocument Text', 'docx' => 'Microsoft Word', 'rtf' => 'Rich Text Format', 'txt' => 'Plain Text', 'pdf' => 'PDF Document', 'epub' => 'EPUB Publication', 'zip' => 'Zipped html Document', 'pptx' => 'Microsoft PowerPoint', 'ods' => 'OpenDocument Spreadsheet', 'xlsx' => 'Microsoft Excel');
	public $dFormats = array('odt', 'docx', 'rtf', 'txt', 'pdf', 'epub', 'zip');
	public $pFormats = array('pptx', 'pdf');
	public $ssFormats = array('ods', 'xlsx', 'pdf', 'zip');

	public function Download($link) {
		// Extract file/folder ID from various Google Drive URL formats
		if (!preg_match('@https?://(?:[\w\-]+\.)*(?:drive|docs)\.google\.com/(?:(?:folderview|open|(?:a/[\w\-\.]+/)?uc)\?(?:[\w\-\%]+=[\w\-\%]*&)*id=|(?:folder|file|document|presentation|spreadsheets?)/d/|drive/(?:u/\d+/)?folders/|drive/(?:u/\d+/)?file/d/)([\w\-]{10,})@i', $link, $this->ID)) {
			// Try simpler ID extraction
			if (!preg_match('@/d/([\w\-]{10,})@', $link, $this->ID) &&
				!preg_match('@[?&]id=([\w\-]{10,})@', $link, $this->ID) &&
				!preg_match('@/folders/([\w\-]{10,})@', $link, $this->ID)) {
				html_error('File/Folder ID not found in the link.');
			}
		}
		$this->ID = $this->ID[1];

		// Determine type based on URL
		if (preg_match('@/folders?/@i', $link) || preg_match('@folderview@i', $link)) {
			$this->Folder();
			return;
		}
		if (preg_match('@/document/@i', $link)) {
			$this->Document();
			return;
		}
		if (preg_match('@/presentation/@i', $link)) {
			$this->Presentation();
			return;
		}
		if (preg_match('@/spreadsheets?/@i', $link)) {
			$this->Spreadsheets();
			return;
		}

		// Default: try as file
		// First try /open to detect type via redirect
		$page = $this->GetPage('https://drive.google.com/open?id=' . $this->ID);
		if (substr($page, 9, 3) == '404') html_error('File/Folder doesn\'t exist.');

		if (substr($page, 9, 1) == '3' && preg_match('@\nLocation: https?://(?:[\w\-]+\.)*(?:drive|docs)\.google\.com/(?:drive/)?(\w+)[\?/]@i', $page, $type)) {
			switch (strtolower($type[1])) {
				case 'file': $this->File(); return;
				case 'folder': case 'folders': case 'folderview': $this->Folder(); return;
				case 'document': $this->Document(); return;
				case 'presentation': $this->Presentation(); return;
				case 'spreadsheets': $this->Spreadsheets(); return;
				default: break;
			}
		}

		// Fallback: try as regular file download
		$this->File();
	}

	private function isPrivate($page) {
		if (stripos($page, 'ServiceLogin') !== false || stripos($page, 'accounts.google.com/v3/signin') !== false) {
			html_error('This is a private file/folder. You need to be signed in to access it.');
		}
	}

	private function File() {
		// Method 1: Try direct export download
		$dlUrl = 'https://drive.google.com/uc?export=download&id=' . $this->ID;
		$page = $this->GetPage($dlUrl);
		$this->isPrivate($page);

		// Check if we got a direct redirect (small files)
		if (substr($page, 9, 1) == '3') {
			if (preg_match('@\nLocation: (https?://[^\r\n]+)@i', $page, $dl)) {
				$this->RedirectDownload($dl[1], 'fGoogle', 0, 0, $dlUrl);
				return;
			}
		}

		// For larger files, Google shows a virus scan warning page
		// Try to extract the confirmation token
		$body = $page;
		if (($pos = strpos($body, "\r\n\r\n")) !== false) {
			$body = substr($body, $pos + 4);
		}

		// Method 2: Look for confirm token in the page (new format with uuid)
		if (preg_match('@/uc\?export=download[^"\']*&amp;confirm=([^&"\']+)[^"\']*&amp;uuid=([^&"\']+)@i', $body, $confirm)) {
			$confirmUrl = 'https://drive.google.com/uc?export=download&confirm=' . htmlspecialchars_decode($confirm[1]) . '&uuid=' . htmlspecialchars_decode($confirm[2]) . '&id=' . $this->ID;
			$cookie = GetCookiesArr($page);
			$page2 = $this->GetPage($confirmUrl, $cookie);
			if (substr($page2, 9, 1) == '3' && preg_match('@\nLocation: (https?://[^\r\n]+)@i', $page2, $dl)) {
				$this->RedirectDownload($dl[1], 'fGoogle', $cookie, 0, $dlUrl);
				return;
			}
		}

		// Method 3: Look for confirm=t pattern
		if (preg_match('@confirm=([a-zA-Z0-9_\-]+)@', $body, $confirm)) {
			$confirmUrl = 'https://drive.google.com/uc?export=download&confirm=' . $confirm[1] . '&id=' . $this->ID;
			$cookie = GetCookiesArr($page);
			$page2 = $this->GetPage($confirmUrl, $cookie);
			if (substr($page2, 9, 1) == '3' && preg_match('@\nLocation: (https?://[^\r\n]+)@i', $page2, $dl)) {
				$this->RedirectDownload($dl[1], 'fGoogle', $cookie, 0, $dlUrl);
				return;
			}
		}

		// Method 4: Try with download_warning cookie
		$cookie = 'download_warning_' . $this->ID . '=t';
		$confirmUrl = 'https://drive.google.com/uc?export=download&confirm=t&id=' . $this->ID;
		$page2 = $this->GetPage($confirmUrl, $cookie);
		if (substr($page2, 9, 1) == '3' && preg_match('@\nLocation: (https?://[^\r\n]+)@i', $page2, $dl)) {
			$this->RedirectDownload($dl[1], 'fGoogle', $cookie, 0, $dlUrl);
			return;
		}

		// Method 5: Use the /file/d/ direct link approach
		$apiUrl = 'https://drive.google.com/uc?id=' . $this->ID . '&export=download&confirm=t';
		$this->RedirectDownload($apiUrl, 'fGoogle', $cookie, 0, 'https://drive.google.com/file/d/' . $this->ID);
	}

	private function Folder() {
		if (isset($_GET['audl'])) html_error('Cannot check folder in audl.');

		$ids = array();

		// Method 1: Try the embedded folder view (most reliable for public folders)
		$page = $this->GetPage('https://drive.google.com/embeddedfolderview?id=' . $this->ID . '#list');
		$this->isPrivate($page);
		if (preg_match_all('@/file/d/([\w\-]{10,})@', $page, $matches)) {
			$ids = array_unique($matches[1]);
		}
		if (empty($ids) && preg_match_all('@\bid=([\w\-]{10,})@', $page, $matches)) {
			$ids = array_unique($matches[1]);
			$ids = array_diff($ids, array($this->ID));
		}

		// Method 2: Try regular folder page and parse AF_initDataCallback JSON
		if (empty($ids)) {
			$page = $this->GetPage('https://drive.google.com/drive/folders/' . $this->ID);
			$this->isPrivate($page);
			$body = $page;
			if (($pos = strpos($body, "\r\n\r\n")) !== false) $body = substr($body, $pos + 4);

			// Google embeds folder data in AF_initDataCallback script blocks
			// File IDs appear as quoted strings of 20+ alphanumeric chars
			if (preg_match_all('@"([\w\-]{20,})"@', $body, $matches)) {
				$all_ids = array_unique($matches[1]);
				// Filter: keep only IDs that appear alongside Google Drive patterns
				foreach ($all_ids as $candidate) {
					if ($candidate === $this->ID) continue;
					// Check if this ID looks like a Google Drive file ID (length 20-60, alphanumeric with dashes/underscores)
					if (strlen($candidate) >= 20 && strlen($candidate) <= 60 && preg_match('@^[\w\-]+$@', $candidate)) {
						$ids[] = $candidate;
					}
				}
			}
			// Also try escaped JSON patterns
			if (empty($ids) && preg_match_all('@\\\\x22([\w\-]{20,})\\\\x22@', $body, $matches)) {
				$ids = array_unique($matches[1]);
				$ids = array_diff($ids, array($this->ID));
			}
			// Try unescaped JSON array patterns
			if (empty($ids) && preg_match_all('@\["([\w\-]{20,})"@', $body, $matches)) {
				$ids = array_unique($matches[1]);
				$ids = array_diff($ids, array($this->ID));
			}
		}

		// Method 3: Try Google Drive API-style listing (works for some shared folders)
		if (empty($ids)) {
			$apiUrl = 'https://clients6.google.com/drive/v2beta/files?q=%27' . $this->ID . '%27+in+parents&fields=items(id)&maxResults=1000';
			$apiPage = $this->GetPage($apiUrl, 0, 0, 'https://drive.google.com/');
			if (preg_match_all('@"id"\s*:\s*"([\w\-]{10,})"@', $apiPage, $matches)) {
				$ids = array_unique($matches[1]);
				$ids = array_diff($ids, array($this->ID));
			}
		}

		if (empty($ids)) html_error('Empty folder, private folder, or could not read folder contents. Make sure the folder is shared publicly.');

		$ids = array_values(array_unique($ids));
		$links = array();
		foreach ($ids as $id) {
			$links[] = "https://drive.google.com/uc?id=$id&export=download";
		}
		$this->moveToAutoDownloader($links);
	}

	private function Document() {
		$url = 'https://docs.google.com/document/d/' . $this->ID;
		$page = $this->GetPage("$url/edit");
		$this->isPrivate($page);
		if (empty($_GET['T8']['format']) && !isset($_GET['audl'])) $this->formatSelector(1);
		$format = (!empty($_GET['T8']['format']) && in_array($_GET['T8']['format'], $this->dFormats)) ? $_GET['T8']['format'] : reset($this->dFormats);
		$this->RedirectDownload("$url/export?format=$format", 'dGoogle', 0, 0, $url);
	}

	private function Presentation() {
		$url = 'https://docs.google.com/presentation/d/' . $this->ID;
		$page = $this->GetPage("$url/edit");
		$this->isPrivate($page);
		if (empty($_GET['T8']['format']) && !isset($_GET['audl'])) $this->formatSelector(2);
		$format = (!empty($_GET['T8']['format']) && in_array($_GET['T8']['format'], $this->pFormats)) ? $_GET['T8']['format'] : reset($this->pFormats);
		$this->RedirectDownload("$url/export/$format", 'pGoogle', 0, 0, $url);
	}

	private function Spreadsheets() {
		$url = 'https://docs.google.com/spreadsheets/d/' . $this->ID;
		$page = $this->GetPage("$url/edit");
		$this->isPrivate($page);
		if (empty($_GET['T8']['format']) && !isset($_GET['audl'])) $this->formatSelector(3);
		$format = (!empty($_GET['T8']['format']) && in_array($_GET['T8']['format'], $this->ssFormats)) ? $_GET['T8']['format'] : reset($this->ssFormats);
		$this->RedirectDownload("$url/export?format=$format", 'ssGoogle', 0, 0, $url);
	}

	private function formatSelector($type = 1) {
		switch ($type) {
			case 1: $tName = 'Document'; $formats = $this->dFormats; break;
			case 2: $tName = 'Presentation'; $formats = $this->pFormats; break;
			case 3: $tName = 'Spreadsheet'; $formats = $this->ssFormats; break;
			default: html_error('formatSelector: Unknown type.');
		}
		if (count($formats) == 1) return $_GET['T8'] = array('format' => reset($formats));
		echo "\n<br /><br /><h3 style='text-align: center;'>$tName format selector</h3>";
		echo "\n<center><form name='GD_FS' action='{$GLOBALS['PHP_SELF']}' method='POST'>\n";
		echo "<select name='T8[format]' id='GD_ext'>\n";
		foreach ($formats as $ext) echo "<option value='$ext'>" . (!empty($this->fNames[$ext]) ? $this->fNames[$ext] . " (.$ext)" : ".$ext") . "</option>\n";
		echo "</select>\n";
		$data = $this->DefaultParamArr('https://drive.google.com/open?id=' . $this->ID);
		foreach ($data as $n => $v) echo("<input type='hidden' name='$n' id='FS_$n' value='$v' />\n");
		echo "<input type='submit' name='Th3-822' value='" . lang(209) . "' />\n";
		echo "</form></center>\n</body>\n</html>";
		exit;
	}

	// Add Range header to get filesize on chunked downloads
	public function RedirectDownload($link, $FileName = 0, $cookie = 0, $post = 0, $referer = 0, $force_name = 0, $auth = 0, $addon = array()) {
		$referer .= "\r\nRange: bytes=0-";
		return parent::RedirectDownload($link, $FileName, $cookie, $post, $referer, $force_name, $auth, $addon);
	}

	public function CheckBack(&$headers) {
		if (substr($headers, 9, 3) == '416') {
			// Range not satisfiable - remove range header and retry as normal
			html_error('[google_com] Range method failed. The file may be too small or the URL may have expired.');
		}
		if (stripos($headers, "\nTransfer-Encoding: chunked") !== false) {
			global $fp, $sFilters;
			if (empty($fp) || !is_resource($fp)) html_error('Error: Stream resource not available for chunked transfer.');
			if (!in_array('dechunk', stream_get_filters())) html_error('Error: dechunk filter not available.');
			if (!isset($sFilters) || !is_array($sFilters)) $sFilters = array();
			if (empty($sFilters['dechunk'])) $sFilters['dechunk'] = stream_filter_append($fp, 'dechunk', STREAM_FILTER_READ);
			if (!$sFilters['dechunk']) html_error('Error: Failed to initialize dechunk filter.');
			$headers = preg_replace('@\nContent-Range\: bytes 0-\d+/@i', "\nContent-Length: ", $headers, 1);
		}
	}
}

// Google Drive plugin for RapidLeech
// Originally by Th3-822, updated 2026 for current Google Drive API
