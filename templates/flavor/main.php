<?php
if (!defined('RAPIDLEECH')) { require_once("index.html"); exit; }
?>

<div class="fl-grid">
    <!-- ===== Sidebar ===== -->
    <aside class="fl-sidebar">

        <!-- Plugins -->
        <div class="fl-card">
            <div class="fl-card-head">
                <div class="fl-card-icon purple">
                    <svg width="18" height="18" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>
                </div>
                <div>
                    <div class="fl-card-title"><?php echo lang(333); ?></div>
                    <div class="fl-card-sub"><strong><?php echo count($host); ?></strong> <?php echo lang(333); ?></div>
                </div>
            </div>
            <div class="fl-plugins">
                <?php ksort($host); foreach ($host as $site => $file) { echo '<div class="fl-plug">'.$site.'</div>'; } ?>
            </div>
        </div>

        <?php global $premium_acc; if (!empty($premium_acc)) { ?>
        <!-- Premium -->
        <div class="fl-card">
            <div class="fl-card-head">
                <div class="fl-card-icon amber">
                    <svg width="18" height="18" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2L15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2z"/></svg>
                </div>
                <div>
                    <div class="fl-card-title"><?php echo lang(376); ?></div>
                    <div class="fl-card-sub">Premium services</div>
                </div>
            </div>
            <div class="fl-plugins">
                <?php foreach ($premium_acc as $sn => $v) { echo '<div class="fl-plug">'.str_replace('_','.',$sn).'</div>'; } ?>
            </div>
        </div>
        <?php } ?>

        <!-- Quick Actions -->
        <div class="fl-card">
            <div class="fl-card-head">
                <div class="fl-card-icon green">
                    <svg width="18" height="18" fill="currentColor" viewBox="0 0 24 24"><path d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
                </div>
                <div>
                    <div class="fl-card-title">Quick Actions</div>
                    <div class="fl-card-sub">Auto tools</div>
                </div>
            </div>
            <div style="display:flex;flex-direction:column;gap:8px;">
                <?php if (!$options['auto_download_disable']) { ?>
                <button class="fl-btn fl-btn-primary fl-btn-block" onclick="window.open('audl.php');return false;">
                    <svg width="15" height="15" fill="currentColor" viewBox="0 0 24 24"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>
                    <?php echo lang(334); ?>
                </button>
                <?php } ?>
                <?php if (!$options['auto_upload_disable']) { ?>
                <button class="fl-btn fl-btn-ghost fl-btn-block" onclick="window.open('auul.php');return false;">
                    <svg width="15" height="15" fill="currentColor" viewBox="0 0 24 24"><path d="M9 16h6v-6h4l-7-7-7 7h4v6zm-4 2h14v2H5v-2z"/></svg>
                    <?php echo lang(335); ?>
                </button>
                <?php } ?>
                <?php if (!$options['notes_disable']) { ?>
                <a href="javascript:openNotes();" class="fl-btn fl-btn-ghost fl-btn-block fl-btn-sm">
                    <svg width="15" height="15" fill="currentColor" viewBox="0 0 24 24"><path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/></svg>
                    <?php echo lang(327); ?>.txt
                </a>
                <?php } ?>
            </div>
        </div>
    </aside>

    <!-- ===== Content ===== -->
    <div>
        <!-- Tabs -->
        <nav class="fl-tabs">
            <button id="navcell1" class="cell-nav" onclick="javascript:switchCell(1);">
                <svg width="14" height="14" fill="currentColor" viewBox="0 0 24 24" style="vertical-align:-2px;margin-right:4px;"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>
                <?php echo lang(329); ?>
            </button>
            <button id="navcell2" class="cell-nav" onclick="javascript:switchCell(2);">
                <svg width="14" height="14" fill="currentColor" viewBox="0 0 24 24" style="vertical-align:-2px;margin-right:4px;"><path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 00.12-.61l-1.92-3.32a.488.488 0 00-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.44.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.07.62-.07.94s.02.64.07.94l-2.03 1.58a.49.49 0 00-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6A3.6 3.6 0 1115.6 12 3.611 3.611 0 0112 15.6z"/></svg>
                <?php echo lang(330); ?>
            </button>
            <button id="navcell3" class="cell-nav" onclick="javascript:switchCell(3);">
                <svg width="14" height="14" fill="currentColor" viewBox="0 0 24 24" style="vertical-align:-2px;margin-right:4px;"><path d="M20 6h-8l-2-2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm0 12H4V8h16v10z"/></svg>
                <?php echo lang(331); ?>
            </button>
            <button id="navcell4" class="cell-nav" onclick="javascript:switchCell(4);">
                <svg width="14" height="14" fill="currentColor" viewBox="0 0 24 24" style="vertical-align:-2px;margin-right:4px;"><path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM17 13l-5 5-5-5h3V9h4v4h3z"/></svg>
                Pending
            </button>
        </nav>

        <!-- Tab 1: Transload -->
        <div id="tb_content">
            <form action="<?php echo $PHP_SELF; ?>" name="transload" method="post"<?php if ($options['new_window']) echo ' target="_blank"'; ?>>
                <div class="tab-content" id="tb1">
                    <div style="display:grid;gap:20px;">
                        <div class="rl-form-group">
                            <label class="fl-label"><?php echo lang(207); ?></label>
                            <input type="text" name="link" id="link" placeholder="https://example.com/file.zip">
                        </div>
                        <div class="rl-form-group">
                            <label class="fl-label"><?php echo lang(208); ?></label>
                            <input type="text" name="referer" id="referer" placeholder="Optional referer URL">
                        </div>
                        <div>
                            <button type="<?php echo ($options['new_window'] && $options['new_window_js']) ? 'button" onclick="new_transload_window();' : 'submit'; ?>" class="fl-btn fl-btn-primary">
                                <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>
                                <?php echo lang(209); ?>
                            </button>
                        </div>

                        <!-- Advanced options -->
                        <div style="border-top:1px solid var(--fl-border);padding-top:16px;">
                            <label class="rl-checkbox">
                                <input type="checkbox" name="user_pass" onclick="javascript:var d=this.checked?'':'none';document.getElementById('usernpass').style.display=d;" value="on">
                                <?php echo lang(210); ?>
                            </label>
                            <div id="usernpass" style="display:none;margin-top:12px;padding:14px;background:var(--fl-surface-alt);border-radius:var(--fl-r);">
                                <div style="display:grid;gap:10px;grid-template-columns:1fr 1fr;">
                                    <div><label class="fl-label"><?php echo lang(211); ?></label><input type="text" name="iuser" value=""></div>
                                    <div><label class="fl-label"><?php echo lang(212); ?></label><input type="password" name="ipass" value=""></div>
                                </div>
                            </div>
                        </div>

                        <label class="rl-checkbox">
                            <input type="checkbox" name="add_comment" onclick="javascript:var d=this.checked?'':'none';document.getElementById('comment').style.display=d;">
                            <?php echo lang(213); ?>
                        </label>
                        <div id="comment" style="display:none;"><textarea name="comment" rows="3" placeholder="Add a comment..."></textarea></div>

                        <div style="border-top:1px solid var(--fl-border);padding-top:14px;">
                            <p style="color:var(--fl-accent);font-size:12px;font-weight:600;margin-bottom:10px;"><?php echo lang(214); ?></p>
                            <label class="rl-checkbox" style="margin-bottom:6px;"><input type="checkbox" name="dis_plug"><small><?php echo lang(215); ?></small></label>
                            <label class="rl-checkbox"><input type="checkbox" name="cookieuse" id="cookieuse_cb" onchange="document.getElementById('cookieblock').style.display=this.checked?'block':'none';"><small><?php echo lang(235); ?></small></label>
                            <div id="cookieblock" style="display:none;margin-top:10px;">
                                <label class="fl-label"><?php echo lang(236); ?></label>
                                <input type="text" name="cookie" id="cookie" value="" placeholder="key1=value1; key2=value2" style="margin-bottom:8px;">
                                <label class="fl-label">🍪 Full cookies.txt (for YouTube / yt-dlp)</label>
                                <textarea name="ytdlp_user_cookies" id="ytdlp_cookies_ta" rows="4" style="font:11px/1.4 monospace;" placeholder="# Netscape HTTP Cookie File&#10;# Paste exported cookies.txt here for YouTube login-required videos&#10;.youtube.com&#9;TRUE&#9;/&#9;TRUE&#9;0&#9;cookie_name&#9;cookie_value"></textarea>
                                <div style="display:flex;gap:8px;align-items:center;margin-top:4px;">
                                    <small style="color:var(--fl-text-3);font-size:11px;">Export from: <a href="https://chromewebstore.google.com/detail/get-cookiestxt-locally/cclelndahbckbenkjhflpdbgdldlbecc" target="_blank" style="color:var(--fl-accent);">Get cookies.txt LOCALLY</a></small>
                                    <small id="ytdlp_cookies_status" style="color:var(--fl-success);font-size:11px;display:none;">✓ Saved</small>
                                    <a href="javascript:void(0);" onclick="document.getElementById('ytdlp_cookies_ta').value='';localStorage.removeItem('rl_ytdlp_cookies');document.getElementById('ytdlp_cookies_status').style.display='none';" style="font-size:11px;color:var(--fl-danger);margin-left:auto;">Clear</a>
                                </div>
                                <script>
                                (function(){
                                    var ta=document.getElementById('ytdlp_cookies_ta');
                                    var saved=localStorage.getItem('rl_ytdlp_cookies');
                                    if(saved){ta.value=saved;document.getElementById('ytdlp_cookies_status').style.display='inline';document.getElementById('ytdlp_cookies_status').textContent='✓ Loaded from browser';}
                                    ta.addEventListener('input',function(){
                                        if(ta.value.trim()){localStorage.setItem('rl_ytdlp_cookies',ta.value);document.getElementById('ytdlp_cookies_status').style.display='inline';document.getElementById('ytdlp_cookies_status').textContent='✓ Saved';}
                                        else{localStorage.removeItem('rl_ytdlp_cookies');document.getElementById('ytdlp_cookies_status').style.display='none';}
                                    });
                                })();
                                </script>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Tab 2: Settings -->
                <div class="hide-table tab-content" id="tb2">
                    <div style="display:grid;gap:16px;">
                        <?php if (!$options['disable_email']) { ?>
                        <div class="fl-card" style="margin:0;box-shadow:none;background:var(--fl-surface-alt);">
                            <label class="rl-checkbox"><input type="checkbox" name="domail" id="domail" onclick="document.getElementById('emailtd').style.display=document.getElementById('splittd').style.display=this.checked?'':'none';document.getElementById('methodtd').style.display=(document.getElementById('splitchkbox').checked?(this.checked?'':'none'):'none');"<?php echo isset($_COOKIE['domail'])?' checked="checked"':''; ?>><strong><?php echo lang(237); ?></strong></label>
                            <div id="emailtd"<?php echo isset($_COOKIE['domail'])?'':' style="display:none;"'; ?> style="margin-top:10px;"><label class="fl-label"><?php echo lang(238); ?></label><input type="text" name="email" id="email"<?php echo !empty($_COOKIE['email'])?' value="'.htmlspecialchars($_COOKIE['email'],ENT_QUOTES,'UTF-8').'"':''; ?>></div>
                        </div>
                        <?php } ?>

                        <div class="fl-card" style="margin:0;box-shadow:none;background:var(--fl-surface-alt);" id="splittd"<?php echo isset($_COOKIE["split"])?'':' style="display:none;margin:0;box-shadow:none;background:var(--fl-surface-alt);"'; ?>>
                            <label class="rl-checkbox"><input id="splitchkbox" type="checkbox" name="split" onclick="javascript:var d=this.checked?'':'none';document.getElementById('methodtd').style.display=d;"<?php echo isset($_COOKIE["split"])?' checked="checked"':''; ?>><strong><?php echo lang(239); ?></strong></label>
                            <div id="methodtd"<?php echo isset($_COOKIE["split"])?'':' style="display:none;"'; ?> style="margin-top:10px;">
                                <div style="display:grid;gap:10px;grid-template-columns:1fr 1fr;">
                                    <div><label class="fl-label"><?php echo lang(240); ?></label><select name="method"><option value="tc"<?php echo isset($_COOKIE["method"])&&$_COOKIE["method"]=="tc"?" selected":""; ?>><?php echo lang(241); ?></option><option value="rfc"<?php echo isset($_COOKIE["method"])&&$_COOKIE["method"]=="rfc"?' selected="selected"':''; ?>><?php echo lang(242); ?></option></select></div>
                                    <div><label class="fl-label"><?php echo lang(243); ?></label><input type="text" name="partSize" style="width:80px;" value="<?php echo isset($_COOKIE["partSize"])&&is_numeric($_COOKIE["partSize"])?$_COOKIE["partSize"]:10; ?>"> <?php echo lang(244); ?></div>
                                </div>
                            </div>
                        </div>

                        <div class="fl-card" style="margin:0;box-shadow:none;background:var(--fl-surface-alt);">
                            <label class="rl-checkbox"><input type="checkbox" id="useproxy" name="useproxy" onclick="javascript:var d=this.checked?'':'none';document.getElementById('proxy').style.display=d;"<?php echo isset($_COOKIE["useproxy"])?' checked="checked"':''; ?>><strong><?php echo lang(245); ?></strong></label>
                            <div id="proxy"<?php echo isset($_COOKIE["useproxy"])?'':' style="display:none;"'; ?> style="margin-top:10px;">
                                <div style="display:grid;gap:10px;">
                                    <div><label class="fl-label"><?php echo lang(246); ?></label><input type="text" name="proxy" id="proxyproxy"<?php echo !empty($_COOKIE["proxy"])?' value="'.htmlspecialchars($_COOKIE["proxy"],ENT_QUOTES,'UTF-8').'"':''; ?>></div>
                                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;"><div><label class="fl-label"><?php echo lang(247); ?></label><input type="text" name="proxyuser" id="proxyuser"<?php echo !empty($_COOKIE["proxyuser"])?' value="'.htmlspecialchars($_COOKIE["proxyuser"],ENT_QUOTES,'UTF-8').'"':''; ?>></div><div><label class="fl-label"><?php echo lang(248); ?></label><input type="password" name="proxypass" id="proxypass"<?php echo !empty($_COOKIE["proxypass"])?' value="'.htmlspecialchars($_COOKIE["proxypass"],ENT_QUOTES,'UTF-8').'"':''; ?>></div></div>
                                </div>
                            </div>
                        </div>

                        <div class="fl-card" style="margin:0;box-shadow:none;background:var(--fl-surface-alt);">
                            <label class="rl-checkbox"><input type="checkbox" name="premium_acc" id="premium_acc" onclick="javascript:var d=this.checked?'':'none';document.getElementById('premiumblock').style.display=d;"<?php if(count($premium_acc)>0)print' checked="checked"'; ?>><strong><?php echo lang(249); ?></strong></label>
                            <div id="premiumblock" style="display:none;margin-top:10px;">
                                <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;"><div><label class="fl-label"><?php echo lang(250); ?></label><input type="text" name="premium_user" id="premium_user" value=""></div><div><label class="fl-label"><?php echo lang(251); ?></label><input type="password" name="premium_pass" id="premium_pass" value=""></div></div>
                            </div>
                        </div>

                        <div class="fl-card" style="margin:0;box-shadow:none;background:var(--fl-surface-alt);<?php echo !$options['download_dir_is_changeable']?'display:none;':''; ?>">
                            <label class="rl-checkbox"><input type="checkbox" name="saveto" id="saveto" onclick="javascript:var d=this.checked?'':'none';document.getElementById('path').style.display=d;"<?php echo isset($_COOKIE["saveto"])?' checked="checked"':''; ?>><strong><?php echo lang(252); ?></strong></label>
                            <div id="path"<?php echo isset($_COOKIE["saveto"])?'':' style="display:none;"'; ?> style="margin-top:10px;"><label class="fl-label"><?php echo lang(253); ?></label><input type="text" name="path" value="<?php echo htmlspecialchars(!empty($_COOKIE["path"])?$_COOKIE["path"]:(substr($options['download_dir'],0,6)!="ftp://"?realpath(DOWNLOAD_DIR):$options['download_dir']),ENT_QUOTES,'UTF-8'); ?>"></div>
                        </div>

                        <div class="fl-card" style="margin:0;box-shadow:none;background:var(--fl-surface-alt);">
                            <label class="rl-checkbox"><input type="checkbox" name="savesettings" id="savesettings"<?php echo isset($_COOKIE["savesettings"])?' checked="checked"':''; ?> onclick="javascript:var d=this.checked?'':'none';document.getElementById('clearsettings').style.display=d;"><strong><?php echo lang(254); ?></strong></label>
                            <div id="clearsettings"<?php echo isset($_COOKIE["savesettings"])?'':' style="display:none;"'; ?> style="margin-top:10px;"><a href="javascript:clearSettings();" class="fl-btn fl-btn-ghost fl-btn-sm"><?php echo lang(255); ?></a></div>
                        </div>
                    </div>
                </div>
            </form>

            <!-- Tab 3: Files -->
            <div class="hide-table tab-content" id="tb3">
                <?php
                _create_list();
                require_once(CLASS_DIR."options.php");
                if ($list) {
                    if ($options['show_all'] === true) unset($Path);
                ?>
                <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:16px;align-items:center;">
                    <a href="javascript:setCheckboxes(1);" class="chkmenu"><?php echo lang(256); ?></a>
                    <a href="javascript:setCheckboxes(0);" class="chkmenu"><?php echo lang(257); ?></a>
                    <a href="javascript:setCheckboxes(2);" class="chkmenu"><?php echo lang(258); ?></a>
                    <a href="#" onclick="$('#flist_match_hitems').toggle();$('#flist_match_search').focus();return false;" class="chkmenu"><?php echo lang(384); ?></a>
                    <?php if ($options['show_all'] === true) { ?>
                    <a href="javascript:showAll();" class="chkmenu"><?php echo lang(259); ?>
                    <script type="text/javascript">if(getCookie("showAll")==1){document.write("<?php echo lang(260); ?>");}else{document.write("<?php echo lang(261); ?>");}</script></a>
                    <?php } ?>
                </div>

                <div id="flist_match_hitems" style="display:none;padding:14px;background:var(--fl-surface-alt);border-radius:var(--fl-r);margin-bottom:16px;">
                    <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;">
                        <input type="text" id="flist_match_search" onkeypress="javascript:if(event.keyCode==13){flist_match();}" placeholder="Search files..." style="flex:1;min-width:180px;">
                        <button type="button" onclick="flist_match();" class="fl-btn fl-btn-primary fl-btn-sm"><?php echo lang(385); ?></button>
                        <label class="rl-checkbox"><input type="checkbox" id="flist_match_ins" checked="checked"><?php echo lang(386); ?></label>
                    </div>
                </div>

                <form action="<?php echo $PHP_SELF; ?>" name="flist" method="post">
                    <div style="margin-bottom:14px;"><?php echo renderActions(); ?></div>
                    <div style="overflow-x:auto;border-radius:var(--fl-r);border:1px solid var(--fl-border);">
                        <?php if ($options['flist_h_fixed']) { ?>
                        <table id="table_filelist_h" cellpadding="3" cellspacing="1" class="filelist" style="display:none;"><tbody><tr class="flisttblhdr" valign="bottom"><td id="file_list_checkbox_title_h">&nbsp;</td><td><b><?php echo lang(262); ?></b></td><td><b><?php echo lang(263); ?></b></td><td><b><?php echo lang(264); ?></b></td><td><b><?php echo lang(265); ?></b></td></tr></tbody></table>
                        <?php } ?>
                        <table id="table_filelist" cellpadding="3" cellspacing="0" width="100%" class="filelist">
                            <thead><tr class="flisttblhdr" valign="bottom"><td id="file_list_checkbox_title" class="sorttable_checkbox" style="width:40px;">&nbsp;</td><td class="sorttable_alpha"><b><?php echo lang(262); ?></b></td><td style="width:90px;"><b><?php echo lang(263); ?></b></td><td><b><?php echo lang(264); ?></b></td><td style="width:150px;"><b><?php echo lang(265); ?></b></td></tr></thead>
                            <tbody>
                <?php
                } else {
                    echo '<div style="text-align:center;padding:36px;color:var(--fl-text-3);">';
                    echo '<svg width="40" height="40" fill="currentColor" viewBox="0 0 24 24" style="opacity:.4;margin-bottom:8px;"><path d="M20 6h-8l-2-2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm0 12H4V8h16v10z"/></svg><br>';
                    echo lang(266);
                    echo '</div>';
                    if ($options['show_all'] === true) { unset($Path); ?>
                    <div style="text-align:center;margin-top:14px;"><a href="javascript:showAll();" class="fl-btn fl-btn-ghost fl-btn-sm"><?php echo lang(259); ?><script type="text/javascript">if(getCookie("showAll")==1){document.write("<?php echo lang(260); ?>");}else{document.write("<?php echo lang(261); ?>");}</script></a></div>
                    <?php }
                }

                if ($list) {
                    $total_files = $filecount = $total_size = 0;
                    foreach ($list as $key => $file) {
                        if (($size_time = file_data_size_time($file["name"])) === false) continue;
                        $total_files++; $total_size += $size_time[0];
                ?>
                <tr class="flistmouseoff" onmouseover="this.className='flistmouseon'" onmouseout="this.className='flistmouseoff'" align="center" title="<?php echo htmlentities(basename($file["name"])); ?>" onmousedown="checkFile(<?php echo $filecount; ?>);return false;">
                    <td><input onmousedown="checkFile(<?php echo $filecount;?>);return false;" id="files<?php echo $filecount; ?>" type="checkbox" name="files[]" value="<?php echo $file["date"]; ?>"></td>
                    <td style="text-align:left;"><?php echo link_for_file($file["name"], FALSE, 'style="font-weight:500;"'); ?></td>
                    <td><?php echo $file["size"]; ?></td>
                    <td style="text-align:left;font-size:12px;color:var(--fl-text-3);"><?php echo (!empty($file['comment'])?nl2br($file['comment']):'-'); ?></td>
                    <td style="font-size:12px;"><?php echo date("d.m.Y H:i:s",$file["date"]) ?></td>
                </tr>
                <?php $filecount++; } ?>
                            </tbody>
                <?php if (($total_files>1)&&($total_size>0)) echo '<tfoot><tr class="flisttblftr"><td>&nbsp;</td><td style="text-align:left;"><strong>Total:</strong></td><td><strong>'.bytesToKbOrMbOrGb($total_size).'</strong></td><td>&nbsp;</td><td>&nbsp;</td></tr></tfoot>'; ?>
                        </table>
                    </div>
                </form>
                <?php } ?>
            </div>

            <script type="text/javascript">
            /* <![CDATA[ */
            $(document).ready(function(){
            <?php if ($options['flist_sort']) { ?>sorttable.makeSortable(document.getElementById('table_filelist'));<?php } ?>
            <?php if ($options['flist_h_fixed']) { ?>$('#table_filelist_h tr.flisttblhdr td').each(function(id){$(this).click((function(x){return function(){$('#table_filelist tr.flisttblhdr td:eq('+x+')').click();table_filelist_refresh_headers();};})(id));});<?php } ?>
            });
            /* ]]> */
            </script>

            <!-- Tab 4: Pending Downloads -->
            <div class="hide-table tab-content" id="tb4">
                <div style="text-align:center;">
                    <h3 style="margin-bottom:14px;color:var(--fl-text);">Pending Downloads</h3>
                    <p style="color:var(--fl-text-3);font-size:12px;margin-bottom:16px;">Downloads running in background</p>
                    <div id="pending-downloads-container" style="min-height:80px;padding:16px;">
                        <div id="pending-downloads-loading" style="display:none;"><img alt="Loading..." src="<?php echo TEMPLATE_DIR; ?>images/ajax-loading.gif" style="vertical-align:middle;"> Loading...</div>
                        <div id="pending-downloads-empty" style="display:none;color:var(--fl-text-3);padding:16px;">No pending downloads.</div>
                        <table id="pending-downloads-table" class="filelist" cellpadding="5" cellspacing="0" width="100%" style="display:none;">
                            <thead><tr class="flisttblhdr"><td><b>Filename</b></td><td><b>Progress</b></td><td><b>Downloaded</b></td><td><b>Total</b></td><td><b>Elapsed</b></td></tr></thead>
                            <tbody id="pending-downloads-body"></tbody>
                        </table>
                    </div>
                    <p style="font-size:11px;color:var(--fl-text-3);">Auto-refreshes every 3 seconds</p>
                </div>
            </div>

            <script type="text/javascript">
            /* <![CDATA[ */
            var pendingDownloadsTimer=null;
            function formatElapsed(s){var h=Math.floor(s/3600),m=Math.floor((s%3600)/60),sec=s%60;if(h>0)return h+'h '+m+'m';if(m>0)return m+'m '+sec+'s';return sec+'s';}
            function refreshPendingDownloads(){$.ajax({url:'ajax.php?ajax=pending_downloads',dataType:'json',timeout:5000,success:function(d){$('#pending-downloads-loading').hide();if(d.downloads&&d.downloads.length>0){$('#pending-downloads-empty').hide();$('#pending-downloads-table').show();var h='';$.each(d.downloads,function(i,dl){var pc=dl.progress>=100?'var(--fl-success,#22c55e)':'var(--fl-accent,#6366f1)';var sz=dl.size?dl.size.split(' / '):['?','?'];h+='<tr class="flistmouseoff"><td><b>'+dl.filename+'</b></td><td style="width:140px;"><div style="background:var(--fl-border,#282d3e);border-radius:4px;overflow:hidden;height:18px;"><div style="background:'+pc+';width:'+dl.progress+'%;height:100%;transition:width .3s;"></div></div><small>'+dl.progress+'%</small></td><td>'+(sz[0]||'?')+'</td><td>'+(sz[1]||sz[0]||'?')+'</td><td>'+formatElapsed(dl.age||0)+'</td></tr>';});$('#pending-downloads-body').html(h);}else{$('#pending-downloads-table').hide();$('#pending-downloads-empty').text('No pending downloads.').show();}},error:function(){$('#pending-downloads-loading').hide();$('#pending-downloads-empty').text('Error loading downloads').show();}});}
            function startPendingDownloadsRefresh(){if(pendingDownloadsTimer)clearInterval(pendingDownloadsTimer);$('#pending-downloads-loading').show();refreshPendingDownloads();pendingDownloadsTimer=setInterval(refreshPendingDownloads,3000);}
            function stopPendingDownloadsRefresh(){if(pendingDownloadsTimer){clearInterval(pendingDownloadsTimer);pendingDownloadsTimer=null;}}
            $(document).ready(function(){$('#navcell4').on('click',function(){startPendingDownloadsRefresh();});});
            /* ]]> */
            </script>
        </div>

        <?php
        if (isset($_GET["act"])) echo '<script type="text/javascript">switchCell(3);</script>';
        elseif (isset($_GET["debug"])||isset($_POST["links"])) echo '<script type="text/javascript">switchCell(4);</script>';
        else echo '<script type="text/javascript">$("#navcell1").addClass("selected");</script>';
        ?>
    </div>
</div>

<!-- Server Info & Footer -->
<div style="margin-top:28px;">
    <div class="fl-card" style="max-width:820px;margin:0 auto;">
        <?php if ($options['file_size_limit'] > 0) { ?>
        <div style="text-align:center;padding:10px;background:var(--fl-surface-alt);border-radius:var(--fl-r);margin-bottom:14px;">
            <span style="color:var(--fl-warn);"><?php echo lang(337); ?> <strong><?php echo bytesToKbOrMbOrGb($options['file_size_limit']*1024*1024); ?></strong></span>
        </div>
        <?php } ?>

        <?php
        $delete_delay = $options['delete_delay'];
        if (is_numeric($delete_delay) && $delete_delay > 0) {
            echo '<div style="text-align:center;margin-bottom:14px;">';
            if ($delete_delay > 3600) { $dd = round($delete_delay/3600,1); echo '<span class="autodel">'.lang(282).': <strong>'.$dd.'</strong> '.lang(283).'</span>'; }
            else { $dd = round($delete_delay/60); echo '<span class="autodel">'.lang(282).': <strong>'.$dd.'</strong> '.lang(284).'</span>'; }
            echo '</div>';
        }
        ?>

        <?php if ($options['server_info']) { ob_start(); ?>
        <div id="server_stats"><?php require_once(CLASS_DIR."sinfo.php"); ?></div>
        <?php if ($options['ajax_refresh']) { ?><script type="text/javascript">var stats_timer=setTimeout("refreshStats()",10*1000);</script><?php } ob_end_flush(); } ?>

        <hr>
        <div style="text-align:center;color:var(--fl-text-3);font-size:12px;"><?php print CREDITS; ?></div>
    </div>
</div>

<?php
if (isset($_GET["act"]) && ($_GET["act"] == 'unrar_go') && !$options['disable_unrar']) { require_once(CLASS_DIR."options/unrar.php"); unrar_go_go(); }
elseif (isset($_GET["act"]) && ($_GET["act"] == 'rar_go') && !$options['disable_rar']) { require_once(CLASS_DIR."options/rar.php"); rar_go_go(); }
?>
