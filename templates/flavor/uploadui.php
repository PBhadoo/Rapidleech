<div class="uploadui">
    <h3 style="margin-bottom:16px;color:var(--fl-text);">
        <svg width="22" height="22" fill="var(--fl-accent)" viewBox="0 0 24 24" style="vertical-align:-4px;margin-right:6px;"><path d="M9 16h6v-6h4l-7-7-7 7h4v6zm-4 2h14v2H5v-2z"/></svg>
        Uploading&hellip;
    </h3>
    <div class="progressouter" style="width:100%;max-width:420px;margin:16px auto;">
        <div style="width:100%;"><div id="progress" class="progressup" style="width:0%;"></div></div>
    </div>
    <div style="display:flex;justify-content:space-between;max-width:420px;margin:0 auto;color:var(--fl-text-2);">
        <span id="received" style="font-weight:600;">0 KB</span>
        <span id="percent" style="font-weight:700;color:var(--fl-accent);font-size:18px;">0%</span>
        <span id="speed" style="font-weight:600;">0 KB/s</span>
    </div>
</div>
<script type="text/javascript">
/* <![CDATA[ */
function pr(percent,received,speed){
    var u=['KB/s','MB/s','GB/s','TB/s'],i=0,s=speed;
    while(s>=1000&&i<u.length-1){s/=1000;i++;}
    var ss=Number(s).toFixed(2)+' '+u[i];
    document.getElementById('received').innerHTML='<b>'+received+'</b>';
    document.getElementById('percent').innerHTML='<b>'+percent+'%</b>';
    document.getElementById('progress').style.width=percent+'%';
    document.getElementById('speed').innerHTML='<b>'+ss+'</b>';
    document.title=percent+'% Uploaded';
    return true;
}
function mail(str,field){document.getElementById('mailPart.'+field).innerHTML=str;return true;}
/* ]]> */
</script>
