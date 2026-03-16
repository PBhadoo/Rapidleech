<?php

require_once('rl_init.php');

if ($options['auto_upload_disable']) {
	require_once('deny.php');
	exit();
}
error_reporting(0);
ignore_user_abort(true);

login_check();

$id = 1;
require_once(HOST_DIR.'download/hosts.php');
require_once(CLASS_DIR.'http.php');
include(TEMPLATE_DIR.'header.php');
?>
<?php
	// If the user submit to upload, go into upload page
	if ($_GET['action'] == 'upload') {
		// Define another constant
		if(!defined('CRLF')) define('CRLF',"\r\n");
		// The new line variable
		$nn = "\r\n";
		// Initialize some variables here
		$uploads = array();
		$total = 0;
		$hostss = array();
		// Get number of windows to be opened
		$openwin = (int) $_POST['windows'];
		if ($openwin <= 0) $openwin = 4;
		$openwin--;
		// Sort the upload hosts and files
		foreach ($_POST['files'] as $file) {
			foreach ($_POST['hosts'] as $host) {
				$hostss[] = $host;
				$uploads[] = array('host' => $host,
					'file' => DOWNLOAD_DIR.base64_decode($file));
				$total++;
			}
		}
		// Clear out duplicate hosts
		$hostss = array_unique($hostss);
		// If there aren't anything
		if (count($uploads) == 0) {
			echo lang(46);
			exit;
		}
		$save_style = "";
		if (!empty($_POST['save_style']) && $_POST['save_style'] != lang(51)) {
			$save_style = '&save_style='.urlencode(base64_encode($_POST['save_style']));
		}
		$start_link = "upload.php";
		$i = 0;
		foreach ($uploads as $upload) {
			$getlinks[$i][] = "?uploaded=".$upload['host']."&filename=".urlencode(base64_encode($upload['file'])).$save_style;
			$i++;
			if ($i>$openwin) $i = 0;
		}
?>
<script type="text/javascript">
/* <![CDATA[ */
<?php
	for ($i=0;$i<=$openwin;$i++) {
?>
	var current_dlink<?php echo $i; ?>=-1;
	var links<?php echo $i; ?> = new Array();
<?php
	}
?>
	var start_link='<?php echo $start_link; ?>';
	var usingwin = 0;

	function startauto()
		{
			current_dlink0=-1;
			//document.getElementById('auto').style.display='none';
			nextlink0();
<?php
	for ($i=1;$i<=$openwin;$i++) {
?>
			if (links<?php echo $i; ?>.length > 0) {
				current_dlink<?php echo $i; ?>=-1;
				nextlink<?php echo $i; ?>();
			} else {
				document.getElementById('idownload<?php echo $i; ?>').style.display = 'none';
			}
<?php
	}
?>
		}

<?php
	for ($i=0;$i<=$openwin;$i++) {
?>
	function nextlink<?php echo $i; ?>() {
		current_dlink<?php echo $i; ?>++;
		if (current_dlink<?php echo $i; ?> < links<?php echo $i; ?>.length) {
			opennewwindow<?php echo $i; ?>(current_dlink<?php echo $i; ?>);
		} else {
			document.getElementById('idownload<?php echo $i; ?>').style.display = 'none';
		}
	}

	function opennewwindow<?php echo $i; ?>(id) {
		window.frames["idownload<?php echo $i; ?>"].location = start_link+links<?php echo $i; ?>[id]+'&auul=<?php echo $i; ?>';
	}
<?php
	}
		for ($j=0;$j<=$openwin;$j++) {
			foreach ($getlinks[$j] as $i=>$link) {
				echo "\tlinks{$j}[".$i."]='".$link."';\n";
			}
		}
?>
/* ]]> */
</script>

<div class="rl-container">
	<div class="rl-card">
		<div class="rl-card-header">
			<div class="rl-card-icon">
				<svg width="20" height="20" fill="currentColor" viewBox="0 0 24 24">
					<path d="M9 16h6v-6h4l-7-7-7 7h4v6zm-4 2h14v2H5v-2z"/>
				</svg>
			</div>
			<div>
				<div class="rl-card-title"><?php echo lang(335); ?> - In Progress</div>
				<div class="rl-card-subtitle">Uploading files to selected hosts</div>
			</div>
		</div>
		
		<div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(400px, 1fr)); gap: 16px;">
<?php
	for ($i=0;$i<=$openwin;$i++) {
?>
			<iframe src="" name="idownload<?php echo $i; ?>" id="idownload<?php echo $i; ?>" style="width: 100%; height: 300px; border: 1px solid var(--border-color); border-radius: var(--radius-md); background: var(--bg-secondary);"><?php echo lang(30); ?></iframe>
<?php
	}
?>
		</div>
		
		<div style="margin-top: 20px; text-align: center;">
			<a href="files/myuploads.txt" class="rl-btn rl-btn-secondary">View myuploads.txt</a>
		</div>
	</div>
</div>
<script type="text/javascript">startauto();</script>
<?php

	} else {
?>
<?php 
$options['show_all'] = true;
$_COOKIE["showAll"] = 1;
_create_list();
require_once("classes/options.php");
unset($Path);
?>

<div class="rl-container">
	<form name="flist" method="post" action="auul.php?action=upload">
		<div class="rl-card" style="margin-bottom: 24px;">
			<div class="rl-card-header">
				<div class="rl-card-icon">
					<svg width="20" height="20" fill="currentColor" viewBox="0 0 24 24">
						<path d="M9 16h6v-6h4l-7-7-7 7h4v6zm-4 2h14v2H5v-2z"/>
					</svg>
				</div>
				<div>
					<div class="rl-card-title"><?php echo lang(335); ?></div>
					<div class="rl-card-subtitle">Upload files to multiple hosts</div>
				</div>
			</div>
			
			<!-- Upload Hosts Selection -->
			<div class="rl-form-group">
				<label class="rl-label" style="margin-bottom: 12px;"><?php echo lang(47); ?></label>
				<div class="plugin-list" style="max-height: 200px; overflow-y: auto; padding: 12px; background: var(--bg-tertiary); border-radius: var(--radius-md);">
<?php
	$d = opendir(HOST_DIR."upload/");
	while (false !== ($modules = readdir($d)))
		{
			if($modules!="." && $modules!="..")
				{
					if(is_file(HOST_DIR."upload/".$modules))
						{
							if (strpos($modules,".index.php")) include_once(HOST_DIR."upload/".$modules);
						}
				}
		}
	if (empty($upload_services)) 
	{
		echo '<span class="warning"><b>'.lang(48).'</b></span>';
	} else {
		sort($upload_services); reset($upload_services);
		$cc=0;
		foreach($upload_services as $upl)
		{
?>
					<label class="rl-checkbox" style="margin-bottom: 8px; padding: 8px 12px; background: var(--bg-secondary); border-radius: var(--radius-sm);">
						<input type="checkbox" name="hosts[]" value="<?php echo $upl; ?>" />
						<span><?php echo str_replace("_"," ",$upl)." (".($max_file_size[$upl]==false ? "Unlim" : $max_file_size[$upl]."Mb").")"; ?></span>
					</label>
<?php
		}
	}
?>
				</div>
			</div>
			<!-- Upload Settings -->
			<div style="display: grid; gap: 16px; padding: 20px; background: var(--bg-tertiary); border-radius: var(--radius-md); margin-bottom: 20px;">
				<div class="rl-form-group" style="display: flex; align-items: center; gap: 12px; margin-bottom: 0;">
					<label class="rl-label" style="margin-bottom: 0; white-space: nowrap;"><?php echo lang(49); ?>:</label>
					<input type="text" name="windows" value="4" style="width: 60px; text-align: center;" />
				</div>
				<div class="rl-form-group" style="margin-bottom: 0;">
					<label class="rl-label"><?php echo lang(50); ?>:</label>
					<input type="text" name="save_style" placeholder="{name}: {link} or {link}" style="width: 100%;" />
				</div>
			</div>
			
			<!-- Action Buttons -->
			<div style="display: flex; flex-wrap: wrap; gap: 12px; align-items: center; margin-bottom: 20px;">
				<input type="submit" name="submit" value="<?php echo lang(335); ?>" class="rl-btn rl-btn-primary" />
				<a href="javascript:setCheckboxes(1);" class="rl-btn rl-btn-secondary rl-btn-sm"><?php echo lang(52); ?></a>
				<a href="javascript:setCheckboxes(0);" class="rl-btn rl-btn-secondary rl-btn-sm"><?php echo lang(53); ?></a>
				<a href="javascript:setCheckboxes(2);" class="rl-btn rl-btn-secondary rl-btn-sm"><?php echo lang(54); ?></a>
				<a href="files/myuploads.txt" class="rl-btn rl-btn-secondary rl-btn-sm">myuploads.txt</a>
			</div>
		</div>
		<!-- Files Card -->
		<div class="rl-card">
			<div class="rl-card-header">
				<div class="rl-card-icon" style="background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%);">
					<svg width="20" height="20" fill="currentColor" viewBox="0 0 24 24">
						<path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm4 18H6V4h7v5h5v11z"/>
					</svg>
				</div>
				<div>
					<div class="rl-card-title"><?php echo lang(55); ?></div>
					<div class="rl-card-subtitle">Select files to upload</div>
				</div>
			</div>
			
			<div style="overflow-x: auto;">
<table cellpadding="3" cellspacing="0" width="100%" class="filelist" id="table_filelist_au" style="border-radius: var(--radius-md); overflow: hidden;">
	<tr class="flisttblhdr" valign="bottom">
		<th class="sorttable_checkbox" style="width: 40px;">&nbsp;</th>
		<th class="sorttable_alpha"><?php echo lang(55); ?></th>
		<th style="width: 100px;"><?php echo lang(56); ?></th>
	</tr>
<?php
if (!$list) {
?>
	<tr><td colspan="3" style="text-align: center; padding: 40px; color: var(--text-muted);"><?php echo lang(57); ?></td></tr>
<?php
} else {
?>
<?php
	foreach($list as $key => $file) {
		if(file_exists($file["name"])) {
?>
	<tr class="flistmouseoff" onmouseover="this.className='flistmouseon'" onmouseout="this.className='flistmouseoff'">
		<td style="text-align: center;"><input type="checkbox" name="files[]" value="<?php echo base64_encode(basename($file["name"])); ?>" /></td>
		<td><?php echo basename($file["name"]); ?></td>
		<td><?php echo $file["size"]; ?></td>
	</tr>
<?php
		}
	}
?>
</table>
			</div>
<?php
	if ($options['flist_sort']) {
		echo '<script type="text/javascript">sorttable.makeSortable(document.getElementById("table_filelist_au"));</script>';
	}
?>
			
			<!-- Save Style Legend -->
			<div style="margin-top: 20px; padding: 16px; background: var(--bg-tertiary); border-radius: var(--radius-md);">
				<p style="color: var(--text-secondary); margin-bottom: 8px;"><strong><?php echo lang(58); ?></strong></p>
				<ul style="margin: 0; padding-left: 20px; color: var(--text-muted);">
					<li><code>{link}</code> : <?php echo lang(59); ?></li>
					<li><code>{name}</code> : <?php echo lang(60); ?></li>
					<li><?php echo lang(51); ?> : <?php echo lang(61); ?></li>
				</ul>
				<p style="color: var(--text-muted); margin-top: 12px;"><?php echo lang(62); ?></p>
			</div>
		</div>
	</form>
</div>
<?php
}
}
?>
<?php include(TEMPLATE_DIR.'footer.php'); ?>