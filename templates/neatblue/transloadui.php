<br />
<table align="center" cellspacing="0" cellpadding="0" class="transloadui" id="progressblock">
	<tr>
		<td></td>
		<td>
			<div class="progressouter">
				<div style="width:298px">
					<div id="progress" class="progressdown"></div>
				</div>
			</div>
		</td>
		<td></td>
	</tr>
	<tr>
		<td align="left" id="received">0 KB</td>
		<td align="center" id="percent">0%</td>
		<td align="right" id="speed">0 KB/s</td>
	</tr>
</table>
<br />
<div id="resume" align="center"></div>
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

  // Update when download is complete
  if (parseFloat(percent) >= 100) {
    var progressBar = document.getElementById('progress');
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

function mail(str, field)
{
	document.getElementById('mailPart.' + field).innerHTML = str;
	return true;
}
/* ]]> */
</script>
<br />
