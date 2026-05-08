/** API helper + Toast utility */

async function api(url, body) {
  var opts = body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {};
  var res = await fetch(Config.API_BASE + url, opts);
  return res.json();
}

function toast(text, sub) {
  var el = document.createElement('div');
  el.className = 'toast';
  el.innerHTML = '<span class="t-icon">✓</span><div><div class="t-text">' + text + '</div>' + (sub ? '<div class="t-sub">' + sub + '</div>' : '') + '</div>';
  document.getElementById('toast-container').appendChild(el);
  setTimeout(function() {
    el.style.opacity = '0';
    el.style.transition = 'opacity 0.2s';
    setTimeout(function() { el.remove(); }, Config.TOAST_FADE);
  }, Config.TOAST_DURATION);
}
