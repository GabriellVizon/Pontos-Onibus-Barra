const BARRA_BONITA_CENTER = [-22.4946, -48.5588];

const state = {
  pontos: [],
  pontosPlena: [],
  horarios: [],
  horariosPlena: null,
  userPosition: null,
  gpsDenied: (typeof getGpsDeniedPersisted === 'function') ? getGpsDeniedPersisted() : false,
  selectedStopId: null,
  map: null,
  markerLayer: null,
  userMarker: null,
  markers: new Map(),
  distanceCache: null,
  distanceCachePlena: null,
};

const els = {
  sidebar: document.getElementById('sidebar'),
  sidebarOverlay: document.getElementById('sidebarOverlay'),
  mobileMenuBtn: document.getElementById('mobileMenuBtn'),
  heroBtn: document.getElementById('heroBtn'),
  searchInput: document.getElementById('searchInput'),
  searchMobileBtn: document.getElementById('searchMobileBtn'),
  searchResults: document.getElementById('searchResults'),
  nearbyStops: document.getElementById('nearbyStops'),
  nearbySubtitle: document.getElementById('nearbySubtitle'),
  favStops: document.getElementById('favoriteStops'),
  favSubtitle: document.getElementById('favSubtitle'),
  userLocationText: document.getElementById('userLocationText'),
  nearestStopText: document.getElementById('nearestStopText'),
  nextDepartureText: document.getElementById('nextDepartureText'),
  mapStatusText: document.getElementById('mapStatusText'),
  selectedStopName: document.getElementById('selectedStopName'),
  selectedStopDetails: document.getElementById('selectedStopDetails'),
};

document.addEventListener('DOMContentLoaded', init);

async function init() {
  state.distanceCache = createDistanceCache(
    function () { return state.pontos; },
    function () { return state.userPosition; }
  );
  state.distanceCachePlena = createDistanceCache(
    function () { return state.pontosPlena; },
    function () { return state.userPosition; }
  );
  setupNavigation();
  setupInteractions();
  initMap();

  setupSearch();
  setupBackToTop();
  setupOfflineDetection();
  observeLocationPermission(function(){
    state.gpsDenied = true;
    clearUserLocation();
    setLocationStatus('Localização indisponível', 'Busca manual disponível', '--');
  });

  if (!loadCache()) {
    renderSkeletons(els.favStops, 3);
    renderSkeletons(els.nearbyStops, 3);
  }

  if (typeof Reminders !== 'undefined') {
    Reminders.init({
      onFire: function (reminder) {
        showToast('Lembrete: ' + reminder.stopName + ' — ônibus das ' + reminder.departure + ' em ' + reminder.minutesBefore + ' min.');
      }
    });
  }
  setInterval(refreshLiveDepartures, 30000);
  setInterval(reperguntarLocalizacao, 5 * 60 * 1000);

  var cached = loadCache();
  var modalInited = false;
  function initModalOnce() {
    if (modalInited) return;
    modalInited = true;
    Modal.init({
      resolvePoint: function(id, line){
        var source = line === 'plena' ? state.pontosPlena : state.pontos;
        return source.find(function(p){return p.id===id;});
      },
      getUserPosition: function(){return state.userPosition;},
      requestLocation: requestUserLocation,
      onPointSelected: selectStop,
      onFavToggle: function () {
        renderFavoriteStops();
        document.querySelectorAll('.fav-btn').forEach(function (btn) {
          var id = btn.getAttribute('data-id');
          if (!id) return;
          var isFav = Favorites.isFavorite(id);
          btn.classList.toggle('favorited', isFav);
          var icon = btn.querySelector('i');
          if (icon) {
            icon.classList.remove('ti-heart', 'ti-heart-filled');
            icon.classList.add(isFav ? 'ti-heart-filled' : 'ti-heart');
          }
        });
      }
    });
  }

  try {
    if (cached) {
      state.pontos = cached.pontos || [];
      state.horarios = cached.horarios || [];
      state.pontosPlena = Array.isArray(cached.pontosPlena) ? cached.pontosPlena : [];
      state.horariosPlena = cached.horariosPlena || null;
      if (typeof setPontosCircular === 'function') setPontosCircular(state.pontos);
      if (state.horariosPlena && typeof carregarConfigPlena === 'function') carregarConfigPlena(state.horariosPlena);
      if (state.distanceCache) state.distanceCache.invalidate();
      if (state.distanceCachePlena) state.distanceCachePlena.invalidate();
      initModalOnce();
      renderAll();
      hideSplash();
    }
    await carregarDados();
    if (state.distanceCache) state.distanceCache.invalidate();
    saveCache(state.pontos, state.horarios, state.pontosPlena, state.horariosPlena);
    // A Home trabalha com Circular e Plena sem remover favoritos entre linhas.
    initModalOnce();
    renderAll();
    reperguntarLocalizacao();
  } catch (error) {
    console.error(error);
    if (!cached) {
      showEmpty(els.nearbyStops, 'Não foi possível carregar os dados dos pontos.');
    }
  }
  hideSplash();
}

async function carregarDados() {
  const [pontosRes, horariosRes, plenaPontosRes, plenaHorariosRes] = await Promise.all([
    fetch('./dados/pontos.json'),
    fetch('./dados/horarios.json'),
    fetch('./dados/pontos-plena.json'),
    fetch('./dados/horarios-plena.json'),
  ]);

  if (!pontosRes.ok || !horariosRes.ok) {
    throw new Error('Falha ao buscar arquivos JSON principais');
  }

  const [pontos, horarios, pontosPlena, horariosPlena] = await Promise.all([
    pontosRes.json(),
    horariosRes.json(),
    plenaPontosRes.ok ? plenaPontosRes.json() : Promise.resolve([]),
    plenaHorariosRes.ok ? plenaHorariosRes.json() : Promise.resolve(null),
  ]);

  state.pontos = pontos;
  state.horarios = horarios;
  if (Array.isArray(pontosPlena) && pontosPlena.length) state.pontosPlena = pontosPlena;
  if (horariosPlena) state.horariosPlena = horariosPlena;
  if (typeof setPontosCircular === 'function') setPontosCircular(state.pontos);
  if (state.horariosPlena && typeof carregarConfigPlena === 'function') carregarConfigPlena(state.horariosPlena);
  if (state.distanceCachePlena) state.distanceCachePlena.invalidate();
}

function setupNavigation() {
  const openSidebar = () => {
    els.sidebar?.classList.add('open');
    els.sidebarOverlay?.classList.add('show');
    document.body.style.overflow = 'hidden';
  };

  const closeSidebar = () => {
    els.sidebar?.classList.remove('open');
    els.sidebarOverlay?.classList.remove('show');
    document.body.style.overflow = '';
  };

  els.mobileMenuBtn?.addEventListener('click', openSidebar);
  els.sidebarOverlay?.addEventListener('click', closeSidebar);

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeSidebar();
  });

  window.addEventListener('resize', () => {
    if (window.innerWidth > 768) closeSidebar();
  });

  document.querySelectorAll('.sidebar-link').forEach((link) => {
    link.addEventListener('click', (event) => {
      const href = link.getAttribute('href') || '';

      if (!href.startsWith('#')) {
        return;
      }

      event.preventDefault();
      document.querySelectorAll('.sidebar-link').forEach((item) => {
        item.classList.remove('active');
      });
      link.classList.add('active');
      document.querySelector(href)?.scrollIntoView({ behavior: 'smooth' });
      closeSidebar();
    });
  });
}

function setupInteractions() {
  els.heroBtn?.addEventListener('click', () => reperguntarLocalizacao({ scrollToNearby: true }));

  document.addEventListener('click', (event) => {
    const action = event.target.closest('[data-action]');
    const stopCard = event.target.closest('[data-stop-id]');

    if (action?.dataset.action === 'focus-map' && stopCard) {
      event.preventDefault();
      selectStop(Number(stopCard.dataset.stopId), { scrollToMap: true, line: stopCard.dataset.line || null });
      return;
    }

    const favBtn = event.target.closest('.fav-btn');
    if (favBtn) {
      event.stopPropagation();
      const id = favBtn.dataset.id;
      Favorites.toggleFavorite(id);
      const isFav = Favorites.isFavorite(id);
      favBtn.classList.toggle('favorited', isFav);
      const icon = favBtn.querySelector('i');
      if (icon) {
        icon.classList.remove('ti-heart', 'ti-heart-filled');
        icon.classList.add(isFav ? 'ti-heart-filled' : 'ti-heart');
      }
      favBtn.classList.remove('fill', 'empty');
      void favBtn.offsetWidth;
      favBtn.classList.add(isFav ? 'fill' : 'empty');
      renderFavoriteStops();
      document.querySelectorAll('.fav-btn').forEach(function (btn) {
        if (btn === favBtn) return;
        var bid = btn.getAttribute('data-id');
        if (!bid) return;
        var bFav = Favorites.isFavorite(bid);
        btn.classList.toggle('favorited', bFav);
        var bIcon = btn.querySelector('i');
        if (bIcon) {
          bIcon.classList.remove('ti-heart', 'ti-heart-filled');
          bIcon.classList.add(bFav ? 'ti-heart-filled' : 'ti-heart');
        }
      });
      return;
    }

    if (stopCard && !event.target.closest('a')) {
      cardClickEffect(stopCard, function () {
        openStopModal(Number(stopCard.dataset.stopId), stopCard.dataset.line || null);
      });
    }
  });
}

function setupSearch() {
  if (!els.searchInput || !els.searchResults ) return;

  els.searchMobileBtn?.addEventListener('click', () => {
    toggleMobileSearch(true);
    els.searchInput?.focus();
  });

  let debounceTimer;

  els.searchInput.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    const term = normalize(els.searchInput.value);
    if (!term || (state.pontos.length === 0 && state.pontosPlena.length === 0)) {
      hideSearchSuggestions();
      return;
    }
    debounceTimer = setTimeout(() => {
      renderSearchSuggestions(getSearchSuggestions(term));
    }, 200);
  });

  els.searchInput.addEventListener('focus', () => {
    const term = normalize(els.searchInput.value);
    if (state.pontos.length === 0 && state.pontosPlena.length === 0) return;
    debounceTimer = setTimeout(() => {
      if (term) {
        renderSearchSuggestions(getSearchSuggestions(term));
      } else {
        renderSearchSuggestions(getDiverseSuggestions());
      }
    }, 200);
  });

  els.searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      hideSearchSuggestions();
      els.searchInput.blur();
    }
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.search-box, #searchMobileBtn')) {
      hideSearchSuggestions();
      toggleMobileSearch(false);
    }
  });

  setupMobileSearchDismiss();

  const searchIcon = document.querySelector('#searchBox .ti-search');
  searchIcon?.addEventListener('click', (e) => {
    e.stopPropagation();
    els.searchInput?.focus();
  });
}



function getHomePointsWithLine() {
  const circular = state.pontos.map(function (p) {
    return Object.assign({}, p, { _linha: 'circular' });
  });
  const plena = state.pontosPlena.map(function (p) {
    return Object.assign({}, p, { _linha: 'plena' });
  });
  return circular.concat(plena);
}

function getHomePointsWithDistance() {
  return getHomePointsWithLine().map(function (ponto) {
    const cache = ponto._linha === 'plena' ? state.distanceCachePlena : state.distanceCache;
    const withDistance = cache ? cache.forSingle(ponto) : pontosComDistancia([ponto], state.userPosition)[0];
    return Object.assign({}, withDistance || ponto, { _linha: ponto._linha });
  });
}


window.obterPontosPlena = function (ids) {
  if (!Array.isArray(ids)) return [];
  return ids.map(function (id) {
    return state.pontosPlena.find(function (p) { return p.id === id; });
  }).filter(Boolean);
};

function getPointLine(ponto) {
  return ponto && ponto._linha === 'plena' ? 'plena' : 'circular';
}

function getPlenaPointSchedule(pontoId, dia) {
  const sentidos = typeof obterSentidosPlena === 'function' ? obterSentidosPlena(pontoId) : [];
  if (!sentidos.length) return { sentido: null, horarios: [] };
  const sentido = sentidos[0];
  const horarios = typeof obterHorariosPlena === 'function'
    ? obterHorariosPlena(sentido.id, dia || getCurrentDayType(), pontoId)
    : [];
  return { sentido: sentido, horarios: horarios };
}

function getSearchSuggestions(term) {
  const lista = getHomePointsWithDistance();
  const sortMode = state.userPosition ? 'distancia' : 'ordem';
  return sortPointsByContext(
    lista.filter((ponto) => {
      return normalize([
        ponto.nome, (ponto.apelidos || []).join(" "),
        ponto.endereco,
        ponto.bairro,
        ponto._linha === 'plena' ? 'plena' : 'circular'
      ].join(' ')).includes(term);
    }),
    sortMode
  ).slice(0, 10);
}

function getDiverseSuggestions() {
  const sorted = sortPointsByContext(getHomePointsWithDistance(), state.userPosition ? 'distancia' : 'ordem');
  const seen = new Set();
  const result = [];
  for (const ponto of sorted) {
    if (result.length >= 10) break;
    const key = getPointLine(ponto) + ':' + normalize(ponto.bairro || ponto.nome);
    if (!seen.has(key)) {
      result.push(ponto);
      seen.add(key);
    }
  }
  return result.slice(0, 10);
}

function renderSearchSuggestions(results) {
  if (results.length === 0) {
    els.searchResults.innerHTML = '<div class="search-result-empty">Nenhum ponto encontrado</div>';
    els.searchResults.classList.add('show');
    return;
  }

  els.searchResults.innerHTML = results
    .map((ponto) => {
      const line = getPointLine(ponto);
      const distanceText = ponto._linha === 'plena' && ponto.localizacaoConfirmada === false
        ? ''
        : (typeof ponto.distancia === 'number'
          ? `<span><i class="ti ti-navigation"></i> ${formatDistance(ponto.distancia)}</span>`
          : '');
      const lineTag = line === 'plena' ? '<span class="home-line-tag plena">PLENA</span>' : '';
      const address = ponto.endereco || 'Localização exata ainda não informada';
      return `
        <div class="search-result-item" style="z-index: 0;" data-stop-id="${ponto.id}" data-line="${line}">
          <div class="search-result-name">
            <i class="ti ti-map-pin"></i>${escapeHtml(ponto.nome)} ${lineTag}
          </div>
          <div class="search-result-desc">
            <span>${escapeHtml(address)}${ponto.bairro ? ' - ' + escapeHtml(ponto.bairro) : ''}</span>
            ${distanceText}
          </div>
        </div>
      `;
    })
    .join('');

  els.searchResults.classList.add('show');

  els.searchResults.querySelectorAll('.search-result-item').forEach((item) => {
    item.addEventListener('click', () => {
      const stopId = Number(item.dataset.stopId);
      openStopModal(stopId, item.dataset.line || 'circular');
      els.searchInput.value = '';
      hideSearchSuggestions();
    });
  });
}

function hideSearchSuggestions() {
  els.searchResults?.classList.remove('show');
  if (els.searchResults) els.searchResults.innerHTML = '';
}

function renderAll() {
  renderFavoriteStops();
  renderNearbyStops();
  renderMapMarkers();
}

function renderFavoriteStops() {
  if (!els.favStops) return;
  const favIds = typeof Favorites !== 'undefined' ? Favorites.getFavorites() : [];
  if (favIds.length === 0) {
    els.favStops.innerHTML = '<div class="empty-fav">Você ainda não favoritou nenhum ponto. Clique no <i class="ti ti-heart"></i> para adicionar.</div>';
    if (els.favSubtitle) els.favSubtitle.textContent = 'Nenhum favorito ainda.';
    return;
  }
  if (els.favSubtitle) els.favSubtitle.textContent = 'Seus pontos favoritos.';
  const lista = getHomePointsWithDistance();
  const favPontos = sortPointsByContext(
    lista.filter(function (p) { return favIds.indexOf(String(p.id)) !== -1; }),
    state.userPosition ? 'distancia' : 'ordem'
  );
  if (!favPontos.length) {
    els.favStops.innerHTML = '<div class="empty-fav">Seus favoritos salvos não estão disponíveis nos dados atuais.</div>';
    return;
  }
  els.favStops.innerHTML = favPontos.map(function (p) { return renderStopCard(p); }).join('');
}

function renderNearbyStops() {
  if (!els.nearbyStops) return;

  if (!state.userPosition) {
    var msg = state.gpsDenied
      ? gpsDeniedHelp()
      : 'Permita o acesso à localização para ver os 3 pontos mais próximos de você.';
    showEmpty(els.nearbyStops, msg);
    if (els.nearbySubtitle) {
      els.nearbySubtitle.textContent = 'A busca e o mapa continuam disponíveis mesmo sem GPS.';
    }
    return;
  }

  const nearby = getHomePointsWithDistance()
    .filter((ponto) => hasCoords(ponto) && typeof ponto.distancia === 'number' && !(getPointLine(ponto) === 'plena' && ponto.localizacaoConfirmada === false))
    .sort((a, b) => a.distancia - b.distancia)
    .slice(0, 3);

  if (els.nearbySubtitle) {
    els.nearbySubtitle.textContent = 'Os 3 pontos mais próximos entre Circular e Plena.';
  }

  els.nearbyStops.innerHTML = nearby
    .map((ponto) => renderStopCard(ponto))
    .join('');
}

function renderStopCard(ponto) {
  const line = getPointLine(ponto);
  let nextInfo;
  let scheduleTimes = [];
  let activeTime = null;

  if (line === 'plena') {
    const plenaNext = typeof encontrarProximoPlena === 'function'
      ? encontrarProximoPlena(ponto.id)
      : { encontrado: false };
    nextInfo = plenaNext.encontrado
      ? {
          encontrado: true,
          horario: plenaNext.horario,
          label: plenaNext.estado === 'chegando' ? 'Previsto agora' : formatMinutes(plenaNext.minutosRestantes, plenaNext.horario),
          situacao: plenaNext.estado === 'chegando' ? 'no_ponto' : 'referencia'
        }
      : { encontrado: false, mensagem: 'Sem horário' };
    const plenaSchedule = getPlenaPointSchedule(ponto.id);
    scheduleTimes = plenaSchedule.horarios.slice();
    activeTime = plenaNext.encontrado ? plenaNext.horario : null;
  } else {
    nextInfo = encontrarPassagens(ponto.id);
    const agora = new Date();
    const agoraHoje = agora.getHours() * 60 + agora.getMinutes();
    scheduleTimes = calcularPassagensDoPonto(ponto.id)
      .filter(function (p) { return p.embarque && p.minutosFim >= agoraHoje; })
      .map(function (p) { return p.horario; });
    activeTime = nextInfo.encontrado ? nextInfo.horario : null;
  }

  const distanceText = line === 'plena' && ponto.localizacaoConfirmada === false
    ? 'Local aproximado'
    : (typeof ponto.distancia === 'number'
      ? formatDistance(ponto.distancia)
      : hasCoords(ponto) ? 'No mapa' : 'Sem GPS');
  const selected = state.selectedStopId === ponto.id ? 'selected' : '';
  const mapDisabled = hasCoords(ponto) ? '' : 'disabled';
  const routeUrl = hasCoords(ponto)
    ? `https://www.google.com/maps/dir/?api=1&destination=${ponto.lat},${ponto.lng}`
    : '';
  const isFav = typeof Favorites !== 'undefined' && Favorites.isFavorite(String(ponto.id));
  const nextClass = nextInfo.encontrado
    ? (nextInfo.situacao === 'no_ponto' ? 'now' : 'waiting')
    : 'waiting';
  const nextTimeText = nextInfo.encontrado
    ? nextInfo.label
    : (nextInfo.mensagem || 'Sem horário');
  const chipsVisiveis = scheduleTimes.slice(0, 4);
  const chipsExtras = Math.max(0, scheduleTimes.length - 4);
  const addressText = ponto.endereco || 'Localização exata ainda não informada';
  const lineTag = line === 'plena' ? '<span class="home-line-tag plena">PLENA</span>' : '';
  const locationNote = line === 'plena' && ponto.localizacaoConfirmada === false
    ? '<span class="location-pending"><i class="ti ti-alert-circle"></i> Localização exata a confirmar</span>'
    : '';

  return `
    <div class="card stop-card ${selected} ${line === 'plena' ? 'plena-card' : ''}" data-stop-id="${ponto.id}" data-line="${line}">
      <div class="card-header">
        <div class="card-icon">
          <i class="ti ti-map-pin"></i>
        </div>
        <div class="card-header-right">
          <span class="card-distance">${escapeHtml(distanceText)}</span>
          <button class="fav-btn ${isFav ? 'favorited' : ''}" data-id="${ponto.id}" aria-label="${isFav ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}">
            <i class="ti ti-${isFav ? 'heart-filled' : 'heart'}"></i>
          </button>
        </div>
      </div>
      <div class="home-card-title-row">
        <h3 class="card-title">${escapeHtml(ponto.nome)}</h3>
        ${lineTag}
      </div>
      <p class="card-address">${escapeHtml(addressText)}</p>
      ${locationNote}
      <div class="card-next-bus">
        <span class="card-next-label"><i class="ti ti-bus"></i> Próximo horário</span>
        <span class="card-next-time ${nextClass}">${escapeHtml(nextTimeText)}</span>
      </div>
      <div class="card-meta">
        <span class="meta-chip">${escapeHtml(ponto.bairro || 'Local não informado')}</span>
      </div>
      <div class="card-horarios">
        ${chipsVisiveis
          .map((time) => `
            <span class="time-chip ${activeTime && time === activeTime ? 'active' : 'inactive'}">${escapeHtml(time)}</span>
          `)
          .join('')}
        ${chipsExtras > 0 ? `<span class="time-chip more-chip">+${chipsExtras}</span>` : ''}
      </div>
      <div class="card-actions">
        <button class="card-action" type="button" data-action="focus-map" ${mapDisabled}>
          <i class="ti ti-map"></i> Ver mapa
        </button>
        ${routeUrl
          ? `<a class="card-action" href="${routeUrl}" target="_blank" rel="noopener">
              <i class="ti ti-route"></i> ${line === 'plena' && ponto.localizacaoConfirmada === false ? 'Abrir referência' : 'Traçar rota'}
            </a>`
          : `<button class="card-action" type="button" disabled>
              <i class="ti ti-route-off"></i> Sem rota
            </button>`}
      </div>
    </div>
  `;
}

function initMap() {
  if (!document.getElementById('map') || typeof L === 'undefined') {
    if (els.mapStatusText) els.mapStatusText.textContent = 'Mapa indisponível';
    return;
  }

  state.map = L.map('map', {
    zoomControl: true,
    scrollWheelZoom: true,
  }).setView(BARRA_BONITA_CENTER, 13);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap',
  }).addTo(state.map);

  state.markerLayer = L.layerGroup().addTo(state.map);
}

function createLineMarker(lat, lng, color) {
  const svg = [
    '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="36" viewBox="0 0 24 36">',
    '<path d="M12 0C5.4 0 0 5.4 0 12c0 9 12 24 12 24s12-15 12-24c0-6.6-5.4-12-12-12z" fill="' + (color || BUS_COLOR) + '"/>',
    '<circle cx="12" cy="12" r="4.5" fill="#fff"/>',
    '</svg>'
  ].join('');
  return L.marker([lat, lng], {
    icon: L.icon({
      iconUrl: 'data:image/svg+xml,' + encodeURIComponent(svg),
      iconSize: [24, 36],
      iconAnchor: [12, 36],
      popupAnchor: [0, -36]
    })
  });
}

function enableMarkerKeyboard(marker, ponto, onActivate) {
  marker.on('add', function () {
    const el = marker.getElement();
    if (!el) return;
    el.setAttribute('role', 'button');
    el.setAttribute('tabindex', '0');
    el.setAttribute('aria-label', ponto.nome + ' - ' + ponto.endereco);
    el.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onActivate(ponto);
      }
    });
  });
}

function renderMapMarkers() {
  if (!state.map || !state.markerLayer) return;

  state.markerLayer.clearLayers();
  state.markers.clear();

  const points = getHomePointsWithLine().filter(hasCoords);
  points.forEach((ponto) => {
    const line = getPointLine(ponto);
    const color = line === 'plena' ? '#2196f3' : BUS_COLOR;
    const lineName = line === 'plena' ? 'Plena' : 'Circular';
    const locationWarning = line === 'plena' && ponto.localizacaoConfirmada === false
      ? '<br><small>Referência aproximada; localização exata ainda não confirmada.</small>'
      : '';
    const marker = createLineMarker(ponto.lat, ponto.lng, color)
      .bindPopup(`
        <strong>${escapeHtml(ponto.nome)}</strong><br>
        <span>${escapeHtml(lineName)}</span><br>
        ${escapeHtml(ponto.endereco || 'Localização exata ainda não informada')}<br>
        ${escapeHtml(ponto.bairro || '')}${locationWarning}
      `)
      .on('click', function () { openStopModal(ponto.id, line); });

    enableMarkerKeyboard(marker, ponto, function () { openStopModal(ponto.id, line); });
    marker.addTo(state.markerLayer);
    state.markers.set(String(ponto.id), marker);
  });

  if (els.mapStatusText) {
    const plenaCount = points.filter(function (p) { return getPointLine(p) === 'plena'; }).length;
    const circularCount = points.length - plenaCount;
    els.mapStatusText.textContent = circularCount + ' Circular · ' + plenaCount + ' Plena';
  }
}

function reperguntarLocalizacao(options = {}) {
  if (state.userPosition) return;

  shouldRequestLocation().then(function (podePedir) {
    if (podePedir) {
      requestUserLocation(options);
      return;
    }
    // Navegador persistiu a recusa: mantém o estado e o banner sem chamada inútil.
    clearUserLocation();
    state.gpsDenied = true;
    if (typeof setGpsDeniedPersisted === 'function') setGpsDeniedPersisted(true);
    setLocationStatus('Permissão negada', 'Libere pelo cadeado e tente novamente', '--');
    renderNearbyStops();
  });
}

function clearUserLocation() {
  state.userPosition = null;
  if (state.userMarker) { state.userMarker.remove(); state.userMarker = null; }
  if (state.distanceCache) state.distanceCache.invalidate();
  if (state.distanceCachePlena) state.distanceCachePlena.invalidate();
  renderNearbyStops();
  renderFavoriteStops();
  if (typeof Modal !== 'undefined') Modal.refreshLocation();
}

function requestUserLocation(options = {}) {
  if (!navigator.geolocation) {
    clearUserLocation();
    setLocationStatus('GPS indisponível', 'Use a busca manual', '--');
    renderNearbyStops();
    return;
  }

  setLocationStatus('Pedindo permissão...', 'Calculando ponto próximo', '--');

  navigator.geolocation.getCurrentPosition(
    (position) => {
      state.userPosition = {
        lat: position.coords.latitude,
        lng: position.coords.longitude,
      };
      state.gpsDenied = false;
      if (typeof setGpsDeniedPersisted === 'function') setGpsDeniedPersisted(false);
      if (state.distanceCache) state.distanceCache.invalidate();
      if (state.distanceCachePlena) state.distanceCachePlena.invalidate();

      setLocationStatus('Localização detectada', 'Calculando...', '--');
      renderNearbyStops();
      updateUserMarker();
      updateLocationSummary();
      renderFavoriteStops();
      Modal.refreshLocation();

      if (options.scrollToNearby) {
        document.getElementById('pontos')?.scrollIntoView({ behavior: 'smooth' });
      }
    },
    (error) => {
      clearUserLocation();
      if (state.distanceCache) state.distanceCache.invalidate();
      if (state.distanceCachePlena) state.distanceCachePlena.invalidate();
      state.gpsDenied = error.code === error.PERMISSION_DENIED;
      if (typeof setGpsDeniedPersisted === 'function') setGpsDeniedPersisted(state.gpsDenied);
      const message = state.gpsDenied
        ? 'Permissão negada'
        : 'Não foi possível localizar';
      setLocationStatus(message, 'Busca manual disponível', '--');
      renderNearbyStops();
    },
    {
      enableHighAccuracy: true,
      timeout: 12000,
      maximumAge: 60000,
    },
  );
}

function updateUserMarker() {
  if (!state.map || !state.userPosition) return;

  const latLng = [state.userPosition.lat, state.userPosition.lng];
  if (state.userMarker) {
    state.userMarker.setLatLng(latLng);
    return;
  }

  state.userMarker = L.marker(latLng, {
    icon: L.icon({
      iconUrl: 'img/do-utilizador.png',
      iconSize: [24, 24],
      iconAnchor: [12, 12],
      popupAnchor: [0, -14],
    }),
    zIndexOffset: 1000,
    title: 'Sua localização',
  }).addTo(state.map).bindPopup('<strong>Sua localização</strong>');
}

function updateLocationSummary() {
  if (!state.userPosition) return;

  const nearest = getHomePointsWithDistance()
    .filter(function (p) {
      return hasCoords(p) && typeof p.distancia === 'number' && !(getPointLine(p) === 'plena' && p.localizacaoConfirmada === false);
    })
    .sort((a, b) => a.distancia - b.distancia)[0];

  if (!nearest) {
    setLocationStatus('Localização detectada', 'Nenhum ponto com GPS', '--');
    return;
  }

  const line = getPointLine(nearest);
  let nextTime = '--';
  if (line === 'plena') {
    const pass = encontrarProximoPlena(nearest.id);
    nextTime = pass.encontrado ? pass.horario : 'Sem horário';
  } else {
    const pass = encontrarPassagens(nearest.id);
    nextTime = pass.encontrado ? pass.label : (pass.mensagem ? pass.mensagem : '--');
  }
  setLocationStatus(
    'Localização detectada',
    `${nearest.nome} (${formatDistance(nearest.distancia)})`,
    nextTime,
  );

  if (!state.selectedStopId) {
    selectStop(nearest.id, { line: line });
  }
}

function openStopModal(stopId, line) {
  let resolvedLine = line;
  let ponto = null;
  if (resolvedLine === 'plena') ponto = state.pontosPlena.find(function (p) { return p.id === stopId; });
  if (!ponto && resolvedLine === 'circular') ponto = state.pontos.find(function (p) { return p.id === stopId; });
  if (!ponto) {
    ponto = state.pontos.find(function (p) { return p.id === stopId; });
    resolvedLine = ponto ? 'circular' : 'plena';
  }
  if (!ponto) ponto = state.pontosPlena.find(function (p) { return p.id === stopId; });
  if (!ponto) return;

  let next;
  let horarios = [];
  if (resolvedLine === 'plena') {
    const pass = encontrarProximoPlena(ponto.id);
    next = pass.encontrado
      ? { time: pass.horario, label: formatMinutes(pass.minutosRestantes, pass.horario), minutes: pass.minutosRestantes }
      : { time: '--', label: 'Sem horário', minutes: Number.POSITIVE_INFINITY };
  } else {
    const pass = encontrarPassagens(ponto.id);
    next = pass.encontrado
      ? { time: pass.horario, label: pass.label, minutes: pass.minutos, faixa: pass.faixa, situacao: pass.situacao, aviso: pass.aviso, tipo: pass.tipo }
      : { time: '--', label: pass.mensagem || 'Sem horário', minutes: Number.POSITIVE_INFINITY, faixa: null, situacao: pass.situacao };
    horarios = obterHorariosDoPonto(ponto.id);
  }

  const isFav = typeof Favorites !== 'undefined' && Favorites.isFavorite(String(ponto.id));
  let distancia = null;
  if (state.userPosition && hasCoords(ponto) && !(resolvedLine === 'plena' && ponto.localizacaoConfirmada === false)) {
    distancia = distanceKm(state.userPosition.lat, state.userPosition.lng, ponto.lat, ponto.lng);
  }

  const allLinePoints = (resolvedLine === 'plena' ? state.pontosPlena : state.pontos)
    .slice().sort(function (a, b) { return (a.ordem || 0) - (b.ordem || 0); });

  Modal.open({
    ponto: ponto,
    linhas: [resolvedLine],
    next: next,
    horarios: horarios,
    lineColor: resolvedLine === 'plena' ? '#2196f3' : BUS_COLOR,
    distancia: distancia,
    isFav: isFav,
    allLinePoints: allLinePoints,
    onMainMapFocus: function (p) {
      if (hasCoords(p) && state.map) {
        state.map.setView([p.lat, p.lng], 16, { animate: true });
        var marker = state.markers.get(String(p.id));
        if (marker) marker.openPopup();
      }
      document.getElementById('mapa')?.scrollIntoView({ behavior: 'smooth' });
    }
  });

  selectStop(stopId, { line: resolvedLine });
}

function selectStop(stopId, options = {}) {
  let line = options.line || null;
  let ponto = line === 'plena'
    ? state.pontosPlena.find((item) => item.id === stopId)
    : state.pontos.find((item) => item.id === stopId);
  if (!ponto && !line) {
    ponto = state.pontos.find((item) => item.id === stopId);
    line = ponto ? 'circular' : 'plena';
    if (!ponto) ponto = state.pontosPlena.find((item) => item.id === stopId);
  }
  if (!ponto) return;

  state.selectedStopId = stopId;
  let nextText;
  if (line === 'plena') {
    const next = encontrarProximoPlena(stopId);
    nextText = next.encontrado ? `próximo horário ${next.horario}` : 'sem horário disponível';
  } else {
    const next = encontrarPassagens(stopId);
    nextText = next.encontrado ? `previsão ${next.label}` : (next.mensagem || 'sem referência disponível');
  }

  document.querySelectorAll('[data-stop-id]').forEach((card) => {
    card.classList.toggle('selected', Number(card.dataset.stopId) === stopId && (!card.dataset.line || card.dataset.line === line));
  });

  if (els.selectedStopName) els.selectedStopName.textContent = ponto.nome + (line === 'plena' ? ' · Plena' : '');
  if (els.selectedStopDetails) {
    const address = ponto.endereco || 'Localização exata ainda não informada';
    const pending = line === 'plena' && ponto.localizacaoConfirmada === false ? ' · referência aproximada' : '';
    els.selectedStopDetails.textContent = hasCoords(ponto)
      ? `${address} - ${nextText}${pending}`
      : `${address} - sem coordenadas cadastradas.`;
  }

  if (hasCoords(ponto) && state.map) {
    state.map.setView([ponto.lat, ponto.lng], 16, { animate: true });
    state.markers.get(String(ponto.id))?.openPopup();
  }

  if (options.scrollToMap) {
    document.getElementById('mapa')?.scrollIntoView({ behavior: 'smooth' });
  }
}

function setLocationStatus(location, nearest, departure) {
  if (els.userLocationText) els.userLocationText.textContent = location;
  if (els.nearestStopText) els.nearestStopText.textContent = nearest;
  if (els.nextDepartureText) els.nextDepartureText.textContent = departure;
}

function refreshLiveDepartures() {
  updateLocationSummary();

  document.querySelectorAll('.stop-card').forEach((card) => {
    const stopId = Number(card.dataset.stopId);
    const line = card.dataset.line || 'circular';
    const timeEl = card.querySelector('.card-next-time');
    const chipsWrap = card.querySelector('.card-horarios');

    if (line === 'plena') {
      const pass = typeof encontrarProximoPlena === 'function'
        ? encontrarProximoPlena(stopId)
        : { encontrado: false };
      if (timeEl) {
        timeEl.classList.remove('now', 'waiting');
        if (!pass.encontrado) {
          timeEl.textContent = 'Sem horário';
          timeEl.classList.add('waiting');
        } else {
          timeEl.textContent = pass.estado === 'chegando'
            ? 'Previsto agora'
            : formatMinutes(pass.minutosRestantes, pass.horario);
          timeEl.classList.add(pass.estado === 'chegando' ? 'now' : 'waiting');
        }
      }
      if (chipsWrap) {
        const schedule = getPlenaPointSchedule(stopId);
        const nextTime = pass.encontrado ? pass.horario : null;
        const now = new Date();
        const minute = now.getHours() * 60 + now.getMinutes();
        const future = schedule.horarios.filter(function (t) { return timeToMinutes(t) >= minute; });
        const visible = future.slice(0, 4);
        const extra = Math.max(0, future.length - visible.length);
        chipsWrap.innerHTML = visible.map(function (t) {
          return '<span class="time-chip ' + (t === nextTime ? 'active' : 'inactive') + '">' + escapeHtml(t) + '</span>';
        }).join('') + (extra ? '<span class="time-chip more-chip">+' + extra + '</span>' : '');
      }
      return;
    }

    if (typeof encontrarPassagens !== 'function') return;
    const pass = encontrarPassagens(stopId);
    if (timeEl) {
      timeEl.classList.remove('now', 'waiting');
      if (!pass.encontrado) {
        timeEl.textContent = pass.mensagem || 'Sem horário';
        timeEl.classList.add('waiting');
      } else {
        timeEl.textContent = pass.label;
        timeEl.classList.add(pass.situacao === 'no_ponto' ? 'now' : 'waiting');
        timeEl.title = pass.faixa ? 'Previsto entre ' + pass.faixa.label : '';
      }
    }

    if (chipsWrap) {
      const now = new Date();
      const minuto = now.getHours() * 60 + now.getMinutes();
      const future = calcularPassagensDoPonto(stopId).filter(function (p) { return p.embarque && p.minutosFim >= minuto; });
      const visible = future.slice(0, 4);
      const extra = Math.max(0, future.length - visible.length);
      chipsWrap.innerHTML = visible.map(function (p) {
        const active = pass.encontrado && p.horario === pass.horario;
        return '<span class="time-chip ' + (active ? 'active' : 'inactive') + '">' + escapeHtml(rotuloPassagemCircular(p)) + '</span>';
      }).join('') + (extra ? '<span class="time-chip more-chip">+' + extra + '</span>' : '');
    }
  });

  if (state.selectedStopId && els.selectedStopDetails) {
    let ponto = state.pontos.find(function (p) { return p.id === state.selectedStopId; });
    let line = 'circular';
    if (!ponto) {
      ponto = state.pontosPlena.find(function (p) { return p.id === state.selectedStopId; });
      line = 'plena';
    }
    if (ponto) {
      const address = ponto.endereco || 'Localização exata ainda não informada';
      if (line === 'plena') {
        const pass = encontrarProximoPlena(ponto.id);
        const next = pass.encontrado ? 'próximo horário ' + pass.horario : 'sem horário disponível';
        const pending = ponto.localizacaoConfirmada === false ? ' · referência aproximada' : '';
        els.selectedStopDetails.textContent = address + ' - ' + next + pending;
      } else {
        const pass = encontrarPassagens(ponto.id);
        els.selectedStopDetails.textContent = pass.encontrado
          ? address + ' - previsão ' + pass.label
          : address + ' - ' + (pass.mensagem || 'sem referência disponível');
      }
    }
  }
}

