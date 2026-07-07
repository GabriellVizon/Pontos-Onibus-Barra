(function () {
  var modalEl = null;
  var miniMap = null;
  var onCloseCallback = null;
  var onFavToggleCallback = null;
  var currentData = null;
  var scheduleExpanded = false;

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
          '<h2 class="modal-title" id="modalTitle"></h2>' +
          '<div class="modal-header-actions">' +
            '<button class="modal-fav fav-btn" id="modalFavBtn" aria-label="Favoritar"><i class="ti ti-heart"></i></button>' +
            '<button class="modal-close-btn" id="modalCloseBtn" aria-label="Fechar"><i class="ti ti-x"></i></button>' +
          '</div>' +
        '</div>' +
        '<div class="modal-body" id="modalBody">' +
          '<div class="modal-section modal-info" id="modalInfo"></div>' +
          '<div class="modal-section modal-line-status" id="modalLineStatus"></div>' +
          '<div class="modal-section modal-map-wrap" id="modalMapWrap"><div class="modal-mini-map" id="modalMiniMap"></div></div>' +
          '<div class="modal-section modal-schedule" id="modalSchedule"></div>' +
          '<div class="modal-section modal-route" id="modalRoute"></div>' +
        '</div>' +
        '<div class="modal-footer-actions" id="modalActions"></div>' +
      '</div>';
    document.body.appendChild(modalEl);
  }

  function bindEvents() {
    modalEl.querySelector('#modalCloseBtn').addEventListener('click', close);
    modalEl.querySelector('.modal-backdrop').addEventListener('click', close);
    document.addEventListener('keydown', onKeyDown);

    var favBtn = modalEl.querySelector('#modalFavBtn');
    favBtn.addEventListener('click', function () {
      var id = this.getAttribute('data-id');
      if (!id) return;
      Favorites.toggleFavorite(id);
      var isFav = Favorites.isFavorite(id);
      this.classList.toggle('favorited', isFav);
      if (onFavToggleCallback) onFavToggleCallback(id);
    });
  }

  function onKeyDown(e) {
    if (e.key === 'Escape' && isOpen()) { close(); return; }
    if (e.key === 'Tab' && isOpen()) trapFocus(e);
  }

  function trapFocus(e) {
    var focusable = modalEl.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    if (focusable.length === 0) return;
    var first = focusable[0];
    var last = focusable[focusable.length - 1];
    if (e.shiftKey) {
      if (document.activeElement === first) {
        e.preventDefault();
        last.focus();
      }
    } else {
      if (document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  }

  function isOpen() {
    return modalEl && modalEl.classList.contains('open');
  }

  function open(data) {
    currentData = data;
    renderHeader(data);
    renderInfo(data);
    renderLineStatus(data);
    renderSchedule(data);
    renderRoute(data);
    renderActions(data);

    requestAnimationFrame(function () {
      modalEl.classList.add('open');
      document.body.classList.add('modal-open');
      var closeBtn = modalEl.querySelector('#modalCloseBtn');
      if (closeBtn) closeBtn.focus();
    });

    setTimeout(function () {
      if (data.ponto && data.ponto.lat != null) initMiniMap(data.ponto);
    }, 300);
  }

  function close() {
    modalEl.classList.remove('open');
    document.body.classList.remove('modal-open');
    destroyMiniMap();
    if (onCloseCallback) onCloseCallback();
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function formatDistance(d) {
    if (d == null) return null;
    if (d < 1) return Math.round(d * 1000) + 'm';
    return d.toFixed(1).replace('.', ',') + 'km';
  }

  /* ---- render sections ---- */

  function renderHeader(data) {
    var titleEl = modalEl.querySelector('#modalTitle');
    titleEl.textContent = escapeHtml(data.ponto.nome);

    var favBtn = modalEl.querySelector('#modalFavBtn');
    favBtn.setAttribute('data-id', data.ponto.id);
    favBtn.classList.toggle('favorited', !!data.isFav);
  }

  function renderInfo(data) {
    var el = modalEl.querySelector('#modalInfo');
    var ponto = data.ponto;
    var linha = data.linha;
    var dText = data.distanciaText || (data.distancia != null ? formatDistance(data.distancia) : null);

    el.innerHTML =
      '<div class="modal-info-grid">' +
        '<div class="modal-info-item">' +
          '<i class="ti ti-map-pin"></i>' +
          '<span>' + escapeHtml(ponto.endereco) + '</span>' +
        '</div>' +
        '<div class="modal-info-item">' +
          '<i class="ti ti-building"></i>' +
          '<span>' + escapeHtml(ponto.bairro) + '</span>' +
        '</div>' +
        (dText ? '<div class="modal-info-item">' +
          '<i class="ti ti-navigation"></i>' +
          '<span>' + escapeHtml(dText) + '</span>' +
        '</div>' : '') +
        (linha ? '<div class="modal-info-item">' +
          '<i class="ti ti-bus"></i>' +
          '<span>' + escapeHtml(linha.nome) + ' &mdash; ' + escapeHtml(linha.titulo) + '</span>' +
        '</div>' : '') +
        '<div class="modal-info-item">' +
          '<i class="ti ti-hash"></i>' +
          '<span>Ordem ' + escapeHtml(ponto.ordem) + '</span>' +
        '</div>' +
        (data.next && data.next.label ? '<div class="modal-info-item">' +
          '<i class="ti ti-clock"></i>' +
          '<span>Pr&oacute;xima sa&iacute;da: <strong>' + escapeHtml(data.next.label) + '</strong></span>' +
        '</div>' : '') +
      '</div>';
  }

  function renderLineStatus(data) {
    var el = modalEl.querySelector('#modalLineStatus');
    var linha = data.linha;
    if (!linha) { el.innerHTML = ''; return; }

    var nextLabel = data.next ? data.next.label : '--';

    el.innerHTML =
      '<div class="modal-status-card">' +
        '<div class="modal-status-header">' +
          '<div class="modal-status-dot" style="background:' + escapeHtml(linha.cor || '#e53935') + '"></div>' +
          '<span class="modal-status-line-name">' + escapeHtml(linha.nome) + '</span>' +
        '</div>' +
        '<p class="modal-status-route">' + escapeHtml(linha.titulo || '') + '</p>' +
        '<div class="modal-status-next">' +
          '<span class="modal-status-label">Pr&oacute;ximo &ocirc;nibus</span>' +
          '<span class="modal-status-time">' + escapeHtml(nextLabel) + '</span>' +
        '</div>' +
      '</div>';
  }

  function renderSchedule(data) {
    var el = modalEl.querySelector('#modalSchedule');
    var horarios = data.horarios;
    if (!horarios || horarios.length === 0) { el.innerHTML = ''; return; }

    scheduleExpanded = false;
    var nextTime = data.next ? data.next.time : null;
    var timesHtml = horarios.map(function (t) {
      var active = t === nextTime ? ' modal-time-active' : '';
      return '<span class="modal-time' + active + '">' + escapeHtml(t) + '</span>';
    }).join('');

    el.innerHTML =
      '<h3 class="modal-section-title">Pr&oacute;ximas sa&iacute;das</h3>' +
      '<div class="modal-times" id="modalTimes">' + timesHtml + '</div>' +
      (horarios.length > 5 ? '<button class="modal-show-all-btn" id="modalShowAllBtn">Ver tabela completa (' + horarios.length + ' hor&aacute;rios)</button>' : '');

    var showAllBtn = el.querySelector('#modalShowAllBtn');
    if (showAllBtn) {
      showAllBtn.addEventListener('click', function () {
        scheduleExpanded = !scheduleExpanded;
        var allTimes = horarios.map(function (t) {
          var active = t === nextTime ? ' modal-time-active' : '';
          return '<span class="modal-time' + active + '">' + escapeHtml(t) + '</span>';
        }).join('');
        var timesContainer = el.querySelector('#modalTimes');
        timesContainer.innerHTML = allTimes;
        timesContainer.classList.toggle('expanded', scheduleExpanded);
        this.textContent = scheduleExpanded ? 'Mostrar menos' : 'Ver tabela completa (' + horarios.length + ' hor&aacute;rios)';
      });
    }
  }

  function renderRoute(data) {
    var el = modalEl.querySelector('#modalRoute');
    var allLinePoints = data.allLinePoints;
    if (!allLinePoints || allLinePoints.length < 2) { el.innerHTML = ''; return; }

    var currentId = Number(data.ponto.id);
    var itemsHtml = allLinePoints.map(function (p, i) {
      var isCurrent = Number(p.id) === currentId;
      var dotClass = isCurrent ? ' modal-route-dot-current' : '';
      var nameClass = isCurrent ? ' modal-route-name-current' : '';
      var lineAfter = i < allLinePoints.length - 1 ? '<div class="modal-route-line"></div>' : '';
      return (
        '<div class="modal-route-item">' +
          '<div class="modal-route-col">' +
            '<div class="modal-route-dot' + dotClass + '"></div>' +
            lineAfter +
          '</div>' +
          '<span class="modal-route-name' + nameClass + '">' + escapeHtml(p.nome) + (isCurrent ? ' <i class="ti ti-map-pin"></i>' : '') + '</span>' +
        '</div>'
      );
    }).join('');

    el.innerHTML =
      '<h3 class="modal-section-title">Rota da linha</h3>' +
      '<div class="modal-route-timeline">' + itemsHtml + '</div>';
  }

  function renderActions(data) {
    var el = modalEl.querySelector('#modalActions');
    var ponto = data.ponto;
    var isFav = Favorites.isFavorite(String(ponto.id));
    var hasCoords = ponto.lat != null && ponto.lng != null;
    var routeUrl = hasCoords ? 'https://www.google.com/maps/dir/?api=1&destination=' + ponto.lat + ',' + ponto.lng : null;

    el.innerHTML =
      (hasCoords ? '<button class="modal-action-btn" id="modalActionMap" data-action="open-map"><i class="ti ti-map"></i> Abrir mapa</button>' : '') +
      (routeUrl ? '<a class="modal-action-btn" href="' + routeUrl + '" target="_blank" rel="noopener"><i class="ti ti-route"></i> Tra&ccedil;ar rota</a>' : '') +
      '<button class="modal-action-btn" id="modalActionFav"><i class="ti ti-heart"></i> ' + (isFav ? 'Remover dos favoritos' : 'Favoritar') + '</button>' +
      '<button class="modal-action-btn" id="modalActionShare"><i class="ti ti-share"></i> Compartilhar</button>';

    modalEl.querySelector('#modalActionMap')?.addEventListener('click', function () {
      if (hasCoords && data.onMainMapFocus) {
        data.onMainMapFocus(ponto);
      }
      close();
    });

    modalEl.querySelector('#modalActionFav')?.addEventListener('click', function () {
      var id = String(ponto.id);
      Favorites.toggleFavorite(id);
      var nowFav = Favorites.isFavorite(id);
      modalEl.querySelector('#modalFavBtn').classList.toggle('favorited', nowFav);
      this.innerHTML = '<i class="ti ti-heart"></i> ' + (nowFav ? 'Remover dos favoritos' : 'Favoritar');
      if (onFavToggleCallback) onFavToggleCallback(id);
    });

    modalEl.querySelector('#modalActionShare')?.addEventListener('click', function () {
      sharePoint(data);
    });
  }

  function sharePoint(data) {
    var ponto = data.ponto;
    var linha = data.linha;
    var text = [
      ponto.nome,
      ponto.endereco + ' - ' + ponto.bairro,
      linha ? linha.nome : '',
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
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text).catch(function () {});
    }
  }

  /* ---- mini map ---- */

  function initMiniMap(ponto) {
    var container = modalEl.querySelector('#modalMiniMap');
    if (!container || typeof L === 'undefined') return;

    destroyMiniMap();

    miniMap = L.map(container, {
      zoomControl: true,
      scrollWheelZoom: true,
    }).setView([Number(ponto.lat), Number(ponto.lng)], 16);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap'
    }).addTo(miniMap);

    L.marker([Number(ponto.lat), Number(ponto.lng)]).addTo(miniMap);
  }

  function destroyMiniMap() {
    if (miniMap) {
      miniMap.remove();
      miniMap = null;
    }
  }

  window.Modal = {
    init: init,
    open: open,
    close: close
  };
})();
