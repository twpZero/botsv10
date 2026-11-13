// Applies a saved light/dark choice before the first paint. Loaded as a plain
// script in <head>; without a saved choice the page follows the system setting.
(function () {
  try {
    var theme = localStorage.getItem('bn.theme');
    if (theme === 'dark' || theme === 'light') document.documentElement.dataset.theme = theme;
  } catch (e) { /* storage blocked: follow the system */ }
})();
