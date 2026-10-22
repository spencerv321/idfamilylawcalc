// Applies the saved theme before first paint. Light unless the viewer chose dark.
(function () {
  var t = 'light';
  try {
    if (localStorage.getItem('theme') === 'dark') t = 'dark';
  } catch (e) {}
  document.documentElement.setAttribute('data-theme', t);
})();
