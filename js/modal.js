(function () {
  var modalEl = null;
  var miniMap = null;
  var onCloseCallback = null;
  var onFavToggleCallback = null;
  var currentData = null;
  var currentTab = 'horarios';

  function init(options) {
    onCloseCallback = options && options.onClose ? options.onClose : null;
    onFavToggleCallback = options && options.onFavToggle ? options.onFavToggle : null;
    buildModal();
    bindEvents();
  }

  function buildModal() {
    modalEl = document.createElement('div');
    modalEl.className = 'modal-overlay';
    modalEl.innerHTML =
      '<div class="modal-backdrop"></div>' +
      '<div class="modal-container" role="dialog" aria-modal="true" aria-labelledby="modalTitle">' +
        '<div class="modal-header">' +
          '<div class="modal-header-text">' +
            '<h2 class="modal-title" id="modalTitle"></h2>' +
            '<p class="modal-address" id="modalAddress"></p>' +
          '</div>' +
          '<div class="modal-header-actions">' +
            '<button class="modal-fav fav-btn" id="modalFavBtn" aria-label="Favoritar"><i class="ti ti-heart"></i></button>' +
            '<button class="modal-close-btn" id="modalCloseBtn" aria-label="Fechar"><i class="ti ti-x"></i></button>' +
          '</div>' +
        '</div>' +
        '<div class="modal-body" id="modalBody">' +
          '<div class="modal-section modal-next-bus" id="modalNextBus"></div>' +
          '<div class="modal-section modal-info-row" id="modalInfoRow"></div>' +
          '<div class="modal-section modal-actions-row" id="modalActions"></div>' +
          '<div class="modal-section modal-map-wrap" id="modalMapWrap">' +
            '<div class="modal-mini-map" id="modalMiniMap"></div>' +
          '</div>' +
          '<div class="modal-section modal-tabs-wrap" id="modalTabsWrap">' +
            '<div class="modal-tab-bar">' +
              '<button class="modal-tab-btn active" data-tab="horarios">Hor&aacute;rios</button>' +
              '<button class="modal-tab-btn" data-tab="percurso">Percurso</button>' +
            '</div>' +
            '<div class="modal-tab-content" id="modalTabContent"></div>' +
          '</div>' +
        '</div>' +
      '</div>';
    document.body.appendChild(modalEl);
  }

  function bindEvents() {
    modalEl.querySelector('#modalCloseBtn').addEventListener('click', close);
    modalEl.querySelector('.modal-backdrop').addEventListener('click', close);
    document.addEventListener('keydown', onKeyDown);

    var favBtn = modalEl.querySelector('#modalFavBtn');
    favBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      var id = this.getAttribute('data-id');
      if (!id) return;
      Favorites.toggleFavorite(id);
      var isFav = Favorites.isFavorite(id);
      this.classList.toggle('favorited', isFav);
      var icon = this.querySelector('i');
      if (icon) {
        icon.classList.remove('ti-heart', 'ti-heart-filled');
        icon.classList.add(isFav ? 'ti-heart-filled' : 'ti-heart');
      }
      this.classList.remove('fill', 'empty');
      void this.offsetWidth;
      this.classList.add(isFav ? 'fill' : 'empty');
      if (onFavToggleCallback) onFavToggleCallback(id);
    });

    var tabBtns = modalEl.querySelectorAll('.modal-tab-btn');
    var tabContent = modalEl.querySelector('#modalTabContent');
    for (var i = 0; i < tabBtns.length; i++) {
      tabBtns[i].addEventListener('click', function () {
        var newTab = this.getAttribute('data-tab');
        if (newTab === currentTab) return;
        for (var j = 0; j < tabBtns.length; j++) tabBtns[j].classList.remove('active');
        this.classList.add('active');
        currentTab = newTab;
        if (!currentData) return;
        tabContent.style.opacity = '0';
        setTimeout(function () {
          renderTabContent(currentData, currentTab);
          tabContent.style.opacity = '1';
        }, 200);
      });
    }
  }

  function onKeyDown(e) {
    if (e.key === 'Escape' && isOpen()) { close(); return; }
    if (e.key === 'Tab' && isOpen()) trapFocus(e);
  }

  function trapFocus(e) {
    var focusable = modalEl.querySelectorAll(
      'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    if (focusable.length === 0) return;
    var first = focusable[0];
    var last = focusable[focusable.length - 1];
    if (e.shiftKey) {
      if (document.activeElement === first) { e.preventDefault(); last.focus(); }
    } else {
      if (document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  }

  function isOpen() {
    return modalEl && modalEl.classList.contains('open');
  }

  function open(data) {
    currentData = data;
    currentTab = 'horarios';
    var tabBtns = modalEl.querySelectorAll('.modal-tab-btn');
    for (var i = 0; i < tabBtns.length; i++) {
      tabBtns[i].classList.toggle('active', tabBtns[i].getAttribute('data-tab') === 'horarios');
    }

    renderHeader(data);
    renderNextBus(data);
    renderInfoRow(data);
    renderActions(data);
    renderTabContent(data, 'horarios');

    requestAnimationFrame(function () {
      modalEl.classList.add('open');
      document.body.classList.add('modal-open');
      var closeBtn = modalEl.querySelector('#modalCloseBtn');
      if (closeBtn) closeBtn.focus();
    });

    setTimeout(function () {
      if (data.ponto && data.ponto.lat != null) initMiniMap(data);
    }, 300);
  }

  function close() {
    modalEl.classList.remove('open');
    document.body.classList.remove('modal-open');
    destroyMiniMap();
    if (onCloseCallback) onCloseCallback();
  }

  function getSharedLineItems(data) {
    if (data.sharedLineItems && data.sharedLineItems.length) return data.sharedLineItems;
    if (!data.linha) return [];
    return [{
      ponto: data.ponto,
      linha: data.linha,
      next: data.next,
      horarios: data.horarios || []
    }];
  }

  /* ---- render sections ---- */

  function renderHeader(data) {
    modalEl.querySelector('#modalTitle').textContent = escapeHtml(data.ponto.nome);
    var addrEl = modalEl.querySelector('#modalAddress');
    if (addrEl) addrEl.textContent = escapeHtml(data.ponto.endereco);
    var favBtn = modalEl.querySelector('#modalFavBtn');
    favBtn.setAttribute('data-id', data.ponto.id);
    favBtn.classList.toggle('favorited', !!data.isFav);
    var icon = favBtn.querySelector('i');
    if (icon) {
      icon.classList.remove('ti-heart', 'ti-heart-filled');
      icon.classList.add(data.isFav ? 'ti-heart-filled' : 'ti-heart');
    }
    favBtn.classList.remove('fill', 'empty');
  }

  function renderNextBus(data) {
    var el = modalEl.querySelector('#modalNextBus');
    var items = getSharedLineItems(data);
    if (items.length === 0) {
      el.innerHTML = '<div class="next-bus-card"><span class="next-bus-label">Pr&oacute;ximo &ocirc;nibus</span><div class="next-bus-main"><i class="ti ti-bus"></i><span class="next-bus-time">--</span></div></div>';
      return;
    }
    var item = items[0];
    var nextLabel = item.next ? item.next.label : '--';
    var lineColor = item.linha.cor || '#e53935';
    el.innerHTML =
      '<div class="next-bus-card">' +
        '<div class="next-bus-left">' +
          '<span class="next-bus-label">Pr&oacute;ximo &ocirc;nibus</span>' +
          '<div class="next-bus-main">' +
            '<i class="ti ti-bus"></i>' +
            '<span class="next-bus-time">' + escapeHtml(nextLabel) + '</span>' +
          '</div>' +
        '</div>' +
        '<div class="next-bus-pill">' +
          '<span class="next-bus-pill-name">' + escapeHtml(item.linha.nome) + '</span>' +
        '</div>' +
      '</div>';
  }

  function renderInfoRow(data) {
    var el = modalEl.querySelector('#modalInfoRow');
    var ponto = data.ponto;
    var dText = data.distanciaText || (data.distancia != null ? formatDistance(data.distancia) : null);

    var html = '';
    if (dText) {
      html += '<div class="info-col-card"><i class="ti ti-north-star"></i><div><p class="info-col-label">Dist&acirc;ncia</p><p class="info-col-value">' + escapeHtml(dText) + '</p></div></div>';
    }
    html += '<div class="info-col-card"><i class="ti ti-home"></i><div><p class="info-col-label">Bairro</p><p class="info-col-value">' + escapeHtml(ponto.bairro) + '</p></div></div>';
    el.innerHTML = html;
  }

  function renderActions(data) {
    var el = modalEl.querySelector('#modalActions');
    var ponto = data.ponto;
    var hasCoords = ponto.lat != null && ponto.lng != null;
    var routeUrl = hasCoords ? 'https://www.google.com/maps/dir/?api=1&destination=' + ponto.lat + ',' + ponto.lng : null;

    el.innerHTML =
      (hasCoords ? '<button class="action-btn action-btn-red" id="modalActionMap"><i class="ti ti-map"></i> Ver mapa</button>' : '') +
      (routeUrl ? '<a class="action-btn action-btn-outline" href="' + routeUrl + '" target="_blank" rel="noopener"><i class="ti ti-north-star"></i> Tra&ccedil;ar rota</a>' : '') +
      '<button class="action-btn action-btn-icon" id="modalActionShare"><i class="ti ti-share"></i></button>';

    var mapBtn = modalEl.querySelector('#modalActionMap');
    if (mapBtn) {
      mapBtn.addEventListener('click', function () {
        if (hasCoords && data.onMainMapFocus) data.onMainMapFocus(ponto);
        close();
      });
    }
    var shareBtn = modalEl.querySelector('#modalActionShare');
    if (shareBtn) {
      shareBtn.addEventListener('click', function () { sharePoint(data); });
    }
  }

  function renderTabContent(data, tab) {
    var el = modalEl.querySelector('#modalTabContent');
    if (!el) return;
    if (tab === 'horarios') {
      renderScheduleTab(el, data);
    } else {
      renderRouteTab(el, data);
    }
  }

  function renderScheduleTab(el, data) {
    var items = getSharedLineItems(data).filter(function (it) {
      return it.horarios && it.horarios.length > 0;
    });
    if (items.length === 0) {
      el.innerHTML = '<p class="tab-empty">Nenhum hor&aacute;rio dispon&iacute;vel.</p>';
      return;
    }
    var html = items.map(function (item) {
      var nextTime = item.next ? item.next.time : null;
      var times = item.horarios.map(function (t) {
        var cls = t === nextTime ? ' modal-time-active' : '';
        return '<span class="modal-time' + cls + '">' + escapeHtml(t) + '</span>';
      }).join('');
      return '<div class="schedule-group">' +
        '<div class="schedule-line-label"><span class="schedule-dot" style="background:' + (item.linha.cor || '#e53935') + '"></span>' + escapeHtml(item.linha.nome) + '</div>' +
        '<div class="modal-times-grid">' + times + '</div>' +
      '</div>';
    }).join('');
    el.innerHTML = html;
  }

  function renderRouteTab(el, data) {
    var allLinePoints = data.allLinePoints;
    if (!allLinePoints || allLinePoints.length < 2) {
      el.innerHTML = '<p class="tab-empty">Percurso n&atilde;o dispon&iacute;vel.</p>';
      return;
    }
    var currentId = Number(data.ponto.id);
    var parts = [];
    allLinePoints.forEach(function (p, i) {
      var isCurrent = Number(p.id) === currentId;
      var dotClass = isCurrent ? ' route-stop-dot route-dot-current' : ' route-stop-dot';
      var nameClass = isCurrent ? ' route-stop-name route-name-current' : ' route-stop-name';
      parts.push(
        '<div class="route-stop">' +
          '<span class="' + nameClass + '">' + escapeHtml(p.nome) + (isCurrent ? ' <i class="ti ti-map-pin"></i>' : '') + '</span>' +
          '<div class="' + dotClass + '"></div>' +
        '</div>'
      );
      if (i < allLinePoints.length - 1) {
        parts.push('<div class="route-connector"></div>');
      }
    });
    el.innerHTML = '<div class="route-timeline-h"><div class="route-track">' + parts.join('') + '</div></div>';
  }

  function sharePoint(data) {
    var ponto = data.ponto;
    var items = getSharedLineItems(data);
    var text = [
      ponto.nome,
      ponto.endereco + ' - ' + ponto.bairro,
      items.map(function (it) { return it.linha.nome; }).join(', '),
      'BarraBonita/SP',
      'https://www.google.com/maps?q=' + ponto.lat + ',' + ponto.lng
    ].filter(Boolean).join('\n');
    if (navigator.share) {
      navigator.share({ title: ponto.nome, text: text }).catch(function () {});
    } else {
      copyToClipboard(text);
    }
  }

  function copyToClipboard(text) {
    if (navigator.clipboard) navigator.clipboard.writeText(text).catch(function () {});
  }

  /* ---- mini map ---- */

  function initMiniMap(data) {
    var ponto = data.ponto;
    var container = modalEl.querySelector('#modalMiniMap');
    if (!container || typeof L === 'undefined') return;
    destroyMiniMap();
    miniMap = L.map(container, { zoomControl: true, scrollWheelZoom: true })
      .setView([Number(ponto.lat), Number(ponto.lng)], 16);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap'
    }).addTo(miniMap);
    L.marker([Number(ponto.lat), Number(ponto.lng)]).addTo(miniMap);
  }

  function destroyMiniMap() {
    if (miniMap) { miniMap.remove(); miniMap = null; }
  }

  window.Modal = { init: init, open: open, close: close };
})();
