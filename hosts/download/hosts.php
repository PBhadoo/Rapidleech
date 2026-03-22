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
			// yt-dlp universal plugin: maps many video/media domains to the single ytdlp_universal.php plugin
			case 'ytdlp.universal':
				$ytdlp_domains = array(
					// YouTube (overrides broken built-in plugin with yt-dlp)
					'youtube.com', 'www.youtube.com', 'youtu.be', 'm.youtube.com',
					// Video platforms
					'vimeo.com', 'player.vimeo.com',
					'twitch.tv', 'clips.twitch.tv',
					'tiktok.com', 'www.tiktok.com', 'vm.tiktok.com',
					'instagram.com', 'www.instagram.com',
					'twitter.com', 'x.com', 'mobile.twitter.com',
					'reddit.com', 'www.reddit.com', 'old.reddit.com', 'v.redd.it',
					'streamable.com',
					'bitchute.com', 'www.bitchute.com',
					'rumble.com',
					'odysee.com',
					'bilibili.com', 'www.bilibili.com', 'b23.tv',
					'nicovideo.jp', 'www.nicovideo.jp',
					'crunchyroll.com', 'www.crunchyroll.com',
					// Music platforms
					'soundcloud.com', 'www.soundcloud.com', 'm.soundcloud.com',
					'bandcamp.com',
					'mixcloud.com', 'www.mixcloud.com',
					// Media / news
					'cnn.com', 'edition.cnn.com',
					'bbc.co.uk', 'www.bbc.co.uk', 'bbc.com', 'www.bbc.com',
					'cbsnews.com', 'www.cbsnews.com',
					'washingtonpost.com', 'www.washingtonpost.com',
					'nytimes.com', 'www.nytimes.com',
					'theguardian.com', 'www.theguardian.com',
					// Education / tech
					'ted.com', 'www.ted.com',
					'udemy.com', 'www.udemy.com',
					'coursera.org', 'www.coursera.org',
					// Other popular sites
					'archive.org',
					'lbry.tv',
					'vidio.com',
					'veoh.com', 'www.veoh.com',
					'metacafe.com', 'www.metacafe.com',
					'coub.com',
					'9gag.com',
					'vlive.tv', 'www.vlive.tv',
					'videa.hu',
					'peertube.social',
					'hooktube.com',
					'invidio.us', 'invidious.snopyta.org',
					'piped.kavin.rocks',
				);
				foreach ($ytdlp_domains as $ytd) $host[$ytd] = 'ytdlp_universal.php';
				break;
		}
	}
}
unset($HostnamesToFix, $HostnamesToIgnore);
$d->close();
?>
