<?php
$host = array();
$d = dir(HOST_DIR . 'download/');
$HostnamesToFix = array('ex.load.com' => 'ex-load.com', 'samsung.firmware.org' => 'samsung-firmware.org');
$HostnamesToIgnore = array('hosts', 'genericxfs.dl');
while (false !== ($entry = $d->read())) {
	if (strtolower(strrchr($entry, '.')) == '.php' && stripos($entry, '.JD') === false) {
		$hostname = strtolower(substr($entry, 0, -4));
		if (empty($hostname)) continue;
		$hostname = str_replace('_', '.', $hostname);
		if (array_key_exists($hostname, $HostnamesToFix)) $hostname = $HostnamesToFix[$hostname];
		if (in_array($hostname, $HostnamesToIgnore, true)) continue;
		$host[$hostname] = $entry;
		switch ($hostname) {
			case '1fichier.com':
				foreach(array('alterupload.com', 'cjoint.net', 'desfichiers.com', 'dfichiers.com', 'megadl.fr', 'mesfichiers.org', 'piecejointe.net', 'pjointe.com', 'tenvoi.com', 'dl4free.com') as $d1fichier) $host["$d1fichier"] = $host['1fichier.com'];
				break;
			case 'fileboom.me':
				$host['fboom.me'] = $host['fileboom.me'];
				break;
			case 'keep2share.cc':
				foreach(array('keep2share.com', 'keep2s.cc', 'k2s.cc') as $k2sdomains) $host["$k2sdomains"] = $host['keep2share.cc'];
				break;
			case 'kumpulbagi.id':
				$host['kumpulbagi.com'] = $host['kumpulbagi.id'];
				$host['kbagi.com'] = $host['kumpulbagi.id'];
				break;
			case 'mega.co.nz':
				$host['mega.nz'] = $host['mega.co.nz'];
				break;
			case 'rapidgator.net':
				$host['rg.to'] = $host['rapidgator.net'];
				break;
			case 'turbobit.net':
				$host['turbobit.ru'] = $host['turbobit.net'];
				$host['unextfiles.com'] = $host['turbobit.net'];
				break;
			case 'youtube.com':
				$host['youtu.be'] = $host['youtube.com'];
				break;
			case '1024tera.com':
				foreach(array('terabox.com', 'teraboxapp.com', '4funbox.com', 'mirrobox.com', 'teraboxlink.com') as $tbdomain) $host["$tbdomain"] = $host['1024tera.com'];
				break;
			case 'xvideos.com':
				$host['xnxx.com'] = $host['xvideos.com'];
				break;
			case 'pornhub.com':
				foreach(array('pornhub.org', 'pornhubpremium.com', 'pornhubpremium.org') as $phdomain) $host["$phdomain"] = $host['pornhub.com'];
				break;
		}
	}
}
unset($HostnamesToFix, $HostnamesToIgnore);
$d->close();
?>
