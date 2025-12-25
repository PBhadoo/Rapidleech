<div class="uploadui">
    <h3 style="margin-bottom: 20px; color: var(--text-primary);">
        <svg width="24" height="24" fill="currentColor" viewBox="0 0 24 24" style="vertical-align: -5px; margin-right: 8px;">
            <path d="M9 16h6v-6h4l-7-7-7 7h4v6zm-4 2h14v2H5v-2z"/>
        </svg>
        Uploading...
    </h3>
    
    <div class="progressouter" style="width: 100%; max-width: 400px; margin: 20px auto;">
        <div style="width: 100%;">
            <div id="progress" class="progressup" style="width: 0%;"></div>
        </div>
    </div>
    
    <div style="display: flex; justify-content: space-between; max-width: 400px; margin: 0 auto; color: var(--text-secondary);">
        <span id="received" style="font-weight: 600;">0 KB</span>
        <span id="percent" style="font-weight: 700; color: var(--accent-primary); font-size: 18px;">0%</span>
        <span id="speed" style="font-weight: 600;">0 KB/s</span>
    </div>
</div>

<script type="text/javascript">
/* <![CDATA[ */
function pr(percent, received, speed) {
    const units = ['KB/s', 'MB/s', 'GB/s', 'TB/s', 'PB/s'];
    let speedIndex = 0;
    let convertedSpeed = speed;

    while (convertedSpeed >= 1000 && speedIndex < units.length - 1) {
        convertedSpeed /= 1000;
        speedIndex++;
    }

    const speedString = `${Number(convertedSpeed).toFixed(2)} ${units[speedIndex]}`;

    document.getElementById('received').innerHTML = `<b>${received}</b>`;
    document.getElementById('percent').innerHTML = `<b>${percent}%</b>`;
    document.getElementById('progress').style.width = `${percent}%`;
    document.getElementById('speed').innerHTML = `<b>${speedString}</b>`;
    document.title = `${percent}% Downloaded`;

    return true;
}

function mail(str, field) {
    document.getElementById('mailPart.' + field).innerHTML = str;
    return true;
}
/* ]]> */
</script>
