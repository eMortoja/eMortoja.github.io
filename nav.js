document.addEventListener('DOMContentLoaded', function () {
  if (document.getElementById('site-menu')) return;
  var links = [
    { href: './', label: 'Home' },
    { href: './projects.html', label: 'Projects' },
    { href: './dashboard.html', label: 'Dashboard' },
    { href: './tools.html', label: 'Tools' }
  ];
  var current = location.pathname.replace(/\/+$/, '');
  var leaf = current.split('/').pop() || 'index.html';
  var nav = document.createElement('nav');
  nav.id = 'site-menu';
  nav.className = 'fixed top-3 right-4 text-sm z-50 select-none';
  links.forEach(function (l, i) {
    var a = document.createElement('a');
    a.href = l.href;
    a.textContent = l.label;
    var isHome = (leaf === '' || leaf === 'index.html') && l.href === './';
    var matchLeaf = l.href.replace('./', '') === leaf;
    if (isHome || matchLeaf) {
      a.className = 'underline text-white font-medium tracking-tight';
    } else {
      a.className = 'opacity-80 hover:underline hover:text-white font-medium tracking-tight transition-colors';
    }
    nav.appendChild(a);
    if (i < links.length - 1) {
      var sep = document.createElement('span');
      sep.textContent = ' · ';
      sep.className = 'mx-3 opacity-50';
      nav.appendChild(sep);
    }
  });
  document.body.appendChild(nav);
});
