<?php

require_once('rl_init.php');
if ($options['auto_download_disable']) {
	require_once('deny.php');
	exit();
}
error_reporting(0);
ignore_user_abort(true);

login_check();

require(TEMPLATE_DIR . '/header.php');
?>
<?php
if (isset($_REQUEST['GO']) && $_REQUEST['GO'] == 'GO') {
	$_REQUEST['links'] = (isset($_REQUEST['links'])) ? trim($_REQUEST['links']) : '';
	if (empty($_REQUEST['links'])) html_error('No link submited');
	$getlinks = array_values(array_unique(array_filter(array_map('trim', explode("\r\n", $_REQUEST['links'])))));
	if (count($getlinks) < 1) html_error('No links submited');
	if (isset($_REQUEST['server_side']) && $_REQUEST['server_side'] == 'on') {
		// Get supported download plugins
		require_once(HOST_DIR . 'download/hosts.php');
		require_once(CLASS_DIR . 'ftp.php');
		require_once(CLASS_DIR . 'http.php');
?>
<div class="rl-container">
	<div class="rl-card">
		<div class="rl-card-header">
			<div class="rl-card-icon">
				<svg width="20" height="20" fill="currentColor" viewBox="0 0 24 24">
					<path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/>
				</svg>
			</div>
			<div>
				<div class="rl-card-title"><?php echo lang(334); ?> - Server Side</div>
				<div class="rl-card-subtitle">Processing downloads on server</div>
			</div>
		</div>
		
		<div style="overflow-x: auto;">
			<table class="filelist" style="width: 100%; border-radius: var(--radius-md); overflow: hidden;">
				<tr class="flisttblhdr">
					<th style="text-align: left;"><?php echo lang(21); ?></th>
					<th style="width: 120px; text-align: center;"><?php echo lang(22); ?></th>
				</tr>
<?php
		for ($i = 0; $i < count($getlinks); $i++) echo "\t\t\t<tr class='flistmouseoff'><td style='word-break: break-all;'>".htmlentities($getlinks[$i])."</td><td id='status$i' style='text-align: center;'>".lang(23)."</td></tr>$nn";
?>
			</table>
		</div>
	</div>
</div>
<script type="text/javascript">
/* <![CDATA[ */
function updateStatus(id, status) {
	document.getElementById('status'+id).innerHTML = status;
}
function resetProgress() {
	document.getElementById('received').innerHTML = '0 KB';
	document.getElementById('percent').innerHTML = '0%';
	document.getElementById('progress').style.width = '0%';
	document.getElementById('speed').innerHTML = '0 KB/s';
	document.title = 'RAPIDLEECH PLUGMOD - Auto Download';
}
/* ]]> */
</script>
<br /><br />
<?php
		for ($i = 0; $i < count($getlinks); $i++) {
			$isHost = false;
			unset($FileName);
			unset($force_name);
			//$bytesReceived = 0; // fix for GLOBAL in geturl()
			unset($bytesReceived);

			$LINK = $getlinks[$i];
			$Url = parse_url($LINK);
			$Url['scheme'] = strtolower($Url['scheme']);
			$Url['path'] = (empty($Url['path'])) ? '/' :str_replace('%2F', '/', rawurlencode(rawurldecode($Url['path'])));

			$Referer = $Url;
			unset($Referer['user'], $Referer['pass']); // Remove login from Referer
			$Referer = rebuild_url($Referer);

			$_GET = array('GO' => 'GO'); // for insert_location()

			if (isset($_POST['useproxy']) && (empty($_POST['proxy']) || strpos($_POST['proxy'], ':') === false)) html_error(lang(20));
			if (isset($_POST['useproxy']) && $_POST['useproxy'] == 'on') {
				$_GET['useproxy'] = 'on';
				$_GET['proxy'] = $_POST['proxy'];
				$_GET['pauth'] = (!empty($_GET['proxyuser']) && !empty($_GET['proxypass'])) ? base64_encode($_GET['proxyuser'] . ':' . $_GET['proxypass']) : '';
			}

			if (isset($_POST['premium_acc'])) {
				$_GET['premium_acc'] = 'on';
				$_GET['premium_user'] = $_REQUEST['premium_user'] = (empty($_POST['premium_user'])) ? '' : $_POST['premium_user'];
				$_GET['premium_pass'] = $_REQUEST['premium_pass'] = (empty($_POST['premium_pass'])) ? '' : $_POST['premium_pass'];
			}

			if (!empty($Url['user']) && !empty($Url['pass'])) {
				$_GET['premium_acc'] = 'on';
				$_GET['premium_user'] = $_REQUEST['premium_user'] = $Url['user'];
				$_GET['premium_pass'] = $_REQUEST['premium_pass'] = $Url['pass'];
				$auth = urlencode(encrypt(base64_encode(rawurlencode($Url['user']) . ':' . rawurlencode($Url['pass']))));
				unset($Url['user'], $Url['pass']);
			} elseif (empty($Url['user']) xor empty($Url['pass'])) unset($Url['user'], $Url['pass']);

			$LINK = rebuild_url($Url);

			if (!in_array($Url['scheme'], array('http', 'https', 'ftp'))) echo "<script type='text/javascript'>updateStatus($i, '".lang(24)."');</script>$nn";
			else {
				require_once(TEMPLATE_DIR . '/transloadui.php');
				echo "<div id='progress$i' style='display:block;'>$nn";
				$isHost = false;
				$redir = $lastError = '';
				$GLOBALS['throwRLErrors'] = true;
				foreach ($host as $site => $file) {
					if (host_matches($site, $Url['host'])) { //if (preg_match("/^(.+\.)?".$site."$/i", $Url['host'])) {
						$isHost = true;
						try {
							require_once(HOST_DIR . 'DownloadClass.php');
							require_once(HOST_DIR . 'download/' . $file);
							$class = substr($file, 0, -4);
							$firstchar = substr($file, 0, 1);
							if ($firstchar > 0) $class = "d$class";
							if (class_exists($class)) {
								$hostClass = new $class(false);
								$hostClass->Download($LINK);
							}
						} catch (Exception $e) {
							echo "</div><script type='text/javascript'>updateStatus($i, '".htmlspecialchars($e->getMessage(), ENT_QUOTES)."');$nn"."document.getElementById('progress$i').style.display='none';</script>$nn";
							continue 2;
						}
					}
				}
				if (!$isHost) {
					$FileName = isset($Url['path']) ? basename($Url['path']) : '';
					$redir = GetDefaultParams();
					$redir['filename'] = urlencode($FileName);
					$redir['host'] = urlencode($Url['host']);
					if (!empty($Url['port'])) $redir['port'] = urlencode($Url['port']);
					$redir['path'] = urlencode($Url['path'] . (!empty($Url['query']) ? '?' . $Url['query'] : ''));
					$redir['referer'] = urlencode($Referer);
					$redir['link'] = urlencode($LINK);
					if (!empty($_GET['cookie'])) $redir['cookie'] = urlencode(encrypt($_GET['cookie']));
					if (!empty($auth)) $redir['auth'] = $auth;
					insert_location($redir);
				}
				echo "<script type='text/javascript'>updateStatus($i, '".lang(25)."');</script>$nn";

				$_GET['saveto'] = ($options['download_dir_is_changeable'] ? urldecode(trim($_GET['saveto'])) : ((substr($options['download_dir'], 0, 6) != 'ftp://') ? realpath(DOWNLOAD_DIR) : $options['download_dir']));
				$_GET['proxy'] = !empty($_GET['proxy']) ? trim(urldecode($_GET['proxy'])) : '';
				$pauth = (empty($_GET['proxy']) || empty($_GET['pauth'])) ? '' : urldecode(trim($_GET['pauth']));
				do {
					$_GET['filename'] = urldecode(trim($_GET['filename']));
					if (strpos($_GET['filename'], '?') !== false) $_GET['filename'] = substr($_GET['filename'], 0, strpos($_GET['filename'], '?'));
					$_GET['host'] = urldecode(trim($_GET['host']));
					$_GET['path'] = urldecode(trim($_GET['path']));
					$_GET['port'] = !empty($_GET['port']) ? urldecode(trim($_GET['port'])) : 0;
					$_GET['referer'] = !empty($_GET['referer']) ? urldecode(trim($_GET['referer'])) : 0;
					$_GET['link'] = urldecode(trim($_GET['link']));
					$_GET['post'] = !empty($_GET['post']) ? unserialize(decrypt(urldecode(trim($_GET['post'])))) : 0;
					$_GET['cookie'] = !empty($_GET['cookie']) ? decrypt(urldecode(trim($_GET['cookie']))) : '';
					$redirectto = '';

					$AUTH = array();
					$_GET['auth'] = !empty($_GET['auth']) ? trim($_GET['auth']) : '';
					if ($_GET['auth'] == '1') {
						if (!preg_match('|^(?:.+\.)?(.+\..+)$|i', $_GET['host'], $hostmatch)) html_error('No valid hostname found for authorisation!');
						$hostmatch = str_replace('.', '_', $hostmatch[1]);
						if (isset($premium_acc["$hostmatch"]) && is_array($premium_acc["$hostmatch"]) && !empty($premium_acc["$hostmatch"]['user']) && !empty($premium_acc["$hostmatch"]['pass'])) {
							$auth = base64_encode($premium_acc["$hostmatch"]['user'] . ':' . $premium_acc["$hostmatch"]['pass']);
						} else html_error('No usable premium account found for this download - please set one in accounts.php');
					} elseif (!empty($_GET['auth'])) {
						$auth = decrypt(urldecode($_GET['auth']));
						list($AUTH['user'], $AUTH['pass']) = array_map('rawurldecode', explode(':', base64_decode($auth), 2));
					} else $auth = false;

					$pathWithName = $_GET['saveto'] . PATH_SPLITTER . basename(urldecode($_GET['filename']));
					while (strpos($pathWithName, "\\\\") !== false) $pathWithName = str_replace("\\\\", "\\", $pathWithName);
					if (strpos($pathWithName, '?') !== false) $pathWithName = substr($pathWithName, 0, strpos($pathWithName, '?'));

					echo "<script type='text/javascript'>updateStatus($i, '".lang(26)."');</script>$nn";
					$url = parse_url($_GET['link']);
					if (empty($url['port'])) $url['port'] = $_GET['port'];
					if (isset($url['scheme']) && $url['scheme'] == 'ftp' && empty($_GET['proxy'])) $file = getftpurl($_GET['host'], defport($url), urldecode($_GET['path']), $pathWithName);
					else {
						!empty($_GET['force_name']) ? $force_name = urldecode($_GET['force_name']) : '';
						$file = geturl($_GET['host'], defport($url), $_GET['path'], $_GET['referer'], $_GET['cookie'], $_GET['post'], $pathWithName, $_GET['proxy'], $pauth, $auth, $url['scheme']);
					}

					if ($options['redir'] && $lastError && strpos($lastError, substr(lang(95), 0, strpos(lang(95), '%1$s'))) !== false) {
						$redirectto = trim(cut_str($lastError, substr(lang(95), 0, strpos(lang(95), '%1$s')), ']'));
						$_GET['referer'] = urlencode($_GET['link']);
						if (strpos($redirectto, '://') === false) { // If redirect doesn't have the host
							$ref = parse_url(urldecode($_GET['referer']));
							unset($ref['user'], $ref['pass'], $ref['query'], $ref['fragment']);
							if (substr($redirectto, 0, 1) != '/') $redirectto = "/$redirectto";
							$purl = array_merge($ref, parse_url($redirectto));
						} else $purl = parse_url($redirectto);
						$_GET['link'] = urlencode(rebuild_url($purl));
						$_GET['filename'] = urlencode(basename($purl['path']));
						$_GET['host'] = urlencode($purl['host']);
						$_GET['path'] = urlencode($purl['path'] . (!empty($purl['query']) ? '?' . $purl['query'] : ''));
						$_GET['port'] = !empty($purl['port']) ? $purl['port'] : 80;
						$_GET['cookie'] = !empty($_GET['cookie']) ? urlencode(encrypt($_GET['cookie'])) : '';
						if (is_array($_GET['post'])) $_GET['post'] = urlencode(encrypt(serialize($_GET['post'])));
						$lastError = $_GET['auth'] = ''; // With $_GET['auth'] empty it will still using the $auth
						unset($ref, $purl);
					}
					if ($lastError) echo "<script type='text/javascript'>updateStatus($i, '".addslashes($lastError)."');</script>$nn";
					elseif ($file['bytesReceived'] == $file['bytesTotal'] || $file['size'] == 'Unknown') {
						echo "<script type='text/javascript'>updateStatus($i, '100%');</script>$nn";
						write_file(CONFIG_DIR."files.lst", serialize(array('name' => $file['file'], 'size' => $file['size'], 'date' => time(), 'link' => $_GET['link'], 'comment' => (!empty($_GET['comment']) ? str_replace(array("\r", "\n"), array('\r', '\n'), $_GET['comment']) : ''))) . "\r\n", 0);
					} else echo "<script type='text/javascript'>updateStatus($i, '".lang(27)."');</script>$nn";
				} while ($redirectto && !$lastError);
				echo "</div>$nn<script type='text/javascript'>resetProgress();document.getElementById('progress$i').style.display='none';</script>$nn";
			}
			if (isset($_POST['server_dodelay']) && $_POST['server_dodelay'] == 'on' && !empty($_POST['serversidedelay'])) sleep((int) $_POST['serversidedelay']);
		}
		echo "<script type='text/javascript'>$('.transloadui').hide();</script>$nn";
		exit;
	} else {
		$start_link = 'index.php?audl=doum';

		if (isset($_REQUEST['useproxy']) && (empty($_REQUEST['proxy']) || strpos($_REQUEST['proxy'], ':') === false)) html_error(lang(20));
		elseif (isset($_REQUEST['useproxy']) && $_REQUEST['useproxy'] == 'on') {
			$start_link .= '&useproxy=on&proxy=' . urlencode(trim($_REQUEST['proxy']));
			if (!empty($_REQUEST['proxyuser']) && !empty($_REQUEST['proxypass'])) {
				$start_link .= '&proxyuser=' . urlencode(trim($_REQUEST['proxyuser']));
				$start_link .= '&proxypass=' . urlencode(trim($_REQUEST['proxypass']));
			}
		}

		if (!empty($_POST['premium_acc']) && $_POST['premium_acc'] == 'on') {
			$start_link .= '&premium_acc=on';
			if (!empty($_POST['premium_user']) && !empty($_POST['premium_pass'])) $start_link .= '&premium_user=' . urlencode(trim($_POST['premium_user'])) . '&premium_pass='.urlencode(trim($_POST['premium_pass']));
		}

		if (isset($_POST['cookieuse']) && !empty($_POST['cookie'])) $start_link .= '&cookie=' . urlencode(trim($_POST['cookie']));
		if (isset($_POST['ytube_mp4']) && isset($_POST['yt_fmt'])) $start_link .= '&ytube_mp4=' . urlencode($_POST['ytube_mp4']) . '&yt_fmt='.urlencode($_POST['yt_fmt']);
		if (isset($_POST['cleanname'])) $start_link .= '&cleanname=' . urlencode($_POST['cleanname']);

?>
<script type="text/javascript">
/* <![CDATA[ */
	var current_dlink = -1;
	var links = new Array();
	var start_link = '<?php echo $start_link; ?>';

	function startauto() {
		current_dlink = -1;
		document.getElementById('auto').style.display = 'none';
		nextlink();
	}

	function nextlink() {
		if (document.getElementById('status'+current_dlink)) document.getElementById('status'+current_dlink).innerHTML = '<?php echo lang(28); ?>';
		current_dlink++;

		if (current_dlink < links.length) {
			document.getElementById('status'+current_dlink).innerHTML = '<?php echo lang(26); ?>';
			opennewwindow(current_dlink);
		}
	}

	function opennewwindow(id) {
		window.frames['idownload'].location = start_link+'&link='+links[id];
	}

	function addLinks() {
		var tbody = document.getElementById('links').getElementsByTagName('tbody')[0];
		var stringLinks = document.getElementById('addlinks').value;
		var regexRN = new RegExp('\r\n', 'g');
		var regexN = new RegExp('\n', 'g');
		var stringLinksN = stringLinks.replace(regexRN, "\n");
		var arrayLinks = stringLinksN.split(regexN);
		for (var i = 0; i < arrayLinks.length; i++) {
			var row = document.createElement('tr');
			var td1 = document.createElement('td');
			td1.appendChild(document.createTextNode(arrayLinks[i]));
			var td2 = document.createElement('td');
			td2.appendChild(document.createTextNode('<?php echo lang(23); ?>'));
			td2.setAttribute('id', 'status'+links.length);
			row.appendChild(td1);
			row.appendChild(td2);
			tbody.appendChild(row);
			links[links.length] = arrayLinks[i];
		}
		document.getElementById('addlinks').value = '';
	}
<?php for ($i = 0; $i < count($getlinks); $i++) echo "\tlinks[$i] = '" . urlencode($getlinks[$i]) . "';\n"; ?>
/* ]]> */
</script>

<div class="rl-container">
	<div class="rl-card">
		<div class="rl-card-header">
			<div class="rl-card-icon">
				<svg width="20" height="20" fill="currentColor" viewBox="0 0 24 24">
					<path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/>
				</svg>
			</div>
			<div>
				<div class="rl-card-title"><?php echo lang(334); ?> - Queue</div>
				<div class="rl-card-subtitle">Processing download links</div>
			</div>
		</div>
		
		<div style="overflow-x: auto; margin-bottom: 20px;">
			<table id="links" class="filelist" style="width: 100%; border-radius: var(--radius-md); overflow: hidden;">
				<thead>
					<tr class="flisttblhdr">
						<th style="text-align: left;"><?php echo lang(21); ?></th>
						<th style="width: 120px; text-align: center;"><?php echo lang(22); ?></th>
					</tr>
				</thead>
				<tbody>
<?php for ($i = 0; $i < count($getlinks); $i++) echo "\t\t\t\t<tr class='flistmouseoff'><td style='word-break: break-all;'>".htmlentities($getlinks[$i])."</td><td id='status$i' style='text-align: center;'>" . lang(307) . "</td></tr>\r\n"; ?>
				</tbody>
				<tfoot>
					<tr id="auto"><td colspan="2" style="text-align: center; padding: 16px;"><input type="button" value="<?php echo lang(29); ?>" onclick="javascript:startauto();" class="rl-btn rl-btn-primary" /></td></tr>
				</tfoot>
			</table>
		</div>
		
		<iframe src="" name="idownload" style="width: 100%; height: 300px; border: 1px solid var(--border-color); border-radius: var(--radius-md); background: var(--bg-secondary); margin-bottom: 20px;"><?php echo lang(30); ?></iframe>
		
		<!-- Add More Links -->
		<div style="padding: 16px; background: var(--bg-tertiary); border-radius: var(--radius-md);">
			<label class="rl-label" style="margin-bottom: 8px;"><?php echo lang(31); ?></label>
			<div style="display: flex; gap: 12px; align-items: flex-end;">
				<textarea name="addlinks" id="addlinks" rows="3" placeholder="Paste additional links here..." style="flex: 1; resize: vertical;"></textarea>
				<input type="button" value="<?php echo lang(31); ?>" onclick="javascript:addLinks();" class="rl-btn rl-btn-secondary" />
			</div>
		</div>
	</div>
</div>
<?php
		include(TEMPLATE_DIR.'footer.php');
		exit;
	}
}
?>
<script type="text/javascript">
/* <![CDATA[ */
	function ViewPage(page) {
		document.getElementById('listing').style.display = 'none';
		document.getElementById('options').style.display = 'none';
		document.getElementById(page).style.display = 'block';
		
		// Update tab active states
		document.querySelectorAll('.rl-tab').forEach(function(tab) {
			tab.classList.remove('active');
		});
		event.target.classList.add('active');
	}

	function HideAll() {
		document.getElementById('entered').style.display = 'none';
	}
/* ]]> */
</script>

<div class="rl-container" id="entered">
	<div class="rl-card">
		<div class="rl-card-header">
			<div class="rl-card-icon">
				<svg width="20" height="20" fill="currentColor" viewBox="0 0 24 24">
					<path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/>
				</svg>
			</div>
			<div>
				<div class="rl-card-title"><?php echo lang(334); ?></div>
				<div class="rl-card-subtitle">Download multiple links automatically</div>
			</div>
		</div>
		
		<form action="?GO=GO" method="post">
			<!-- Tabs Navigation -->
			<div class="rl-tabs">
				<button type="button" class="rl-tab active" onclick="ViewPage('listing');"><?php echo lang(32); ?></button>
				<button type="button" class="rl-tab" onclick="ViewPage('options');"><?php echo lang(33); ?></button>
			</div>
			
			<div style="width: 100%;">
				<div id="listing" style="display:block;">
					<div class="rl-form-group">
						<label class="rl-label"><?php echo lang(21); ?></label>
						<textarea id="links" name="links" rows="15" placeholder="Paste your download links here, one per line..." style="width:100%; min-height:350px; resize:vertical;"></textarea>
					</div>
					<div style="text-align: center; margin-top: 20px;">
						<input type="submit" value="<?php echo lang(34); ?>" onclick="javascript:HideAll();" class="rl-btn rl-btn-primary" />
					</div>
				</div>
				<div id="options" style="display:none;">
					<div style="display: grid; gap: 20px;">
						<!-- Proxy Settings -->
						<div class="rl-form-group">
							<label class="rl-checkbox">
								<input type="checkbox" id="useproxy" name="useproxy" onclick="javascript:var displ=this.checked?'':'none';document.getElementById('proxy').style.display=displ;"<?php echo !empty($_COOKIE['useproxy']) ? ' checked="checked"' : ''; ?> />
								<span><?php echo lang(35); ?></span>
							</label>
							<div id="proxy" style="margin-top: 12px; padding: 16px; background: var(--bg-tertiary); border-radius: var(--radius-md);<?php echo !empty($_COOKIE['useproxy']) ? '' : ' display: none;'; ?>">
								<div class="rl-form-group" style="margin-bottom: 12px;">
									<label class="rl-label"><?php echo lang(36); ?>:</label>
									<input type="text" name="proxy" placeholder="host:port"<?php echo !empty($_COOKIE['proxy']) ? ' value="'.htmlspecialchars($_COOKIE['proxy'], ENT_QUOTES).'"' : ''; ?> />
								</div>
								<div class="rl-form-group" style="margin-bottom: 12px;">
									<label class="rl-label"><?php echo lang(37); ?>:</label>
									<input type="text" name="proxyuser"<?php echo !empty($_COOKIE['proxyuser']) ? ' value="'.htmlspecialchars($_COOKIE['proxyuser'], ENT_QUOTES).'"' : ''; ?> />
								</div>
								<div class="rl-form-group" style="margin-bottom: 0;">
									<label class="rl-label"><?php echo lang(38); ?>:</label>
									<input type="password" name="proxypass"<?php echo !empty($_COOKIE['proxypass']) ? ' value="'.htmlspecialchars($_COOKIE['proxypass'], ENT_QUOTES).'"' : ''; ?> />
								</div>
							</div>
						</div>
<?php if ($options['download_dir_is_changeable']) { ?>
						<!-- Save Directory -->
						<div class="rl-form-group">
							<label class="rl-checkbox">
								<input type="checkbox" name="saveto" id="saveto" onclick="javascript:var displ=this.checked?'':'none';document.getElementById('path').style.display=displ;"<?php echo !empty($_COOKIE['saveto']) ? ' checked="checked"' : ''; ?> />
								<span><?php echo lang(40); ?></span>
							</label>
							<div id="path" style="margin-top: 12px; padding: 16px; background: var(--bg-tertiary); border-radius: var(--radius-md);<?php echo !empty($_COOKIE['saveto']) ? '' : ' display: none;'; ?>">
								<label class="rl-label"><?php echo lang(41); ?>:</label>
								<input type="text" name="savedir" style="width: 100%;" value="<?php echo (!empty($_COOKIE['savedir']) ? $_COOKIE['savedir'] : (substr($options['download_dir'], 0, 6) != 'ftp://' ? realpath(DOWNLOAD_DIR) : $options['download_dir'])); ?>" />
							</div>
						</div>
<?php } ?>
						<!-- Premium Account -->
						<div class="rl-form-group">
							<label class="rl-checkbox">
								<input type="checkbox" value="on" name="premium_acc" id="premium_acc" onclick="javascript:var displ=this.checked?'':'none';document.getElementById('premiumblock').style.display=displ;"<?php if (count($premium_acc) > 0) echo ' checked="checked"'; ?> />
								<span><?php echo lang(42); ?></span>
							</label>
							<div id="premiumblock" style="margin-top: 12px; padding: 16px; background: var(--bg-tertiary); border-radius: var(--radius-md); display: none;">
								<div class="rl-form-group" style="margin-bottom: 12px;">
									<label class="rl-label"><?php echo lang(37); ?>:</label>
									<input type="text" name="premium_user" id="premium_user" />
								</div>
								<div class="rl-form-group" style="margin-bottom: 0;">
									<label class="rl-label"><?php echo lang(38); ?>:</label>
									<input type="password" name="premium_pass" id="premium_pass" />
								</div>
							</div>
						</div>
						<!-- Cookie Settings -->
						<div class="rl-form-group">
							<label class="rl-checkbox">
								<input type="checkbox" name="cookieuse" onclick="javascript:var displ=this.checked?'':'none';document.getElementById('cookieblock').style.display=displ;" />
								<span><?php echo lang(235); ?></span>
							</label>
							<div id="cookieblock" style="margin-top: 12px; padding: 16px; background: var(--bg-tertiary); border-radius: var(--radius-md); display: none;">
								<label class="rl-label"><?php echo lang(236); ?>:</label>
								<input type="text" name="cookie" id="cookie" style="width: 100%;" />
							</div>
						</div>
						<!-- YouTube Options -->
						<div class="rl-form-group">
							<label class="rl-checkbox">
								<input type="checkbox" name="ytube_mp4" onclick="javascript:var displ=this.checked?'':'none';document.getElementById('ytubeopt').style.display=displ;" checked="checked" />
								<span><?php echo lang(206); ?></span>
							</label>
							<div id="ytubeopt" style="margin-top: 12px; padding: 16px; background: var(--bg-tertiary); border-radius: var(--radius-md); display: none;">
								<div class="rl-form-group" style="margin-bottom: 12px;">
									<label class="rl-checkbox">
										<input type="checkbox" name="cleanname" checked="checked" value="1" />
										<span>Remove non-supported characters from filename</span>
									</label>
								</div>
								<div class="rl-form-group" style="margin-bottom: 0;">
									<label class="rl-label">Video Quality:</label>
									<select name="yt_fmt" id="yt_fmt" style="width: 100%;">
															<option value="highest" selected="selected"><?php echo lang(219); ?></option>
															<option value='22'>[22] Video: MP4 720p | Audio: AAC ~192 Kbps</option>
															<option value='43'>[43] Video: WebM 360p | Audio: Vorbis ~128 Kbps</option>
															<option value='18'>[18] Video: MP4 360p | Audio: AAC ~96 Kbps</option>
															<option value='5'>[5] Video: FLV 240p | Audio: MP3 ~64 Kbps</option>
															<option value='36'>[36] Video: 3GP 240p | Audio: AAC ~36 Kbps</option>
															<option value='17'>[17] Video: 3GP 144p | Audio: AAC ~24 Kbps</option>
															<option value='138'>[138] Video only: MP4 @ 4320p</option>
															<option value='272'>[272] Video only: WebM @ 4320p</option>
															<option value='315'>[315] Video only: WebM @ 2160p60</option>
															<option value='266'>[266] Video only: MP4 @ 2160p</option>
															<option value='313'>[313] Video only: WebM @ 2160p</option>
															<option value='308'>[308] Video only: WebM @ 1440p60</option>
															<option value='264'>[264] Video only: MP4 @ 1440p</option>
															<option value='271'>[271] Video only: WebM @ 1440p</option>
															<option value='299'>[299] Video only: MP4 @ 1080p60</option>
															<option value='303'>[303] Video only: WebM @ 1080p60</option>
															<option value='137'>[137] Video only: MP4 @ 1080p</option>
															<option value='248'>[248] Video only: WebM @ 1080p</option>
															<option value='298'>[298] Video only: MP4 @ 720p60</option>
															<option value='302'>[302] Video only: WebM @ 720p60</option>
															<option value='140'>[140] Audio only: AAC @ ~128 Kbps</option>
															<option value='171'>[171] Audio only: Vorbis @ ~160 Kbps</option>
															<option value='251'>[251] Audio only: Opus @ ~128 Kbps</option>
															<option value='250'>[250] Audio only: Opus @ ~64 Kbps</option>
															<option value='249'>[249] Audio only: Opus @ ~48 Kbps</option>
										</select>
								</div>
							</div>
						</div>

						<!-- Server-Side Download -->
						<div class="rl-form-group">
							<label class="rl-checkbox">
								<input type="checkbox" name="server_side" value="on" onclick="javascript:var displ=this.checked?'':'none';document.getElementById('serverside').style.display=displ;" />
								<span><?php echo lang(43); ?></span>
							</label>
							<div id="serverside" style="margin-top: 12px; padding: 16px; background: var(--bg-tertiary); border-radius: var(--radius-md); display: none;">
								<label class="rl-checkbox">
									<input type="checkbox" name="server_dodelay" value="on" onclick="javascript:var displ=this.checked?'':'none';document.getElementById('serverdelay').style.display=displ;" />
									<span><?php echo lang(44); ?></span>
								</label>
								<div id="serverdelay" style="margin-top: 12px; display: none;">
									<label class="rl-label"><?php echo lang(45); ?>:</label>
									<input type="text" name="serversidedelay" placeholder="Seconds" />
								</div>
							</div>
						</div>
					</div>
				</div>
			</div>
		</form>
	</div>
</div>
<?php include(TEMPLATE_DIR.'footer.php'); ?>