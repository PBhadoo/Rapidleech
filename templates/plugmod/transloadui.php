<div class="transloadui">
    <h3 id="dl-heading" style="margin-bottom: 20px; color: var(--text-primary);">
        <svg id="dl-icon-downloading" width="24" height="24" fill="currentColor" viewBox="0 0 24 24" style="vertical-align: -5px; margin-right: 8px;">
            <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/>
        </svg>
        <svg id="dl-icon-complete" width="24" height="24" fill="currentColor" viewBox="0 0 24 24" style="vertical-align: -5px; margin-right: 8px; display: none;">
            <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"/>
        </svg>
        <span id="dl-heading-text">Downloading...</span>
    </h3>
    
    <div class="progressouter" style="width: 100%; max-width: 400px; margin: 20px auto;">
        <div style="width: 100%;">
            <div id="progress" class="progressdown" style="width: 0%; transition: width 0.3s ease;"></div>
        </div>
    </div>
    
    <div style="display: flex; justify-content: space-between; max-width: 400px; margin: 0 auto; color: var(--text-secondary);">
        <span id="received" style="font-weight: 600;">0 KB</span>
        <span id="percent" style="font-weight: 700; color: var(--accent-primary); font-size: 18px;">0%</span>
        <span id="speed" style="font-weight: 600;">0 KB/s</span>
    </div>
</div>

<div id="resume" style="text-align: center; margin-top: 16px;"></div>

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

    // Update heading and style when download is complete
    if (parseFloat(percent) >= 100) {
        var headingText = document.getElementById('dl-heading-text');
        var iconDownloading = document.getElementById('dl-icon-downloading');
        var iconComplete = document.getElementById('dl-icon-complete');
        var heading = document.getElementById('dl-heading');
        var progressBar = document.getElementById('progress');
        
        if (headingText) headingText.textContent = 'Download Complete!';
        if (iconDownloading) iconDownloading.style.display = 'none';
        if (iconComplete) iconComplete.style.display = 'inline';
        if (heading) heading.style.color = 'var(--success, #22c55e)';
        if (progressBar) {
            progressBar.style.width = '100%';
            progressBar.style.background = 'linear-gradient(90deg, #22c55e, #16a34a)';
        }
        document.title = 'Download Complete!';
    } else {
        document.title = `${percent}% Downloaded`;
    }

    return true;
}

function mail(str, field) {
    document.getElementById('mailPart.' + field).innerHTML = str;
    return true;
}
/* ]]> */
</script>
