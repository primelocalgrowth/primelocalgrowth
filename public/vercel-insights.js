(function () {
  function ensureQueue(name, queueName) {
    if (window[name]) return;
    window[name] = function () {
      window[queueName] = window[queueName] || [];
      window[queueName].push(Array.prototype.slice.call(arguments));
    };
  }

  function loadScript(src, dataset) {
    if (document.head.querySelector('script[src="' + src + '"]')) return;
    var script = document.createElement('script');
    script.src = src;
    script.defer = true;
    Object.keys(dataset || {}).forEach(function (key) {
      script.dataset[key] = dataset[key];
    });
    document.head.appendChild(script);
  }

  function cleanProperties(properties) {
    var output = {};
    Object.keys(properties || {}).forEach(function (key) {
      var value = properties[key];
      if (value == null || ['string', 'number', 'boolean'].indexOf(typeof value) !== -1) {
        output[key] = value;
      }
    });
    return output;
  }

  ensureQueue('va', 'vaq');
  loadScript('/_vercel/insights/script.js', {
    sdkn: '@vercel/analytics/html',
    sdkv: '2.0.1'
  });

  window.plgVercelTrack = function (name, properties) {
    if (!name || typeof window.va !== 'function') return;
    window.va('event', {
      name: name,
      data: cleanProperties(properties || {})
    });
  };

  ensureQueue('si', 'siq');
  loadScript('/_vercel/speed-insights/script.js', {
    sdkn: '@vercel/speed-insights/html',
    sdkv: '2.0.0'
  });

  document.addEventListener('click', function (event) {
    var link = event.target && event.target.closest ? event.target.closest('a[href]') : null;
    if (!link) return;
    var href = link.getAttribute('href') || '';
    var text = (link.textContent || '').trim().slice(0, 80);
    if (/free-visibility-audit|Get.*Audit|Audit/i.test(href + ' ' + text)) {
      window.plgVercelTrack('Audit CTA Click', {
        href: href,
        label: text,
        path: window.location.pathname
      });
    }
    if (href.indexOf('tel:') === 0) {
      window.plgVercelTrack('Phone Click', { path: window.location.pathname });
    }
    if (href.indexOf('mailto:') === 0) {
      window.plgVercelTrack('Email Click', { path: window.location.pathname });
    }
  });
})();
