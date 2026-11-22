/* RAFIQ — قائمة "الخدمات المنزلية" المنسدلة في الشريط العلوي. */
(function () {
  function init() {
    if (document.getElementById('rafiq-home-services')) return;
    var nav = document.querySelector('nav.card') || document.querySelector('nav');
    if (!nav) return;

    var css = document.createElement('style');
    css.textContent = '.rhs{position:relative;display:inline-block;margin:4px}' +
      '.rhs summary{list-style:none;cursor:pointer;background:#0b9b6b;color:#fff;border-radius:10px;padding:10px 14px;font-size:14px;font-weight:700;white-space:nowrap;text-align:center}' +
      '.rhs summary::-webkit-details-marker{display:none}' +
      '.rhs-list{position:absolute;top:calc(100% + 6px);right:0;z-index:50;min-width:240px;background:#fff;border:1px solid #dce8e2;border-radius:12px;box-shadow:0 8px 24px rgba(0,0,0,.14);padding:6px;text-align:right}' +
      '.rhs-list a{display:block;padding:10px 12px;color:#17372d;text-decoration:none;border-radius:8px;font-size:14px;line-height:1.6}' +
      '.rhs-list a:hover,.rhs-list a.on{background:#eaf4ef;color:#087f58;font-weight:700}' +
      '@media(max-width:520px){.rhs{display:block;flex:1 1 100%;margin:4px 0}.rhs-list{left:0;right:0;min-width:0}}';
    document.head.appendChild(css);

    var links = [
      ['/caregiver-work.html', 'عمل مقدم الرعاية المنزلية'],
      ['/nursing-work.html', 'التمريض المنزلي ومهامه'],
      ['/home-physiotherapy.html', 'أهمية العلاج الفيزيائي المنزلي']
    ];
    var here = location.pathname;
    var html = '<summary>🏠 الخدمات المنزلية ▾</summary><div class="rhs-list">';
    links.forEach(function (l) {
      html += '<a href="' + l[0] + '"' + (here === l[0] ? ' class="on"' : '') + '>' + l[1] + '</a>';
    });
    html += '</div>';

    var d = document.createElement('details');
    d.id = 'rafiq-home-services';
    d.className = 'rhs';
    d.innerHTML = html;
    nav.appendChild(d);

    document.addEventListener('click', function (e) {
      if (!d.contains(e.target)) d.removeAttribute('open');
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
