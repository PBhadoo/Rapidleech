<?php

if (!defined('RAPIDLEECH')) {
	require_once('index.html');
	exit();
}

if (!file_exists(HOST_DIR . 'download/GenericXFS_DL.php')) html_error('Cannot load "'.htmlentities(HOST_DIR).'download/GenericXFS_DL.php" (File doesn\'t exists)');
require_once(HOST_DIR . 'download/GenericXFS_DL.php');

class bestreams_net extends GenericXFS_DL {
	public $pluginVer = 6;
	public function Download($link) {
		$this->wwwDomain = false; // Switch to true if filehost forces it's domain with www.
		$this->cname = 'xfss'; // Session cookie name
		$this->sslLogin = false; // Force https on login.
		$this->embedDL = true; // Try to unpack player's js for finding download link. (Only hosts with video player)
		$this->unescaper = false; // Enable JS unescape decoder.
		$this->customDecoder = true; // Enable pageDecoder()

		// Custom Download Regexp
		$this->DLregexp = '@https?://(?:[\w\-]+\.)+[\w\-]+(?:\:\d+)?/\w{58}/[^\t\r\n<>\'\"\?\&]+@i';

		$this->Start($link);
	}

	// Rapidleech doesn't support rtmp, so i must get to the real file, that it's somewhere.
	protected function pageDecoder() {
		if (preg_match('@(https?://(?:[\w\-]+\.)+[\w\-]+(?:\:\d+)?/)i/(?:[^/\s\"\'<>]+/)*\w{12}(_t)?\.jpe?g@i', $this->page, $SV) && preg_match('@[?&]h(?:ash)?=(\w+)@i', $this->page, $hash)) {
			$DL = $SV[1] . $hash[1] . '/v.mp4'; // And that's how a XFS video download link is forged.
			$this->page = str_replace($SV[0], $DL, $this->page, $count);
			return ($count > 0 ? true : false);
		}
		return false;
	}
}

// Written by Th3-822.

?>