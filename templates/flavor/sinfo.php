<div class="fl-stats">
    <!-- Disk -->
    <div class="fl-stat-box">
        <div class="fl-stat-title">
            <svg width="18" height="18" fill="currentColor" viewBox="0 0 24 24"><path d="M2 20h20v-4H2v4zm2-3h2v2H4v-2zM2 4v4h20V4H2zm4 3H4V5h2v2zm-4 7h20v-4H2v4zm2-3h2v2H4v-2z"/></svg>
            <?php echo lang(275); ?>
        </div>
        <div class="fl-stat-body">
            <?php echo lang(276); ?> = <strong><span id="inuse"><?php echo ZahlenFormatieren($belegt); ?></span></strong>
            (<span id="inusepercent"><?php echo round($prozent_belegt,2); ?></span>%)
            <div class="fl-bar-track"><div class="fl-bar-fill" style="width:<?php echo round($prozent_belegt,2); ?>%"></div></div>
            <?php echo lang(277); ?> = <strong><span id="freespace"><?php echo ZahlenFormatieren($frei); ?></span></strong><br>
            <?php echo lang(278); ?> = <strong><span id="diskspace"><?php echo ZahlenFormatieren($insgesamt); ?></span></strong>
        </div>
    </div>

    <!-- CPU -->
    <div class="fl-stat-box">
        <div class="fl-stat-title">
            <svg width="18" height="18" fill="currentColor" viewBox="0 0 24 24"><path d="M15 9H9v6h6V9zm-2 4h-2v-2h2v2zm8-2V9h-2V7c0-1.1-.9-2-2-2h-2V3h-2v2h-2V3H9v2H7c-1.1 0-2 .9-2 2v2H3v2h2v2H3v2h2v2c0 1.1.9 2 2 2h2v2h2v-2h2v2h2v-2h2c1.1 0 2-.9 2-2v-2h2v-2h-2v-2h2zm-4 6H7V7h10v10z"/></svg>
            <?php echo ($cpu_string === -1) ? lang(135) : lang(279); ?>
        </div>
        <?php if ($cpu_string !== -1) { ?>
        <div class="fl-stat-body"><?php echo $cpu_string; ?></div>
        <?php } ?>
        <div style="margin-top:10px;font-size:13px;color:var(--fl-text-3);">
            <span class="cpu-clock-st-text"><?php echo lang(280); ?>:</span>
            <span class="cpu-clock-st-time"><span id="server"></span></span>
        </div>
        <div id="clock" style="font-size:12px;color:var(--fl-text-3);"></div>
    </div>
</div>

<script type="text/javascript">
//<![CDATA[
function goforit(){
    setTimeout("getthedate()", 1000);
    timeDiff('<?php echo date('Y'); ?>','<?php echo date('n'); ?>','<?php echo date('j'); ?>','<?php echo date('G'); ?>','<?php echo date('i'); ?>','<?php echo date('s'); ?>','dd-mm-yyyy');
}
$(document).ready(function(){ goforit(); });
//]]>
</script>
