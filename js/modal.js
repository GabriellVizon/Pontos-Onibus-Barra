(function () {
  var modalEl = null;
  var miniMap = null;
  var miniMarker = null;
  var context = {};
  var onCloseCallback = null;
  var onFavToggleCallback = null;
  var currentData = null;
  var currentTab = 'horarios';
  var liveTimer = null;
  var routeState = {};
  var returnFocus = null;

  var modalState = {
    linhaSelecionada: 'circular',
    sentidoPlena: null,
    diaTabPlena: 'uteis',
    linhasDisponiveis: [],
    sentidosPlena: [],
    abasDiaPlena: []
  };

  function init(options) {
    context = options || {};
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
      '<div class="modal-container" role="dialog" aria-modal="true" aria-labelledby="modalTitle" aria-describedby="modalAddress">' +
        '<div class="modal-header">' +
          '<div class="modal-header-text">' +
            '<h2 class="modal-title" id="modalTitle"></h2>' +
            '<p class="modal-address" id="modalAddress"></p>' +
            '<p class="modal-address" id="modalReference" hidden></p>' +
          '</div>' +
          '<div class="modal-header-actions">' +
            '<button class="modal-fav fav-btn" id="modalFavBtn" aria-label="Favoritar"><i class="ti ti-heart"></i></button>' +
            '<button class="modal-close-btn" id="modalCloseBtn" aria-label="Fechar"><i class="ti ti-x"></i></button>' +
          '</div>' +
        '</div>' +
        '<div class="modal-body" id="modalBody">' +
          '<div class="modal-section modal-line-selector-wrap" id="modalLineSelector"></div>' +
          '<div class="modal-section modal-next-bus" id="modalNextBus"></div>' +
          '<div class="modal-section modal-info-row" id="modalInfoRow"></div>' +
          '<div class="modal-location-help" id="modalLocationHelp"></div>' +
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
    var bar = modalEl.querySelector('.modal-tab-bar');
    bar.setAttribute('role','tablist');
    bar.setAttribute('aria-label','Detalhes do ponto');
    modalEl.querySelectorAll('.modal-tab-btn').forEach(function(btn){
      btn.id='modal-tab-'+btn.dataset.tab;
      btn.setAttribute('role','tab');
      btn.setAttribute('aria-controls','modalTabContent');
    });
    var panel=modalEl.querySelector('#modalTabContent');
    panel.setAttribute('role','tabpanel');
    panel.setAttribute('tabindex','0');
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
      this.setAttribute('aria-label', isFav ? 'Remover dos favoritos' : 'Adicionar aos favoritos');
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

    var tabBtns = Array.from(modalEl.querySelectorAll('.modal-tab-btn'));
    tabBtns.forEach(function(btn,index){
      btn.addEventListener('click',function(){ activateTab(btn.dataset.tab); });
      btn.addEventListener('keydown',function(e){
        var next=e.key==='ArrowRight'?(index+1)%2:e.key==='ArrowLeft'?(index+1)%2:e.key==='Home'?0:e.key==='End'?1:null;
        if(next!==null){e.preventDefault();tabBtns[next].focus();activateTab(tabBtns[next].dataset.tab);}
      });
    });
  }

  function activateTab(tab) {
    if(!currentData)return;
    currentTab=tab;
    renderTabContent(currentData,tab);
    var body=modalEl.querySelector('#modalBody');
    var bar=modalEl.querySelector('.modal-tab-bar');
    body.scrollTop+=bar.getBoundingClientRect().top-body.getBoundingClientRect().top;
    if(tab==='horarios'&&miniMap)requestAnimationFrame(function(){miniMap.invalidateSize();});
  }

  function onKeyDown(e) {
    if (e.key === 'Escape' && isOpen()) { close(); return; }
    if (e.key === 'Tab' && isOpen()) trapFocus(e);
  }

  function trapFocus(e) {
    var focusable = Array.from(modalEl.querySelectorAll(
      'button:not([disabled]):not([tabindex="-1"]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    )).filter(function(el){return el.getClientRects().length && getComputedStyle(el).visibility!=='hidden';});
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

  function applyPlenaTheme() {
    modalEl.classList.toggle('plena-theme', modalState.linhaSelecionada === 'plena');
  }

  function open(data) {
    returnFocus = document.activeElement;
    routeState = {};
    currentData = data;
    currentTab = 'horarios';
    syncLocation();
    var tabBtns = modalEl.querySelectorAll('.modal-tab-btn');
    for (var i = 0; i < tabBtns.length; i++) {
      tabBtns[i].classList.toggle('active', tabBtns[i].getAttribute('data-tab') === 'horarios');
    }

    var linhas = data.linhas || ['circular'];
    var linhaInicial = linhas.length === 1 ? linhas[0] : 'circular';
    if (linhas.indexOf(linhaInicial) === -1) linhaInicial = linhas[0];

    modalState.linhaSelecionada = linhaInicial;
    modalState.linhasDisponiveis = linhas;
    applyPlenaTheme();

    if (linhaInicial === 'plena') {
      var sentidos = typeof obterSentidosPlena === 'function'
        ? obterSentidosPlena(data.ponto.id)
        : [];
      modalState.sentidosPlena = sentidos;
      modalState.sentidoPlena = sentidos.length > 0 ? sentidos[0].id : null;

      var abas = typeof obterAbasDiaPlena === 'function'
        ? obterAbasDiaPlena(modalState.sentidoPlena, data.ponto.id)
        : [];
      modalState.abasDiaPlena = abas;
      modalState.diaTabPlena = abas.some(function(a){return a.id === getCurrentDayType();}) ? getCurrentDayType() : (abas.length ? abas[0].id : 'uteis');
    } else {
      modalState.sentidosPlena = [];
      modalState.sentidoPlena = null;
      modalState.abasDiaPlena = [];
      modalState.diaTabPlena = 'uteis';
    }

    data.next = computeNextForModal();
    renderHeader(data);
    renderLineSelector();
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
      if (isOpen() && currentData && hasCoords(currentData.ponto)) initMiniMap(currentData);
    }, 300);
  }

  function close() {
    modalEl.classList.remove('open');
    document.body.classList.remove('modal-open');
    clearInterval(liveTimer);
    liveTimer = null;
    destroyMiniMap();
    if (onCloseCallback) onCloseCallback();
    function available(el){return el && el.isConnected && !el.closest('.modal-overlay') && el.getClientRects().length && getComputedStyle(el).visibility!=='hidden';}
    var target=returnFocus;
    if(!available(target)) {
      target=Array.from(document.querySelectorAll('#searchMobileBtn, #searchInput, #mobileMenuBtn')).find(available);
    }
    if(target)target.focus({preventScroll:true});
  }

  // The selected stop is a destination; the GPS origin belongs to the page.
  function syncLocation() {
    if (!currentData) return;
    var origin = context.getUserPosition ? context.getUserPosition() : null;
    currentData.userPosition = origin && hasCoords(origin) ? origin : null;
    currentData.distancia = currentData.userPosition && hasCoords(currentData.ponto)
      ? distanceKm(origin.lat, origin.lng, currentData.ponto.lat, currentData.ponto.lng) : null;
    currentData.distanciaText = null;
  }

  function refreshLocation() {
    if (!currentData || !isOpen()) return;
    syncLocation();
    renderInfoRow(currentData);
    renderActions(currentData);
  }

  function selectPoint(id) {
    var point = context.resolvePoint && context.resolvePoint(Number(id), modalState.linhaSelecionada);
    if (!point || !currentData) return;
    currentData = Object.assign({}, currentData, {
      ponto: point,
      horarios: modalState.linhaSelecionada === 'circular' ? obterHorariosDoPonto(point.id) : [],
      isFav: Favorites.isFavorite(String(point.id))
    });
    if (modalState.linhaSelecionada === 'plena') {
      modalState.sentidosPlena = obterSentidosPlena(point.id);
      if (!modalState.sentidosPlena.some(function(s){return s.id === modalState.sentidoPlena;})) {
        modalState.sentidoPlena = modalState.sentidosPlena.length ? modalState.sentidosPlena[0].id : null;
      }
      modalState.abasDiaPlena = obterAbasDiaPlena(modalState.sentidoPlena, point.id);
      if (!modalState.abasDiaPlena.some(function(d){return d.id === modalState.diaTabPlena;})) {
        modalState.diaTabPlena = modalState.abasDiaPlena.length ? modalState.abasDiaPlena[0].id : 'uteis';
      }
    }
    syncLocation();
    currentData.next = computeNextForModal();
    renderHeader(currentData);
    renderNextBus(currentData);
    renderInfoRow(currentData);
    renderActions(currentData);
    renderReminderState(currentData);
    renderTabContent(currentData, currentTab);
    initMiniMap(currentData);
    if (context.onPointSelected) context.onPointSelected(point.id);
    var title = modalEl.querySelector('#modalTitle');
    title.setAttribute('aria-live','polite');
  }

  function updateLive() {
    var fresh = Object.assign({}, currentData, {
      next: computeNextForModal()
    });
    renderNextBus(fresh);
    if (currentTab === 'horarios') {
      var el = modalEl.querySelector('#modalTabContent');
      if (el) renderScheduleTab(el, fresh);
    }
  }

  /* ---- compute next bus based on current selection ---- */

  function computeNextForModal() {
    if (modalState.linhaSelecionada === 'plena') {
      if (typeof encontrarPassagensPlena === 'function' && modalState.sentidoPlena) {
        var res = encontrarPassagensPlena(
          currentData.ponto.id,
          modalState.sentidoPlena,
          modalState.diaTabPlena
        );
        if (res.encontrado) {
          var minRest = res.minutosRestantes;
          var label;
          if (res.estado === 'chegando') label = 'Agora';
          else if (minRest < 60) label = minRest + ' min';
          else {
            var h = Math.floor(minRest / 60);
            var m = minRest % 60;
            label = m === 0 ? h + 'h' : h + 'h ' + m + 'min';
          }
          return { time: res.horario, label: label, minutes: minRest };
        }
        return { time: '--', label: 'Sem horário', minutes: Infinity };
      }
      return { time: '--', label: 'Sem dados', minutes: Infinity };
    }
    // CIRCULAR: referências parciais por ponto — usa o tipo de dia atual, igual à
    // lista de horários exibida (diaTabPlena pertence à Plena).
    if (typeof encontrarPassagens === 'function') {
      var pass = encontrarPassagens(currentData.ponto.id);
      if (pass.encontrado) {
        return {
          time: pass.horario,
          label: pass.label,
          minutes: pass.minutosRestantes,
          situacao: pass.situacao,
          faixa: pass.faixa
        };
      }
      return { time: '--', label: pass.mensagem || 'Sem horário', minutes: Infinity, situacao: pass.situacao, faixa: null };
    }
    return getNextDeparture(currentData.horarios);
  }

  /* ---- render sections ---- */

  function renderHeader(data) {
    modalEl.querySelector('#modalTitle').textContent = data.ponto.nome;
    var addrEl = modalEl.querySelector('#modalAddress');
    if (addrEl) addrEl.textContent = data.ponto.endereco;
    var reference = modalEl.querySelector('#modalReference');
    reference.textContent = data.ponto.referencia || '';
    reference.hidden = !data.ponto.referencia;
    var favBtn = modalEl.querySelector('#modalFavBtn');
    favBtn.setAttribute('data-id', data.ponto.id);
    favBtn.classList.toggle('favorited', !!data.isFav);
    favBtn.setAttribute('aria-label', data.isFav ? 'Remover dos favoritos' : 'Adicionar aos favoritos');
    var icon = favBtn.querySelector('i');
    if (icon) {
      icon.classList.remove('ti-heart', 'ti-heart-filled');
      icon.classList.add(data.isFav ? 'ti-heart-filled' : 'ti-heart');
    }
    favBtn.classList.remove('fill', 'empty');
  }

  function renderLineSelector() {
    var el = modalEl.querySelector('#modalLineSelector');
    if (!el) return;

    var linhas = modalState.linhasDisponiveis;
    if (linhas.length <= 1) {
      el.style.display = 'none';
      return;
    }

    el.style.display = '';
    var html = '<div class="line-selector">';
    linhas.forEach(function (l) {
      var nome = l === 'circular' ? 'Circular de Barra Bonita' : 'Plena: Barra ↔ Igaraçu';
      var cls = l === modalState.linhaSelecionada ? 'line-selector-btn active' : 'line-selector-btn';
      var dotColor = l === 'circular' ? '#e74c3c' : '#2196f3';
      html += '<button class="' + cls + '" data-linha="' + l + '">' +
        '<span class="line-selector-dot" style="background:' + dotColor + '"></span>' +
        nome +
        '</button>';
    });
    html += '</div>';

    el.innerHTML = html;

    el.querySelectorAll('.line-selector-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        modalState.linhaSelecionada = this.getAttribute('data-linha');
        onLinhaChange();
      });
    });
  }

  function onLinhaChange() {
    var linha = modalState.linhaSelecionada;
    applyPlenaTheme();

    renderLineSelector();

    if (linha === 'plena') {
      var sentidos = typeof obterSentidosPlena === 'function'
        ? obterSentidosPlena(currentData.ponto.id)
        : [];
      modalState.sentidosPlena = sentidos;
      modalState.sentidoPlena = sentidos.length > 0 ? sentidos[0].id : null;

      var abas = typeof obterAbasDiaPlena === 'function'
        ? obterAbasDiaPlena(modalState.sentidoPlena, currentData.ponto.id)
        : [];
      modalState.abasDiaPlena = abas;
      modalState.diaTabPlena = abas.some(function(a){return a.id === getCurrentDayType();}) ? getCurrentDayType() : (abas.length ? abas[0].id : 'uteis');
    } else {
      modalState.sentidosPlena = [];
      modalState.sentidoPlena = null;
      modalState.abasDiaPlena = [];
      modalState.diaTabPlena = 'uteis';
    }

    var fresh = Object.assign({}, currentData, { next: computeNextForModal() });
    renderNextBus(fresh);
    renderInfoRow(fresh);
    renderReminderState(fresh);

    currentTab = 'horarios';
    var tabBtns = modalEl.querySelectorAll('.modal-tab-btn');
    for (var i = 0; i < tabBtns.length; i++) {
      tabBtns[i].classList.toggle('active', tabBtns[i].getAttribute('data-tab') === 'horarios');
    }
    renderTabContent(currentData, 'horarios');

    if (linha === 'plena') {
      setTimeout(function () { renderDirectionSelector(); }, 0);
    }
  }

  function renderDirectionSelector() {
    var wrap = modalEl.querySelector('#modalTabContent');
    if (!wrap || modalState.linhaSelecionada !== 'plena') return;
    if (modalState.sentidosPlena.length <= 1) return;

    var dirHtml = '<div class="direction-selector">';
    modalState.sentidosPlena.forEach(function (s) {
      var cls = s.id === modalState.sentidoPlena ? 'direction-btn active' : 'direction-btn';
      dirHtml += '<button class="' + cls + '" data-sentido="' + s.id + '">' + escapeHtml(s.nome) + '</button>';
    });
    dirHtml += '</div>';

    var existingDir = wrap.querySelector('.direction-selector');
    if (existingDir) existingDir.remove();

    wrap.insertAdjacentHTML('afterbegin', dirHtml);

    wrap.querySelectorAll('.direction-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        modalState.sentidoPlena = this.getAttribute('data-sentido');

        var abas = typeof obterAbasDiaPlena === 'function'
          ? obterAbasDiaPlena(modalState.sentidoPlena, currentData.ponto.id)
          : [];
        modalState.abasDiaPlena = abas;
        if (abas.length > 0 && abas.every(function (a) { return a.id !== modalState.diaTabPlena; })) {
          modalState.diaTabPlena = abas[0].id;
        }

        var fresh = Object.assign({}, currentData, { next: computeNextForModal() });
        renderNextBus(fresh);
        renderInfoRow(fresh);
        renderScheduleTab(wrap, fresh);
        renderReminderState(fresh);
      });
    });
  }

  function renderNextBus(data) {
    var el = modalEl.querySelector('#modalNextBus');
    var next = modalState.linhaSelecionada === 'circular' ? apresentarProximaCircular(data.ponto.id) : (data.next || computeNextForModal());
    var nextLabel = next ? (modalState.linhaSelecionada === 'plena' && next.time !== '--' ? next.time : next.label) : '--';

    var pillName;
    if (modalState.linhaSelecionada === 'plena') {
      var sentido = modalState.sentidosPlena.find(function (s) { return s.id === modalState.sentidoPlena; });
      pillName = sentido ? sentido.nome : 'Plena';
    } else {
      pillName = 'Rota Circular';
    }

    var pillColor = modalState.linhaSelecionada === 'plena' ? '#2196f3' : '';

    var faixaHtml = (modalState.linhaSelecionada === 'plena' && next && next.faixa)
      ? '<div class="next-bus-faixa" title="Intervalo aproximado dos registros; não é garantia">&#8776; ' + escapeHtml(next.faixa.label) + '</div>'
      : '';

    el.innerHTML =
      '<div class="next-bus-card"' + (pillColor ? ' style="background:' + pillColor + '"' : '') + '>' +
        '<div class="next-bus-left">' +
          '<span class="next-bus-label">' + 'Próximo horário previsto' + '</span>' +
          '<div class="next-bus-main">' +
            '<i class="ti ti-bus"></i>' +
            '<span class="next-bus-time">' + escapeHtml(nextLabel) + '</span>' +
          '</div>' +
          faixaHtml +
        '</div>' +
        '<div class="next-bus-pill">' +
          '<span class="next-bus-pill-name">' + escapeHtml(pillName) + '</span>' +
        '</div>' +
      '</div>' + '<p class="circular-notice">' + escapeHtml(CircularUI.aviso) + '</p>';
  }

  function renderInfoRow(data) {
    var el = modalEl.querySelector('#modalInfoRow');
    var ponto = data.ponto;
    var dText = data.distancia != null ? formatDistance(data.distancia) : 'Distância indisponível';

    var html = '';
    if (dText) {
      html += '<div class="info-col-card"><i class="ti ti-north-star"></i><div><p class="info-col-label">Dist&acirc;ncia</p><p class="info-col-value">' + escapeHtml(dText) + '</p></div></div>';
    }
    html += '<div class="info-col-card"><i class="ti ti-home"></i><div><p class="info-col-label">Bairro</p><p class="info-col-value">' + escapeHtml(ponto.bairro || '—') + '</p></div></div>';
    el.innerHTML = html;
    var help = modalEl.querySelector('#modalLocationHelp');
    help.innerHTML = data.userPosition ? '' : '<span>Ative sua localização para ver a distância até este ponto.</span>' +
      (context.requestLocation ? '<button type="button" id="modalRetryLocation">Tentar novamente</button>' : '');
    var retry = help.querySelector('button');
    if (retry) retry.addEventListener('click', function(){
      retry.disabled = true;
      retry.textContent = 'Buscando localização…';
      context.requestLocation();
    });
  }

  function renderActions(data) {
    var el = modalEl.querySelector('#modalActions');
    var ponto = data.ponto;
    var validCoords = hasCoords(ponto);
    var routeUrl = validCoords ? 'https://www.google.com/maps/dir/?api=1&destination=' + ponto.lat + ',' + ponto.lng : null;
    if (routeUrl && data.userPosition) routeUrl += '&origin=' + data.userPosition.lat + ',' + data.userPosition.lng + '&travelmode=walking';

    el.innerHTML =
      (validCoords ? '<button class="action-btn action-btn-red" id="modalActionMap"><i class="ti ti-map"></i> Ver mapa</button>' : '') +
      (routeUrl ? '<a id="modalActionDirections" class="action-btn action-btn-outline" href="' + routeUrl + '" target="_blank" rel="noopener"><i class="ti ti-north-star"></i> ' + (data.userPosition ? 'Traçar rota' : 'Abrir no Maps') + '</a>' : '') +
      '<button class="action-btn action-btn-icon" id="modalActionShare" aria-label="Compartilhar ponto"><i class="ti ti-share"></i></button>';

    var mapBtn = modalEl.querySelector('#modalActionMap');
    if (mapBtn) {
      mapBtn.addEventListener('click', function () {
        if (validCoords && data.onMainMapFocus) data.onMainMapFocus(ponto);
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
    if (modalState.linhaSelecionada === 'circular') {
      wrap.innerHTML = '';
      return;
    }
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

    var next = data.next || computeNextForModal();
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
    modalEl.classList.toggle('show-route',tab==='percurso');
    modalEl.querySelectorAll('.modal-tab-btn').forEach(function(btn){
      var active=btn.dataset.tab===tab;
      btn.classList.toggle('active',active);
      btn.setAttribute('aria-selected',String(active));
      btn.tabIndex=active?0:-1;
    });
    el.setAttribute('aria-labelledby','modal-tab-'+tab);
    if (tab === 'horarios') {
      renderScheduleTab(el, data);
    } else {
      renderRouteTab(el, data);
    }
  }

  /* ---- Schedule Tab ---- */

  function renderScheduleTab(el, data) {
    if (modalState.linhaSelecionada === 'plena') {
      renderSchedulePlena(el, data);
    } else {
      renderScheduleCircular(el, data);
    }
  }

  function renderScheduleCircular(el, data) {
    var old = el.querySelector('details'), opened = old && old.open;
    el.innerHTML = CircularUI.schedule(data.ponto.id, getCurrentDayType(), true);
    var details = el.querySelector('details'); if (details && opened) details.open = true;
  }

    function renderSchedulePlena(el, data) {
    var html = '';

    if (modalState.sentidosPlena.length > 1) {
      html += '<div class="direction-selector">';
      modalState.sentidosPlena.forEach(function (s) {
        var cls = s.id === modalState.sentidoPlena ? 'direction-btn active' : 'direction-btn';
        html += '<button class="' + cls + '" data-sentido="' + s.id + '">' + escapeHtml(s.nome) + '</button>';
      });
      html += '</div>';
    }

    if (modalState.abasDiaPlena.length > 1) {
      html += '<div class="day-tabs">';
      modalState.abasDiaPlena.forEach(function (aba) {
        var cls = aba.id === modalState.diaTabPlena ? 'day-tab active' : 'day-tab';
        html += '<button class="' + cls + '" data-dia="' + aba.id + '">' + escapeHtml(aba.nome) + '</button>';
      });
      html += '</div>';
    }

    var horarios = obterHorariosPlena(modalState.sentidoPlena, modalState.diaTabPlena, data.ponto.id);
    var sentido = modalState.sentidosPlena.find(function (s) { return s.id === modalState.sentidoPlena; });
    var dotColor = '#2196f3';

    if (horarios.length === 0) {
      html += '<p class="tab-empty">Nenhum horário disponível para este sentido e dia.</p>';
    } else {
      var next = computeNextForModal();
      var nextTime = next ? next.time : null;
      var times = horarios.map(function (t) {
        var cls = t === nextTime ? ' modal-time-active' : '';
        return '<span class="modal-time' + cls + '">' + escapeHtml(t) + '</span>';
      }).join('');

      html +=
        '<div class="schedule-group">' +
          '<div class="schedule-line-label"><span class="schedule-dot" style="background:' + dotColor + '"></span>' +
          escapeHtml(sentido ? sentido.nome : 'Plena') +
          '</div>' +
          '<div class="modal-times-grid">' + times + '</div>' +
        '</div>';
    }

    el.innerHTML = html;

    el.querySelectorAll('.direction-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        modalState.sentidoPlena = this.getAttribute('data-sentido');
        var novasAbas = typeof obterAbasDiaPlena === 'function'
          ? obterAbasDiaPlena(modalState.sentidoPlena, data.ponto.id)
          : [];
        modalState.abasDiaPlena = novasAbas;
        if (novasAbas.length > 0 && novasAbas.every(function (a) { return a.id !== modalState.diaTabPlena; })) {
          modalState.diaTabPlena = novasAbas[0].id;
        }

        var fresh = Object.assign({}, data, { next: computeNextForModal() });
        renderNextBus(fresh);
        renderInfoRow(fresh);
        renderSchedulePlena(el, fresh);
        renderReminderState(fresh);
      });
    });

    el.querySelectorAll('.day-tab').forEach(function (btn) {
      btn.addEventListener('click', function () {
        modalState.diaTabPlena = this.getAttribute('data-dia');

        el.querySelectorAll('.day-tab').forEach(function (t) {
          t.classList.toggle('active', t.getAttribute('data-dia') === modalState.diaTabPlena);
        });

        var fresh = Object.assign({}, data, { next: computeNextForModal() });
        renderNextBus(fresh);
        renderSchedulePlena(el, fresh);
        renderReminderState(fresh);
      });
    });
  }

  function renderRouteTab(el, data) {
    if (modalState.linhaSelecionada === 'circular') {
      routeState=CircularRoute.mount(el,data,routeState,selectPoint);
      return;
    }
    var allLinePoints;
    if (modalState.linhaSelecionada === 'plena') {
      var sentido = modalState.sentidosPlena.find(function (s) { return s.id === modalState.sentidoPlena; });
      if (sentido && typeof obterPontosPlena === 'function') {
        allLinePoints = obterPontosPlena(sentido.pontos);
      } else {
        allLinePoints = [];
      }
    } else {
      allLinePoints = data.allLinePoints;
    }

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
      var lineColor = modalState.linhaSelecionada === 'plena' ? '#2196f3' : (data.lineColor || BUS_COLOR);
      parts.push(
        '<div class="route-stop">' +
          '<button type="button" data-route-point="' + p.id + '" class="' + nameClass + '"' + (isCurrent ? ' aria-current="true"' : '') + '>' + escapeHtml(p.nome) + (isCurrent ? ' <i class="ti ti-map-pin"></i>' : '') + '</button>' +
          '<div class="' + dotClass + '"' + (isCurrent ? ' style="background:' + lineColor + ';box-shadow:0 0 0 4px ' + hexToRgba(lineColor, 0.35) + '"' : '') + '></div>' +
        '</div>'
      );
      if (i < allLinePoints.length - 1) {
        parts.push('<div class="route-connector"></div>');
      }
    });
    el.innerHTML = '<div class="route-timeline-h"><div class="route-track">' + parts.join('') + '</div></div>';
    el.querySelectorAll('[data-route-point]').forEach(function(btn){btn.addEventListener('click',function(){selectPoint(btn.dataset.routePoint);var selected=el.querySelector('[aria-current]');if(selected)selected.focus({preventScroll:true});});});
  }

  function sharePoint(data) {
    var ponto = data.ponto;
    var text = [
      ponto.nome,
      ponto.endereco + ' - ' + (ponto.bairro || ''),
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
    if (!container || typeof L === 'undefined' || !hasCoords(ponto)) return;
    if (miniMap) {
      miniMap.setView([Number(ponto.lat), Number(ponto.lng)], 16, {animate:false});
      miniMarker.setLatLng([Number(ponto.lat), Number(ponto.lng)]);
      miniMarker.setTooltipContent(escapeHtml(ponto.nome));
      return;
    }
    miniMap = L.map(container, { zoomControl: true, scrollWheelZoom: true })
      .setView([Number(ponto.lat), Number(ponto.lng)], 16);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap'
    }).addTo(miniMap);
    miniMarker = L.marker([Number(ponto.lat), Number(ponto.lng)]).addTo(miniMap).bindTooltip(escapeHtml(ponto.nome));
  }

  function destroyMiniMap() {
    if (miniMap) { miniMap.remove(); miniMap = null; miniMarker = null; }
  }

  window.Modal = { init: init, open: open, close: close, refreshLocation: refreshLocation };
})();
