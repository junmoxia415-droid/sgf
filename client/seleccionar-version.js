// Sin sintaxis moderna: este código debe poder decidir antes de cargar los módulos.
(function () {
  var ua = navigator.userAgent || '';
  var moderna = false;
  try {
    var css = window.CSS;
    var cssModerno = css && typeof css.supports === 'function' &&
      typeof css.registerProperty === 'function' &&
      css.supports('color', 'oklch(50% 0.1 180)') &&
      css.supports('selector(:has(*))');
    var firefox = /Firefox\/(\d+)/.exec(ua);
    var chromium = /(?:Chrome|Chromium)\/(\d+)/.exec(ua);
    var safari = /Version\/(\d+)\.(\d+).*Safari\//.exec(ua);
    if (cssModerno) {
      if (firefox) moderna = Number(firefox[1]) >= 128;
      else if (chromium) moderna = Number(chromium[1]) >= 111;
      else if (safari) moderna = Number(safari[1]) > 16 || (Number(safari[1]) === 16 && Number(safari[2]) >= 4);
    }
  } catch (_) {
    moderna = false;
  }
  // Ante identificación dudosa, preferimos compatibilidad antes que una pantalla rota.
  var destino = moderna ? 'moderna' : 'compat';
  window.location.replace('/' + destino + '/index.html' + window.location.search + window.location.hash);
}());
