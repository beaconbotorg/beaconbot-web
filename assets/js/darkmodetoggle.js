//      made with ❤️ by
//          __                              _____
//         / /______ _____  _______  __   _|__  /
//        / //_/ __ `/ __ \/ ___/ / / /  (_)/_ < 
//       / ,< / /_/ / /_/ (__  ) /_/ /  _ ___/ / 
//      /_/|_|\__,_/\____/____/\__,_/  (_)____/  

//      note..
//          - this code/file is protected by basic intellectual property rights, if found duplicated/reproduced without permission, legal action may occur.
//          - this was made for "Beacon Bot", only authorized for use on any subdomain/path associated with "kaosu.xyz" and "beaconbot.site"

document.addEventListener('DOMContentLoaded', () => {
  const html = document.documentElement;
  const toggle = document.getElementById('theme-toggle');
  const icon = toggle?.querySelector('i');

  const savedTheme = localStorage.getItem('theme');
  if (savedTheme) {
    html.setAttribute('data-theme', savedTheme);
    updateIcon(savedTheme);
  } else if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
    html.setAttribute('data-theme', 'dark');
    updateIcon('dark');
  }

  toggle?.addEventListener('click', () => {
    const current = html.getAttribute('data-theme') || 'light';
    const next = current === 'dark' ? 'light' : 'dark';
    html.setAttribute('data-theme', next);
    localStorage.setItem('theme', next);
    updateIcon(next);
  });

  function updateIcon(theme) {
    if (!icon) return;
    icon.className = theme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
  }

  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
    if (!localStorage.getItem('theme')) {
      const newTheme = e.matches ? 'dark' : 'light';
      html.setAttribute('data-theme', newTheme);
      updateIcon(newTheme);
    }
  });
});