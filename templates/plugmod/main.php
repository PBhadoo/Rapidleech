<?php
if (!defined('RAPIDLEECH')) {
    require_once("index.html");
    exit;
}
?>

<div class="rl-main">
    <!-- Sidebar -->
    <aside class="rl-sidebar">
        <!-- Plugins Card -->
        <div class="rl-card">
            <div class="rl-card-header">
                <div class="rl-card-icon">
                    <svg width="20" height="20" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                    </svg>
                </div>
                <div>
                    <div class="rl-card-title"><?php echo lang(333); ?></div>
                    <div class="rl-card-subtitle"><strong><?php echo count($host); ?></strong> <?php echo lang(333); ?></div>
                </div>
            </div>
            <div class="plugin-list">
                <?php
                ksort($host);
                foreach ($host as $site => $file) {
                    echo '<div class="plugin-item">'.$site.'</div>';
                }
                ?>
            </div>
        </div>

        <?php
        global $premium_acc;
        if (!empty($premium_acc)) {
        ?>
        <!-- Premium Accounts Card -->
        <div class="rl-card">
            <div class="rl-card-header">
                <div class="rl-card-icon" style="background: linear-gradient(135deg, #f59e0b 0%, #ef4444 100%);">
                    <svg width="20" height="20" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M12 2L15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2z"/>
                    </svg>
                </div>
                <div>
                    <div class="rl-card-title"><?php echo lang(376); ?></div>
                    <div class="rl-card-subtitle">Premium services</div>
                </div>
            </div>
            <div class="plugin-list">
                <?php
                foreach ($premium_acc as $serverName => $value) {
                    echo '<div class="plugin-item">'. str_replace('_', '.', $serverName) .'</div>';
                }
                ?>
            </div>
        </div>
        <?php } ?>

        <!-- Quick Actions Card -->
        <div class="rl-card">
            <div class="rl-card-header">
                <div class="rl-card-icon" style="background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%);">
                    <svg width="20" height="20" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M13 10V3L4 14h7v7l9-11h-7z"/>
                    </svg>
                </div>
                <div>
                    <div class="rl-card-title">Quick Actions</div>
                    <div class="rl-card-subtitle">Auto tools</div>
                </div>
            </div>
            <div style="display: flex; flex-direction: column; gap: 10px;">
                <?php if (!$options['auto_download_disable']) { ?>
                <button class="rl-btn rl-btn-primary rl-btn-block" onclick="window.open('audl.php');return false;">
                    <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/>
                    </svg>
                    <?php echo lang(334); ?>
                </button>
                <?php } ?>
                <?php if (!$options['auto_upload_disable']) { ?>
                <button class="rl-btn rl-btn-secondary rl-btn-block" onclick="window.open('auul.php');return false;">
                    <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M9 16h6v-6h4l-7-7-7 7h4v6zm-4 2h14v2H5v-2z"/>
                    </svg>
                    <?php echo lang(335); ?>
                </button>
                <?php } ?>
                <?php if (!$options['notes_disable']) { ?>
                <a href="javascript:openNotes();" class="rl-btn rl-btn-secondary rl-btn-block rl-btn-sm">
                    <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/>
                    </svg>
                    <?php echo lang(327); ?>.txt
                </a>
                <?php } ?>
            </div>
        </div>
    </aside>

    <!-- Main Content Area -->
    <div class="rl-content">
        <!-- Tab Navigation -->
        <nav class="rl-tabs">
            <button id="navcell1" class="cell-nav" onclick="javascript:switchCell(1);">
                <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24" style="vertical-align: -3px; margin-right: 6px;">
                    <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/>
                </svg>
                <?php echo lang(329); ?>
            </button>
            <button id="navcell2" class="cell-nav" onclick="javascript:switchCell(2);">
                <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24" style="vertical-align: -3px; margin-right: 6px;">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
                </svg>
                <?php echo lang(330); ?>
            </button>
            <button id="navcell3" class="cell-nav" onclick="javascript:switchCell(3);">
                <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24" style="vertical-align: -3px; margin-right: 6px;">
                    <path d="M20 6h-8l-2-2H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm0 12H4V8h16v10z"/>
                </svg>
                <?php echo lang(331); ?>
            </button>
            <button id="navcell4" class="cell-nav" onclick="javascript:switchCell(4);">
                <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24" style="vertical-align: -3px; margin-right: 6px;">
                    <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/>
                </svg>
                Pending Downloads
            </button>
        </nav>

        <!-- Tab 1: Transload -->
        <div id="tb_content">
            <form action="<?php echo $PHP_SELF; ?>" name="transload" method="post"<?php if ($options['new_window']) { echo ' target="_blank"'; } ?>>
                <div class="tab-content" id="tb1">
                    <div style="display: grid; gap: 24px;">
                        <div class="rl-form-group">
                            <label class="rl-label">
                                <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24" style="vertical-align: -3px; margin-right: 6px;">
                                    <path d="M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z"/>
                                </svg>
                                <?php echo lang(207); ?>
                            </label>
                            <input type="text" name="link" id="link" placeholder="https://example.com/file.zip" style="width: 100%; max-width: 100%;">
                        </div>
                        
                        <div class="rl-form-group">
                            <label class="rl-label">
                                <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24" style="vertical-align: -3px; margin-right: 6px;">
                                    <path d="M17 7h-4v2h4c1.65 0 3 1.35 3 3s-1.35 3-3 3h-4v2h4c2.76 0 5-2.24 5-5s-2.24-5-5-5zm-6 8H7c-1.65 0-3-1.35-3-3s1.35-3 3-3h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-2z"/>
                                </svg>
                                <?php echo lang(208); ?>
                            </label>
                            <input type="text" name="referer" id="referer" placeholder="Optional referer URL" style="width: 100%; max-width: 100%;">
                        </div>

                        <div style="display: flex; gap: 12px; flex-wrap: wrap;">
                            <button type="<?php echo ($options['new_window'] && $options['new_window_js']) ? 'button" onclick="new_transload_window();' : 'submit'; ?>" class="rl-btn rl-btn-primary">
                                <svg width="18" height="18" fill="currentColor" viewBox="0 0 24 24">
                                    <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/>
                                </svg>
                                <?php echo lang(209); ?>
                            </button>
                        </div>

                        <!-- Advanced Options -->
                        <div style="border-top: 1px solid var(--border-color); padding-top: 20px; margin-top: 8px;">
                            <label class="rl-checkbox">
                                <input type="checkbox" name="user_pass" onclick="javascript:var displ=this.checked?'':'none';document.getElementById('usernpass').style.display=displ;" value="on">
                                <?php echo lang(210); ?>
                            </label>
                            
                            <div id="usernpass" style="display: none; margin-top: 16px; padding: 16px; background: var(--bg-tertiary); border-radius: var(--radius-md);">
                                <div style="display: grid; gap: 12px; grid-template-columns: 1fr 1fr;">
                                    <div>
                                        <label class="rl-label"><?php echo lang(211); ?></label>
                                        <input type="text" name="iuser" value="">
                                    </div>
                                    <div>
                                        <label class="rl-label"><?php echo lang(212); ?></label>
                                        <input type="password" name="ipass" value="">
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div>
                            <label class="rl-checkbox">
                                <input type="checkbox" name="add_comment" onclick="javascript:var displ=this.checked?'':'none';document.getElementById('comment').style.display=displ;">
                                <?php echo lang(213); ?>
                            </label>
                            <div id="comment" style="display: none; margin-top: 12px;">
                                <textarea name="comment" rows="4" placeholder="Add a comment..."></textarea>
                            </div>
                        </div>

                        <div style="border-top: 1px solid var(--border-color); padding-top: 16px;">
                            <p style="color: var(--text-accent); font-size: 13px; font-weight: 500; margin-bottom: 12px;">
                                <svg width="14" height="14" fill="currentColor" viewBox="0 0 24 24" style="vertical-align: -2px; margin-right: 4px;">
                                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
                                </svg>
                                <?php echo lang(214); ?>
                            </p>
                            <label class="rl-checkbox" style="margin-bottom: 8px;">
                                <input type="checkbox" name="dis_plug">
                                <small><?php echo lang(215); ?></small>
                            </label>
                            <label class="rl-checkbox">
                                <input type="checkbox" name="cookieuse" onclick="javascript:var displ=this.checked?'':'none';document.getElementById('cookieblock').style.display=displ;">
                                <small><?php echo lang(235); ?></small>
                            </label>
                            <div id="cookieblock" style="display: none; margin-top: 12px;">
                                <label class="rl-label"><?php echo lang(236); ?></label>
                                <input type="text" name="cookie" id="cookie" value="">
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Tab 2: Options -->
                <div class="hide-table tab-content" id="tb2">
                    <div style="display: grid; gap: 20px;">
                        <?php if (!$options['disable_email']) { ?>
                        <div class="rl-card" style="margin: 0; box-shadow: none; background: var(--bg-tertiary);">
                            <label class="rl-checkbox">
                                <input type="checkbox" name="domail" id="domail" onclick="document.getElementById('emailtd').style.display=document.getElementById('splittd').style.display=this.checked?'':'none';document.getElementById('methodtd').style.display=(document.getElementById('splitchkbox').checked ? (this.checked ? '' : 'none') : 'none');"<?php echo isset($_COOKIE['domail']) ? ' checked="checked"' : ''; ?>>
                                <strong><?php echo lang(237); ?></strong>
                            </label>
                            <div id="emailtd"<?php echo isset($_COOKIE['domail']) ? '' : ' style="display: none;"'; ?> style="margin-top: 12px;">
                                <label class="rl-label"><?php echo lang(238); ?></label>
                                <input type="text" name="email" id="email"<?php echo !empty($_COOKIE['email']) ? ' value="'.$_COOKIE['email'].'"' : ''; ?>>
                            </div>
                        </div>
                        <?php } ?>

                        <div class="rl-card" style="margin: 0; box-shadow: none; background: var(--bg-tertiary);" id="splittd"<?php echo isset($_COOKIE["split"]) ? '' : ' style="display: none; margin: 0; box-shadow: none; background: var(--bg-tertiary);"'; ?>>
                            <label class="rl-checkbox">
                                <input id="splitchkbox" type="checkbox" name="split" onclick="javascript:var displ=this.checked?'':'none';document.getElementById('methodtd').style.display=displ;"<?php echo isset($_COOKIE["split"]) ? ' checked="checked"' : ''; ?>>
                                <strong><?php echo lang(239); ?></strong>
                            </label>
                            <div id="methodtd"<?php echo isset($_COOKIE["split"]) ? '' : ' style="display: none;"'; ?> style="margin-top: 12px;">
                                <div style="display: grid; gap: 12px; grid-template-columns: 1fr 1fr;">
                                    <div>
                                        <label class="rl-label"><?php echo lang(240); ?></label>
                                        <select name="method">
                                            <option value="tc"<?php echo isset($_COOKIE["method"]) && $_COOKIE["method"] == "tc" ? " selected" : ""; ?>><?php echo lang(241); ?></option>
                                            <option value="rfc"<?php echo isset($_COOKIE["method"]) && $_COOKIE["method"] == "rfc" ? ' selected="selected"' : ''; ?>><?php echo lang(242); ?></option>
                                        </select>
                                    </div>
                                    <div>
                                        <label class="rl-label"><?php echo lang(243); ?></label>
                                        <input type="text" name="partSize" style="width: 80px;" value="<?php echo isset($_COOKIE["partSize"]) && is_numeric($_COOKIE["partSize"]) ? $_COOKIE["partSize"] : 10; ?>"> <?php echo lang(244); ?>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div class="rl-card" style="margin: 0; box-shadow: none; background: var(--bg-tertiary);">
                            <label class="rl-checkbox">
                                <input type="checkbox" id="useproxy" name="useproxy" onclick="javascript:var displ=this.checked?'':'none';document.getElementById('proxy').style.display=displ;"<?php echo isset($_COOKIE["useproxy"]) ? ' checked="checked"' : ''; ?>>
                                <strong><?php echo lang(245); ?></strong>
                            </label>
                            <div id="proxy"<?php echo isset($_COOKIE["useproxy"]) ? '' : ' style="display: none;"'; ?> style="margin-top: 12px;">
                                <div style="display: grid; gap: 12px;">
                                    <div>
                                        <label class="rl-label"><?php echo lang(246); ?></label>
                                        <input type="text" name="proxy" id="proxyproxy"<?php echo !empty($_COOKIE["proxy"]) ? ' value="'.$_COOKIE["proxy"].'"' : ''; ?>>
                                    </div>
                                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                                        <div>
                                            <label class="rl-label"><?php echo lang(247); ?></label>
                                            <input type="text" name="proxyuser" id="proxyuser"<?php echo !empty($_COOKIE["proxyuser"]) ? ' value="'.$_COOKIE["proxyuser"].'"' : ''; ?>>
                                        </div>
                                        <div>
                                            <label class="rl-label"><?php echo lang(248); ?></label>
                                            <input type="password" name="proxypass" id="proxypass"<?php echo !empty($_COOKIE["proxypass"]) ? ' value="'.$_COOKIE["proxypass"].'"' : ''; ?>>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div class="rl-card" style="margin: 0; box-shadow: none; background: var(--bg-tertiary);">
                            <label class="rl-checkbox">
                                <input type="checkbox" name="premium_acc" id="premium_acc" onclick="javascript:var displ=this.checked?'':'none';document.getElementById('premiumblock').style.display=displ;"<?php if (count($premium_acc) > 0) print ' checked="checked"'; ?>>
                                <strong><?php echo lang(249); ?></strong>
                            </label>
                            <div id="premiumblock" style="display: none; margin-top: 12px;">
                                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                                    <div>
                                        <label class="rl-label"><?php echo lang(250); ?></label>
                                        <input type="text" name="premium_user" id="premium_user" value="">
                                    </div>
                                    <div>
                                        <label class="rl-label"><?php echo lang(251); ?></label>
                                        <input type="password" name="premium_pass" id="premium_pass" value="">
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div class="rl-card" style="margin: 0; box-shadow: none; background: var(--bg-tertiary);<?php echo (!$options['download_dir_is_changeable'] ? ' display:none;' : '');?>">
                            <label class="rl-checkbox">
                                <input type="checkbox" name="saveto" id="saveto" onclick="javascript:var displ=this.checked?'':'none';document.getElementById('path').style.display=displ;"<?php echo isset($_COOKIE["saveto"]) ? ' checked="checked"' : ''; ?>>
                                <strong><?php echo lang(252); ?></strong>
                            </label>
                            <div id="path"<?php echo isset($_COOKIE["saveto"]) ? '' : ' style="display: none;"'; ?> style="margin-top: 12px;">
                                <label class="rl-label"><?php echo lang(253); ?></label>
                                <input type="text" name="path" style="width: 100%; max-width: 100%;" value="<?php echo (!empty($_COOKIE["path"]) ? $_COOKIE["path"] : (substr($options['download_dir'], 0, 6) != "ftp://" ? realpath(DOWNLOAD_DIR) : $options['download_dir'])); ?>">
                            </div>
                        </div>

                        <div class="rl-card" style="margin: 0; box-shadow: none; background: var(--bg-tertiary);">
                            <label class="rl-checkbox">
                                <input type="checkbox" name="savesettings" id="savesettings"<?php echo isset($_COOKIE["savesettings"]) ? ' checked="checked"' : ''; ?> onclick="javascript:var displ=this.checked?'':'none';document.getElementById('clearsettings').style.display=displ;">
                                <strong><?php echo lang(254); ?></strong>
                            </label>
                            <div id="clearsettings"<?php echo isset($_COOKIE["savesettings"]) ? '' : ' style="display: none;"'; ?> style="margin-top: 12px;">
                                <a href="javascript:clearSettings();" class="rl-btn rl-btn-secondary rl-btn-sm"><?php echo lang(255); ?></a>
                            </div>
                        </div>
                    </div>
                </div>
            </form>

            <!-- Tab 3: Files -->
            <div class="hide-table tab-content" id="tb3">
                <?php
                _create_list();
                require_once(CLASS_DIR."options.php");
                if($list) {
                    if ($options['show_all'] === true) {
                        unset($Path);
                    }
                ?>
                <div style="display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 20px; align-items: center;">
                    <a href="javascript:setCheckboxes(1);" class="chkmenu"><?php echo lang(256); ?></a>
                    <a href="javascript:setCheckboxes(0);" class="chkmenu"><?php echo lang(257); ?></a>
                    <a href="javascript:setCheckboxes(2);" class="chkmenu"><?php echo lang(258); ?></a>
                    <a href="#" onclick="$('#flist_match_hitems').toggle();$('#flist_match_search').focus();return false;" class="chkmenu"><?php echo lang(384); ?></a>
                    <?php if ($options['show_all'] === true) { ?>
                    <a href="javascript:showAll();" class="chkmenu"><?php echo lang(259); ?>
                    <script type="text/javascript">
                    if(getCookie("showAll") == 1) {
                        document.write("<?php echo lang(260); ?>");
                    } else {
                        document.write("<?php echo lang(261); ?>");
                    }
                    </script></a>
                    <?php } ?>
                </div>

                <div id="flist_match_hitems" style="display:none; padding: 16px; background: var(--bg-tertiary); border-radius: var(--radius-md); margin-bottom: 20px;">
                    <div style="display: flex; gap: 12px; align-items: center; flex-wrap: wrap;">
                        <input type="text" id="flist_match_search" onkeypress="javascript:if(event.keyCode==13){flist_match();}" placeholder="Search files..." style="flex: 1; min-width: 200px;">
                        <button type="button" onclick="flist_match();" class="rl-btn rl-btn-primary rl-btn-sm"><?php echo lang(385); ?></button>
                        <label class="rl-checkbox">
                            <input type="checkbox" id="flist_match_ins" checked="checked">
                            <?php echo lang(386); ?>
                        </label>
                    </div>
                </div>

                <form action="<?php echo $PHP_SELF; ?>" name="flist" method="post">
                    <div style="margin-bottom: 16px;">
                        <?php echo renderActions(); ?>
                    </div>
                    
                    <div style="overflow-x: auto; border-radius: var(--radius-md); border: 1px solid var(--border-color);">
                        <?php if ($options['flist_h_fixed']) { ?>
                        <table id="table_filelist_h" cellpadding="3" cellspacing="1" class="filelist" style="display: none;">
                            <tbody>
                                <tr class="flisttblhdr" valign="bottom">
                                    <td id="file_list_checkbox_title_h">&nbsp;</td>
                                    <td><b><?php echo lang(262); ?></b></td>
                                    <td><b><?php echo lang(263); ?></b></td>
                                    <td><b><?php echo lang(264); ?></b></td>
                                    <td><b><?php echo lang(265); ?></b></td>
                                </tr>
                            </tbody>
                        </table>
                        <?php } ?>
                        
                        <table id="table_filelist" cellpadding="3" cellspacing="0" width="100%" class="filelist">
                            <thead>
                                <tr class="flisttblhdr" valign="bottom">
                                    <td id="file_list_checkbox_title" class="sorttable_checkbox" style="width: 40px;">&nbsp;</td>
                                    <td class="sorttable_alpha"><b><?php echo lang(262); ?></b></td>
                                    <td style="width: 100px;"><b><?php echo lang(263); ?></b></td>
                                    <td><b><?php echo lang(264); ?></b></td>
                                    <td style="width: 160px;"><b><?php echo lang(265); ?></b></td>
                                </tr>
                            </thead>
                            <tbody>
                <?php
                } else {
                    echo '<div style="text-align: center; padding: 40px; color: var(--text-muted);">';
                    echo '<svg width="48" height="48" fill="currentColor" viewBox="0 0 24 24" style="opacity: 0.5; margin-bottom: 12px;"><path d="M20 6h-8l-2-2H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm0 12H4V8h16v10z"/></svg><br>';
                    echo lang(266);
                    echo '</div>';
                    if ($options['show_all'] === true) {
                        unset($Path);
                ?>
                <div style="text-align: center; margin-top: 16px;">
                    <a href="javascript:showAll();" class="rl-btn rl-btn-secondary rl-btn-sm"><?php echo lang(259); ?>
                    <script type="text/javascript">
                    if(getCookie("showAll") == 1) {
                        document.write("<?php echo lang(260); ?>");
                    } else {
                        document.write("<?php echo lang(261); ?>");
                    }
                    </script></a>
                </div>
                <?php
                    }
                }
                
                if($list) {
                    $total_files = $filecount = $total_size = 0;
                    foreach($list as $key => $file) {
                        if (($size_time = file_data_size_time($file["name"])) === false) { continue; }
                        $total_files++;
                        $total_size += $size_time[0];
                ?>
                <tr class="flistmouseoff" onmouseover="this.className='flistmouseon'" onmouseout="this.className='flistmouseoff'" align="center" title="<?php echo htmlentities(basename($file["name"])); ?>" onmousedown="checkFile(<?php echo $filecount; ?>); return false;">
                    <td><input onmousedown="checkFile(<?php echo $filecount;?>); return false;" id="files<?php echo $filecount; ?>" type="checkbox" name="files[]" value="<?php echo $file["date"]; ?>"></td>
                    <td style="text-align: left;"><?php echo link_for_file($file["name"], FALSE, 'style="font-weight: 500;"'); ?></td>
                    <td><?php echo $file["size"]; ?></td>
                    <td style="text-align: left; font-size: 12px; color: var(--text-muted);"><?php echo (!empty($file['comment']) ? nl2br($file['comment']) : '-'); ?></td>
                    <td style="font-size: 12px;"><?php echo date("d.m.Y H:i:s", $file["date"]) ?></td>
                </tr>
                <?php
                        $filecount++;
                    }
                ?>
                            </tbody>
                <?php
                    if (($total_files > 1) && ($total_size > 0)) {
                        echo '<tfoot><tr class="flisttblftr"><td>&nbsp;</td><td style="text-align:left;"><strong>Total:</strong></td><td><strong>'.bytesToKbOrMbOrGb($total_size).'</strong></td><td>&nbsp;</td><td>&nbsp;</td></tr></tfoot>';
                    }
                ?>
                        </table>
                    </div>
                </form>
                <?php } ?>
            </div>

            <script type="text/javascript">
            /* <![CDATA[ */
            $(document).ready(function() {
            <?php if ($options['flist_sort']) { ?>
                sorttable.makeSortable(document.getElementById('table_filelist'));
            <?php } if ($options['flist_h_fixed']) { ?>
                $('#table_filelist_h tr.flisttblhdr td').each(function(id) {
                    $(this).click((function (x) { return function() { $('#table_filelist tr.flisttblhdr td:eq('+x+')').click(); table_filelist_refresh_headers(); }; })(id));
                });
            <?php } ?>
            });
            /* ]]> */
            </script>

            <!-- Tab 4: Pending Downloads -->
            <div class="hide-table tab-content" id="tb4">
                <div>
                    <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px; margin-bottom: 20px;">
                        <h3 style="margin: 0; color: var(--text-primary);">
                            <svg width="24" height="24" fill="currentColor" viewBox="0 0 24 24" style="vertical-align: -5px; margin-right: 8px;">
                                <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/>
                            </svg>
                            Pending Downloads
                        </h3>
                        <div id="queue-stats" style="font-size: 13px; color: var(--text-muted);">
                            Loading...
                        </div>
                    </div>
                    
                    <!-- Parallel Download Info -->
                    <div class="rl-card" style="margin-bottom: 20px; background: linear-gradient(135deg, var(--accent-primary), var(--accent-secondary)); color: white; padding: 16px;">
                        <div style="display: flex; align-items: center; gap: 12px; flex-wrap: wrap;">
                            <svg width="32" height="32" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M13 5v6h1.17L12 13.17 9.83 11H11V5h2m2-2H9v6H5l7 7 7-7h-4V3zm4 15H5v2h14v-2z"/>
                            </svg>
                            <div style="flex: 1;">
                                <strong style="font-size: 14px;">IDM-Style Parallel Downloading</strong>
                                <div style="font-size: 12px; opacity: 0.9; margin-top: 4px;">
                                    8 chunks per file • Max 5 concurrent downloads • Auto-resume support
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <!-- Queue Controls -->
                    <div style="display: flex; gap: 8px; margin-bottom: 16px; flex-wrap: wrap;">
                        <button onclick="refreshQueue();" class="rl-btn rl-btn-secondary rl-btn-sm">
                            <svg width="14" height="14" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/>
                            </svg>
                            Refresh
                        </button>
                        <button onclick="clearCompleted();" class="rl-btn rl-btn-secondary rl-btn-sm">
                            <svg width="14" height="14" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
                            </svg>
                            Clear Completed
                        </button>
                        <span style="margin-left: auto; font-size: 12px; color: var(--text-muted); display: flex; align-items: center;">
                            <svg width="12" height="12" fill="currentColor" viewBox="0 0 24 24" style="margin-right: 4px; animation: spin 2s linear infinite;">
                                <path d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46C19.54 15.03 20 13.57 20 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74C4.46 8.97 4 10.43 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z"/>
                            </svg>
                            Auto-refresh: 5s
                        </span>
                    </div>
                    
                    <!-- Pending Downloads List -->
                    <div id="queue-container" style="text-align: left;">
                        <div class="queue-empty">Loading...</div>
                    </div>
                </div>
                
                <style>
                @keyframes spin {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
                .queue-item {
                    background: var(--bg-secondary);
                    border-radius: var(--radius-md);
                    padding: 16px;
                    margin-bottom: 12px;
                    border: 1px solid var(--border-color);
                    transition: all 0.2s ease;
                }
                .queue-item:hover {
                    border-color: var(--accent-primary);
                    box-shadow: var(--shadow-md);
                }
                .queue-item.downloading {
                    border-left: 4px solid var(--accent-primary);
                }
                .queue-item.completed {
                    border-left: 4px solid var(--success);
                    opacity: 0.8;
                }
                .queue-item.error {
                    border-left: 4px solid var(--error);
                }
                .queue-item.paused {
                    border-left: 4px solid var(--warning);
                }
                .queue-item.queued {
                    border-left: 4px solid var(--text-muted);
                }
                .queue-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: flex-start;
                    gap: 12px;
                    margin-bottom: 8px;
                }
                .queue-filename {
                    font-weight: 600;
                    color: var(--text-primary);
                    word-break: break-all;
                    flex: 1;
                }
                .queue-status {
                    font-size: 12px;
                    font-weight: 600;
                    padding: 4px 10px;
                    border-radius: 12px;
                    text-transform: uppercase;
                    white-space: nowrap;
                }
                .queue-status.downloading { background: var(--accent-primary); color: white; }
                .queue-status.queued { background: var(--bg-tertiary); color: var(--text-muted); }
                .queue-status.completed { background: var(--success); color: white; }
                .queue-status.error { background: var(--error); color: white; }
                .queue-status.paused { background: var(--warning); color: white; }
                .queue-status.checking { background: var(--accent-secondary); color: white; }
                .queue-meta {
                    display: flex;
                    gap: 16px;
                    flex-wrap: wrap;
                    font-size: 13px;
                    color: var(--text-muted);
                    margin-bottom: 8px;
                }
                .queue-meta span {
                    display: flex;
                    align-items: center;
                    gap: 4px;
                }
                .queue-progress {
                    height: 8px;
                    background: var(--bg-progress);
                    border-radius: 4px;
                    overflow: hidden;
                    margin: 10px 0;
                }
                .queue-progress-bar {
                    height: 100%;
                    background: var(--accent-gradient);
                    border-radius: 4px;
                    transition: width 0.5s ease;
                }
                .queue-chunks {
                    display: flex;
                    gap: 2px;
                    margin: 8px 0;
                    height: 4px;
                }
                .queue-chunk {
                    flex: 1;
                    background: var(--bg-progress);
                    border-radius: 2px;
                    transition: background 0.3s ease;
                }
                .queue-chunk.active { background: var(--accent-primary); }
                .queue-chunk.done { background: var(--success); }
                .queue-chunk.error { background: var(--error); }
                .queue-actions {
                    display: flex;
                    gap: 8px;
                    margin-top: 10px;
                    flex-wrap: wrap;
                }
                .queue-actions button {
                    padding: 6px 12px;
                    font-size: 12px;
                }
                .queue-error {
                    color: var(--error);
                    font-size: 12px;
                    margin-top: 8px;
                    padding: 8px;
                    background: rgba(239, 68, 68, 0.1);
                    border-radius: var(--radius-sm);
                }
                .queue-empty {
                    text-align: center;
                    padding: 60px 20px;
                    color: var(--text-muted);
                }
                .queue-info {
                    font-size: 11px;
                    color: var(--text-muted);
                    margin-top: 4px;
                }
                </style>
                
                <script type="text/javascript">
                var queueRefreshInterval = null;
                
                function refreshQueue() {
                    $.ajax({
                        url: 'ajax.php?ajax=queue_status',
                        type: 'GET',
                        dataType: 'json',
                        success: function(data) {
                            renderQueue(data);
                        },
                        error: function() {
                            $('#queue-container').html('<div class="queue-empty">Error loading queue</div>');
                        }
                    });
                }
                
                function renderQueue(data) {
                    // Update stats
                    var stats = data.stats || {};
                    var pending = data.pending || [];
                    var downloads = data.downloads || [];
                    
                    var totalActive = (stats.downloading || 0) + pending.length;
                    var statsHtml = '<span style="margin-right: 12px;"><strong>' + totalActive + '</strong> active</span>';
                    statsHtml += '<span style="margin-right: 12px;"><strong>' + (stats.queued || 0) + '</strong> queued</span>';
                    statsHtml += '<span><strong>' + (stats.completed || 0) + '</strong> completed</span>';
                    $('#queue-stats').html(statsHtml);
                    
                    // Render downloads
                    var html = '';
                    
                    // First show pending file downloads (from filesystem)
                    if (pending.length > 0) {
                        html += '<div style="margin-bottom: 16px; padding: 12px; background: var(--bg-tertiary); border-radius: var(--radius-md); border-left: 4px solid var(--accent-primary);">';
                        html += '<strong style="color: var(--text-primary);">Active File Downloads</strong>';
                        html += '<div style="margin-top: 10px;">';
                        for (var p = 0; p < pending.length; p++) {
                            var pf = pending[p];
                            html += '<div style="display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px solid var(--border-color);">';
                            html += '<span style="word-break: break-all; flex: 1; margin-right: 12px;">' + escapeHtml(pf.filename) + '</span>';
                            html += '<span style="color: var(--text-muted); white-space: nowrap;">' + pf.size + ' • ' + pf.status + '</span>';
                            html += '</div>';
                        }
                        html += '</div></div>';
                    }
                    
                    if (downloads.length === 0 && pending.length === 0) {
                        html = '<div class="queue-empty">';
                        html += '<svg width="64" height="64" fill="currentColor" viewBox="0 0 24 24" style="opacity: 0.3; margin-bottom: 16px;"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>';
                        html += '<br><strong>No Pending Downloads</strong>';
                        html += '<br><small>Start a transload to see downloads here</small>';
                        html += '</div>';
                    } else if (downloads.length > 0) {
                        html += '<div style="margin-top: 8px;"><strong style="color: var(--text-primary);">Parallel Queue Downloads</strong></div>';
                        for (var i = 0; i < downloads.length; i++) {
                            var dl = downloads[i];
                            html += '<div class="queue-item ' + dl.status + '">';
                            
                            // Header
                            html += '<div class="queue-header">';
                            html += '<div class="queue-filename">' + escapeHtml(dl.filename || 'Unknown file') + '</div>';
                            html += '<span class="queue-status ' + dl.status + '">' + dl.status + '</span>';
                            html += '</div>';
                            
                            // Meta info
                            html += '<div class="queue-meta">';
                            html += '<span><strong>Size:</strong> ' + dl.size + '</span>';
                            html += '<span><strong>Downloaded:</strong> ' + dl.downloaded + '</span>';
                            if (dl.speed && dl.speed != '-') {
                                html += '<span><strong>Speed:</strong> ' + dl.speed + '</span>';
                            }
                            if (dl.resumable !== null) {
                                html += '<span>' + (dl.resumable ? '✓ Resumable' : '✗ No resume') + '</span>';
                            }
                            if (dl.chunks > 1) {
                                html += '<span><strong>Chunks:</strong> ' + dl.chunks + '</span>';
                            }
                            html += '</div>';
                            
                            // Progress bar
                            if (dl.status === 'downloading' || dl.progress > 0) {
                                html += '<div class="queue-progress"><div class="queue-progress-bar" style="width: ' + dl.progress + '%"></div></div>';
                                html += '<div class="queue-info">' + dl.progress + '% complete</div>';
                            }
                            
                            // Error message
                            if (dl.error) {
                                html += '<div class="queue-error">Error: ' + escapeHtml(dl.error) + '</div>';
                            }
                            
                            // Actions
                            html += '<div class="queue-actions">';
                            if (dl.status === 'downloading') {
                                html += '<button onclick="pauseDownload(\'' + dl.id + '\');" class="rl-btn rl-btn-secondary rl-btn-sm">Pause</button>';
                            } else if (dl.status === 'paused' || dl.status === 'error') {
                                html += '<button onclick="resumeDownload(\'' + dl.id + '\');" class="rl-btn rl-btn-primary rl-btn-sm">Resume</button>';
                            }
                            if (dl.status !== 'downloading') {
                                html += '<button onclick="removeDownload(\'' + dl.id + '\');" class="rl-btn rl-btn-secondary rl-btn-sm" style="color: var(--error);">Remove</button>';
                            }
                            html += '</div>';
                            
                            html += '</div>';
                        }
                    }
                    
                    $('#queue-container').html(html);
                }
                
                function addToQueue() {
                    var url = $('#queue-url').val().trim();
                    if (!url) {
                        alert('Please enter a URL');
                        return;
                    }
                    
                    $.ajax({
                        url: 'ajax.php?ajax=queue_add',
                        type: 'POST',
                        data: { url: url },
                        dataType: 'json',
                        success: function(data) {
                            if (data.success) {
                                $('#queue-url').val('');
                                refreshQueue();
                            } else {
                                alert('Error: ' + (data.error || 'Failed to add URL'));
                            }
                        },
                        error: function() {
                            alert('Error adding URL to queue');
                        }
                    });
                }
                
                function processQueue() {
                    $.ajax({
                        url: 'ajax.php?ajax=queue_process',
                        type: 'GET',
                        dataType: 'json',
                        success: function(data) {
                            refreshQueue();
                            if (data.started > 0) {
                                // Queue started
                            }
                        }
                    });
                }
                
                function pauseDownload(id) {
                    $.post('ajax.php?ajax=queue_pause', { id: id }, function() {
                        refreshQueue();
                    }, 'json');
                }
                
                function resumeDownload(id) {
                    $.post('ajax.php?ajax=queue_resume', { id: id }, function() {
                        refreshQueue();
                        processQueue();
                    }, 'json');
                }
                
                function removeDownload(id) {
                    if (confirm('Remove this download from queue?')) {
                        $.post('ajax.php?ajax=queue_remove', { id: id }, function() {
                            refreshQueue();
                        }, 'json');
                    }
                }
                
                function clearCompleted() {
                    $.get('ajax.php?ajax=queue_clear_completed', function() {
                        refreshQueue();
                    }, 'json');
                }
                
                function escapeHtml(text) {
                    if (!text) return '';
                    var div = document.createElement('div');
                    div.appendChild(document.createTextNode(text));
                    return div.innerHTML;
                }
                
                function startQueueRefresh() {
                    if (queueRefreshInterval) clearInterval(queueRefreshInterval);
                    refreshQueue();
                    queueRefreshInterval = setInterval(refreshQueue, 5000);
                }
                
                function stopQueueRefresh() {
                    if (queueRefreshInterval) {
                        clearInterval(queueRefreshInterval);
                        queueRefreshInterval = null;
                    }
                }
                
                // Handle Enter key in URL input
                $('#queue-url').keypress(function(e) {
                    if (e.which == 13) {
                        addToQueue();
                        return false;
                    }
                });
                
                // Start refresh when tab 4 is shown
                $(document).ready(function() {
                    $('#navcell4').click(function() {
                        startQueueRefresh();
                    });
                });
                </script>
            </div>
        </div>

        <?php
        if(isset($_GET["act"])) {
            echo '<script type="text/javascript">switchCell(3);</script>';
        } elseif(isset($_GET["pending"])) {
            echo '<script type="text/javascript">switchCell(4); startPendingRefresh();</script>';
        } else {
            echo '<script type="text/javascript">$("#navcell1").addClass("selected");</script>';
        }
        ?>
    </div>
</div>

<!-- Server Info & Footer -->
<div style="margin-top: 32px;">
    <div class="rl-card" style="max-width: 800px; margin: 0 auto;">
        <?php
        if ($options['file_size_limit'] > 0) {
            echo '<div style="text-align: center; padding: 12px; background: var(--bg-tertiary); border-radius: var(--radius-md); margin-bottom: 16px;">';
            echo '<span style="color: var(--warning);">' . lang(337) . ' <strong>' . bytesToKbOrMbOrGb($options['file_size_limit']*1024*1024) . '</strong></span>';
            echo '</div>';
        }

        $delete_delay = $options['delete_delay'];
        if (is_numeric($delete_delay) && $delete_delay > 0) {
            echo '<div style="text-align: center; margin-bottom: 16px;">';
            if($delete_delay > 3600) {
                $ddelay = round($delete_delay/3600, 1);
                echo '<span class="autodel">' . lang(282) . ': <strong>' . $ddelay . '</strong> ' . lang(283) . '</span>';
            } else {
                $ddelay = round($delete_delay/60);
                echo '<span class="autodel">' . lang(282) . ': <strong>' . $ddelay . '</strong> ' . lang(284) . '</span>';
            }
            echo '</div>';
        }
        ?>

        <?php if($options['server_info']) {
            ob_start();
        ?>
        <div id="server_stats">
            <?php require_once(CLASS_DIR."sinfo.php"); ?>
        </div>
        <?php
            if ($options['ajax_refresh']) {
        ?>
        <script type="text/javascript">var stats_timer = setTimeout("refreshStats()", 10 * 1000);</script>
        <?php
            }
            ob_end_flush();
        }
        ?>

        <hr>
        <div style="text-align: center; color: var(--text-muted); font-size: 12px;">
            <?php print CREDITS; ?>
        </div>
    </div>
</div>

<?php
if (isset($_GET["act"]) && ($_GET["act"] == 'unrar_go') && !$options['disable_unrar']) {
    require_once(CLASS_DIR."options/unrar.php");
    unrar_go_go();
} elseif (isset($_GET["act"]) && ($_GET["act"] == 'rar_go') && !$options['disable_rar']) {
    require_once(CLASS_DIR."options/rar.php");
    rar_go_go();
}
?>
