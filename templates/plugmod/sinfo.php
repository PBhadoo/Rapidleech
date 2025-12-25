<div class="rl-card" style="margin: 0 auto;">
    <div class="ss-cpu-table" style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
        <!-- Server Space Info -->
        <div class="ss-td-style">
            <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 12px;">
                <svg width="20" height="20" fill="var(--accent-primary)" viewBox="0 0 24 24">
                    <path d="M2 20h20v-4H2v4zm2-3h2v2H4v-2zM2 4v4h20V4H2zm4 3H4V5h2v2zm-4 7h20v-4H2v4zm2-3h2v2H4v-2z"/>
                </svg>
                <span class="ss-span-style"><?php echo lang(275); ?></span>
            </div>
            <div style="font-size: 13px; line-height: 1.8;">
                <?php echo lang(276); ?> = <strong><span id="inuse"><?php echo ZahlenFormatieren($belegt); ?></span></strong>
                (<span id="inusepercent"><?php echo round($prozent_belegt,"2"); ?></span>%)
                <br>
                <?php if (extension_loaded('gd') && function_exists('gd_info')) { ?>
                <div style="margin: 8px 0;">
                    <div style="background: var(--bg-progress); border-radius: 8px; overflow: hidden; height: 8px;">
                        <div style="width: <?php echo round($prozent_belegt,"2"); ?>%; height: 100%; background: var(--accent-gradient);"></div>
                    </div>
                </div>
                <?php } ?>
                <?php echo lang(277); ?> = <strong><span id="freespace"><?php echo ZahlenFormatieren($frei); ?></span></strong>
                <br>
                <?php echo lang(278); ?> = <strong><span id="diskspace"><?php echo ZahlenFormatieren($insgesamt); ?></span></strong>
            </div>
        </div>

        <!-- CPU Info -->
        <div class="cpu-td">
            <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 12px;">
                <svg width="20" height="20" fill="var(--accent-primary)" viewBox="0 0 24 24">
                    <path d="M15 9H9v6h6V9zm-2 4h-2v-2h2v2zm8-2V9h-2V7c0-1.1-.9-2-2-2h-2V3h-2v2h-2V3H9v2H7c-1.1 0-2 .9-2 2v2H3v2h2v2H3v2h2v2c0 1.1.9 2 2 2h2v2h2v-2h2v2h2v-2h2c1.1 0 2-.9 2-2v-2h2v-2h-2v-2h2zm-4 6H7V7h10v10z"/>
                </svg>
                <span class="cpu-span">
                <?php
                    if ($cpu_string === -1) { echo lang(135); }
                    else { echo lang(279); }
                ?>
                </span>
            </div>
            <?php if ($cpu_string !== -1) { ?>
            <div style="font-size: 13px; line-height: 1.8;">
                <?php echo $cpu_string; ?>
            </div>
            <?php } ?>
            <div style="margin-top: 12px; font-size: 13px;">
                <span class="cpu-clock-st-text"><?php echo lang(280); ?>:</span>
                <span class="cpu-clock-st-time"><span id="server"></span></span>
            </div>
            <div id="clock" style="font-size: 12px; color: var(--text-muted);"></div>
        </div>
    </div>
</div>

<script type="text/javascript"> 
//<![CDATA[
function goforit(){
    setTimeout("getthedate()", 1000);
    timeDiff('<?php echo date('Y'); ?>','<?php echo date('n'); ?>','<?php echo date('j'); ?>','<?php echo date('G'); ?>','<?php echo date('i'); ?>','<?php echo date('s'); ?>','dd-mm-yyyy');
}
$(document).ready(function() {
    goforit();
})
//]]> 
</script>
