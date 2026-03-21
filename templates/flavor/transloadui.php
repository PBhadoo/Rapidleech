<div class="transloadui">
    <h3 id="dl-heading" style="margin-bottom:16px;color:var(--fl-text);">
        <svg id="dl-icon-downloading" width="22" height="22" fill="var(--fl-accent)" viewBox="0 0 24 24" style="vertical-align:-4px;margin-right:6px;"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>
        <svg id="dl-icon-complete" width="22" height="22" fill="#22c55e" viewBox="0 0 24 24" style="vertical-align:-4px;margin-right:6px;display:none;"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"/></svg>
        <span id="dl-heading-text">Downloading&hellip;</span>
    </h3>
    <div class="progressouter" style="width:100%;max-width:420px;margin:16px auto;">
        <div style="width:100%;"><div id="progress" class="progressdown" style="width:0%;"></div></div>
    </div>
    <div style="display:flex;justify-content:space-between;max-width:420px;margin:0 auto;color:var(--fl-text-2);">
        <span id="received" style="font-weight:600;">0 KB</span>
        <span id="percent" style="font-weight:700;color:var(--fl-accent);font-size:18px;">0%</span>
        <span id="speed" style="font-weight:600;">0 KB/s</span>
    </div>
</div>
<div id="resume" style="text-align:center;margin-top:12px;"></div>
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
    if(parseFloat(percent)>=100){
        var ht=document.getElementById('dl-heading-text');if(ht)ht.textContent='Download Complete!';
        var id=document.getElementById('dl-icon-downloading');if(id)id.style.display='none';
        var ic=document.getElementById('dl-icon-complete');if(ic)ic.style.display='inline';
        var hd=document.getElementById('dl-heading');if(hd)hd.style.color='#22c55e';
        var pb=document.getElementById('progress');
        if(pb){pb.style.width='100%';pb.style.background='linear-gradient(90deg,#22c55e,#16a34a)';pb.style.animation='none';}
        document.title='Download Complete!';
    }else{
        document.title=percent+'% Downloaded';
    }
    return true;
}
function merging(){
    var pb=document.getElementById('progress');
    if(pb){pb.style.width='100%';pb.style.background='linear-gradient(90deg,#f59e0b,#d97706)';pb.style.animation='pulse 1.5s ease-in-out infinite';}
    document.title='Merging Parts...';
    if(!document.getElementById('rl-merge-style')){var s=document.createElement('style');s.id='rl-merge-style';s.textContent='@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.6}}';document.head.appendChild(s);}
    return true;
}
function mail(str,field){document.getElementById('mailPart.'+field).innerHTML=str;return true;}
/* ]]> */
</script>
