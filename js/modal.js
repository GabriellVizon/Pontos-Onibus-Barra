(function () {
  var modalEl = null;
  var miniMap = null;
  var onCloseCallback = null;
  var onFavToggleCallback = null;
  var currentData = null;
  var currentTab = 'horarios';
  var liveTimer = null;

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
          '<div class="modal-section modal-reminder-wrap" id="modalReminderWrap"></div>' +
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
    renderReminderState(data);
    renderTabContent(data, 'horarios');

    requestAnimationFrame(function () {
      modalEl.classList.add('open');
      document.body.classList.add('modal-open');
      var closeBtn = modalEl.querySelector('#modalCloseBtn');
      if (closeBtn) closeBtn.focus();
    });

    clearInterval(liveTimer);
    liveTimer = setInterval(function () {
      if (!isOpen() || !currentData) return;
      updateLive();
    }, 30000);

    setTimeout(function () {
      if (data.ponto && data.ponto.lat != null) initMiniMap(data);
    }, 300);
  }

  function close() {
    modalEl.classList.remove('open');
    document.body.classList.remove('modal-open');
    clearInterval(liveTimer);
    liveTimer = null;
    destroyMiniMap();
    if (onCloseCallback) onCloseCallback();
  }

  function updateLive() {
    var fresh = Object.assign({}, currentData, {
      next: getNextDeparture(currentData.horarios)
    });
    renderNextBus(fresh);
    if (currentTab === 'horarios') {
      var el = modalEl.querySelector('#modalTabContent');
      if (el) renderScheduleTab(el, fresh);
    }
  }

  /* ---- render sections ---- */

  function renderHeader(data) {
    modalEl.querySelector('#modalTitle').textContent = data.ponto.nome;
    var addrEl = modalEl.querySelector('#modalAddress');
    if (addrEl) addrEl.textContent = data.ponto.endereco;
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
    var next = data.next || getNextDeparture(data.horarios);
    var nextLabel = next ? next.label : '--';
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
          '<span class="next-bus-pill-name">Rota Circular</span>' +
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

  function renderReminderState(data) {
    var wrap = modalEl.querySelector('#modalReminderWrap');
    if (!wrap) return;
    if (typeof Reminders === 'undefined') { wrap.innerHTML = ''; return; }

    var stopId = data.ponto.id;

    if (Reminders.hasForStop(stopId)) {
      wrap.innerHTML =
        '<div class="reminder-active">' +
          '<i class="ti ti-bell-filled"></i>' +
          '<span>Lembrete agendado para este ponto</span>' +
          '<button class="reminder-cancel" id="reminderCancel" type="button">Cancelar</button>' +
        '</div>';
      var cancelBtn = wrap.querySelector('#reminderCancel');
      if (cancelBtn) {
        cancelBtn.addEventListener('click', function () {
          Reminders.cancelForStop(stopId);
          renderReminderState(data);
          showToast('Lembrete cancelado.');
        });
      }
      return;
    }

    var next = data.next || getNextDeparture(data.horarios);
    var hasNext = next && next.time && next.time !== '--';
    var optionsHtml = hasNext
      ? [5, 10, 15, 30].map(function (m) {
          return '<button class="reminder-opt" data-min="' + m + '" type="button">' + m + ' min</button>';
        }).join('')
      : '<span class="reminder-unavailable">Sem pr&oacute;ximo &ocirc;nibus hoje para lembrar.</span>';

    wrap.innerHTML =
      '<div class="reminder-inline">' +
        '<span class="reminder-label"><i class="ti ti-bell"></i> Avisar antes do pr&oacute;ximo &ocirc;nibus:</span>' +
        '<div class="reminder-options">' + optionsHtml + '</div>' +
      '</div>';

    wrap.querySelectorAll('.reminder-opt').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var minutes = Number(btn.getAttribute('data-min'));
        Reminders.requestPermission().then(function () {
          var reminder = Reminders.add({
            stopId: stopId,
            stopName: data.ponto.nome,
            departure: next.time,
            minutesBefore: minutes
          });
          if (reminder) {
            showToast('Lembrete agendado para ' + formatTrigger(reminder.triggerAt) + '.');
          } else {
            showToast('Não foi possível agendar o lembrete.');
          }
          renderReminderState(data);
        });
      });
    });
  }

  function formatTrigger(triggerAt) {
    var d = new Date(triggerAt);
    var now = new Date();
    var hh = (d.getHours() < 10 ? '0' : '') + d.getHours();
    var mm = (d.getMinutes() < 10 ? '0' : '') + d.getMinutes();
    var dayLabel = d.toDateString() === now.toDateString() ? 'hoje' : 'amanhã';
    return dayLabel + ' às ' + hh + ':' + mm;
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
    var horarios = data.horarios;
    if (!horarios || horarios.length === 0) {
      var emptyMsg = getCurrentDayType() === 'domingo'
        ? 'Não há operação aos domingos.'
        : 'Nenhum horário disponível.';
      el.innerHTML = '<p class="tab-empty">' + escapeHtml(emptyMsg) + '</p>';
      return;
    }
    var nextTime = data.next ? data.next.time : null;
    var times = horarios.map(function (t) {
      var cls = t === nextTime ? ' modal-time-active' : '';
      return '<span class="modal-time' + cls + '">' + escapeHtml(t) + '</span>';
    }).join('');
    el.innerHTML =
      '<div class="schedule-group">' +
        '<div class="schedule-line-label"><span class="schedule-dot" style="background:' + (data.lineColor || BUS_COLOR) + '"></span>Rota Circular</div>' +
        '<div class="modal-times-grid">' + times + '</div>' +
      '</div>';
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
    var text = [
      ponto.nome,
      ponto.endereco + ' - ' + ponto.bairro,
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
