const BARRA_BONITA_CENTER = [-22.4946, -48.5588];

const state = {
  pontos: [],
  linhas: [],
  horarios: [],
  userPosition: null,
  selectedStopId: null,
  map: null,
  markerLayer: null,
  userMarker: null,
  markers: new Map(),
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
  linesGrid: document.getElementById('linesGrid'),
  userLocationText: document.getElementById('userLocationText'),
  nearestStopText: document.getElementById('nearestStopText'),
  nextDepartureText: document.getElementById('nextDepartureText'),
  mapStatusText: document.getElementById('mapStatusText'),
  selectedStopName: document.getElementById('selectedStopName'),
  selectedStopDetails: document.getElementById('selectedStopDetails'),
};

document.addEventListener('DOMContentLoaded', init);

async function init() {
  setupNavigation();
  setupInteractions();
  initMap();

  setupSearch();
  setupBackToTop();
  setupOfflineDetection();

  var cached = loadCache();
  var modalInited = false;
  function initModalOnce() {
    if (modalInited) return;
    modalInited = true;
    Modal.init({
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
      state.pontos = cached.pontos;
      state.linhas = cached.linhas;
      state.horarios = cached.horarios;
      initModalOnce();
      renderAll();
      hideSplash();
    }
    await carregarDados();
    saveCache(state.pontos, state.linhas, state.horarios);
    initModalOnce();
    renderAll();
    requestUserLocation();
  } catch (error) {
    console.error(error);
    if (!cached) {
      showEmpty(els.nearbyStops, 'Não foi possível carregar os dados dos pontos.');
    }
  }
  hideSplash();
}

async function carregarDados() {
  const [pontosRes, linhasRes, horariosRes] = await Promise.all([
    fetch('./dados/pontos.json'),
    fetch('./dados/linhas.json'),
    fetch('./dados/horarios.json'),
  ]);

  if (!pontosRes.ok || !linhasRes.ok || !horariosRes.ok) {
    throw new Error('Falha ao buscar arquivos JSON');
  }

  const [pontos, linhas, horarios] = await Promise.all([
    pontosRes.json(),
    linhasRes.json(),
    horariosRes.json(),
  ]);

  state.pontos = pontos;
  state.linhas = linhas;
  state.horarios = horarios;
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
  els.heroBtn?.addEventListener('click', () => requestUserLocation({ scrollToNearby: true }));

  document.addEventListener('click', (event) => {
    const action = event.target.closest('[data-action]');
    const stopCard = event.target.closest('[data-stop-id]');
    const lineCard = event.target.closest('[data-line-id]');

    if (action?.dataset.action === 'focus-map' && stopCard) {
      event.preventDefault();
      selectStop(Number(stopCard.dataset.stopId), { scrollToMap: true });
      return;
    }

    if (action?.dataset.action === 'filter-line' && lineCard) {
      event.preventDefault();
      window.location.href = `pontos.html?linha=${lineCard.dataset.lineId}`;
      return;
    }

    if (action?.dataset.action === 'focus-line' && lineCard) {
      event.preventDefault();
      focusLine(Number(lineCard.dataset.lineId));
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
        openStopModal(Number(stopCard.dataset.stopId));
      });
    }
  });
}

function setupSearch() {
  if (!els.searchInput || !els.searchResults) return;

  els.searchMobileBtn?.addEventListener('click', () => {
    document.getElementById('searchBox')?.classList.toggle('mobile-open');
    els.searchInput?.focus();
  });

  let debounceTimer;

  els.searchInput.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    const term = normalize(els.searchInput.value);
    if (!term || state.pontos.length === 0) {
      hideSearchSuggestions();
      return;
    }
    debounceTimer = setTimeout(() => {
      renderSearchSuggestions(getSearchSuggestions(term));
    }, 200);
  });

  els.searchInput.addEventListener('focus', () => {
    const term = normalize(els.searchInput.value);
    if (state.pontos.length === 0) return;
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
    if (!e.target.closest('.search-box')) {
      hideSearchSuggestions();
    }
  });
}

function getSearchSuggestions(term) {
  const lista = pontosComDistancia(state.pontos, state.userPosition);
  return lista
    .filter((ponto) => {
      const linha = getLinha(ponto.linhaId, state.linhas);
      return normalize([
        ponto.nome,
        ponto.endereco,
        ponto.bairro,
        linha?.nome || '',
        linha?.titulo || '',
      ].join(' ')).includes(term);
    })
    .slice(0, 10);
}

function getDiverseSuggestions() {
  const lista = pontosComDistancia(state.pontos, state.userPosition);
  const seenBairros = new Set();
  const seenLinhas = new Set();
  const result = [];
  for (const ponto of lista) {
    if (result.length >= 10) break;
    const linha = getLinha(ponto.linhaId, state.linhas);
    const bairroKey = normalize(ponto.bairro);
    const linhaKey = linha ? linha.id : 0;
    const isNewBairro = !seenBairros.has(bairroKey);
    const isNewLinha = !seenLinhas.has(linhaKey);
    if (isNewBairro || isNewLinha) {
      result.push(ponto);
      seenBairros.add(bairroKey);
      seenLinhas.add(linhaKey);
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
      const linha = getLinha(ponto.linhaId, state.linhas);
      const distanceText = typeof ponto.distancia === 'number'
        ? `<span><i class="ti ti-navigation"></i> ${formatDistance(ponto.distancia)}</span>`
        : '';
      return `
        <div class="search-result-item" style="z-index: 0;" data-stop-id="${ponto.id}">
          <div class="search-result-name">
            <i class="ti ti-map-pin"></i>${escapeHtml(ponto.nome)}
          </div>
          <div class="search-result-desc">
            <span>${escapeHtml(ponto.endereco)} - ${escapeHtml(ponto.bairro)}</span>
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
      openStopModal(stopId);
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
  renderLines();
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
  const lista = state.userPosition ? pontosComDistancia(state.pontos, state.userPosition) : state.pontos;
  const favPontos = lista.filter(function (p) { return favIds.indexOf(String(p.id)) !== -1; });
  els.favStops.innerHTML = favPontos.map(function (p) { return renderStopCard(p, { compact: true }); }).join('');
}

function renderNearbyStops() {
  if (!els.nearbyStops) return;

  if (!state.userPosition) {
    showEmpty(els.nearbyStops, 'Permita o acesso à localização para ver os 3 pontos mais próximos de você.');
    if (els.nearbySubtitle) {
      els.nearbySubtitle.textContent = 'A busca e a lista completa continuam disponíveis abaixo.';
    }
    return;
  }

  const nearby = pontosComDistancia(state.pontos, state.userPosition)
    .filter((ponto) => hasCoords(ponto))
    .sort((a, b) => a.distancia - b.distancia)
    .slice(0, 3);

  if (els.nearbySubtitle) {
    els.nearbySubtitle.textContent = 'Os 3 pontos mais próximos da sua localização atual.';
  }

  els.nearbyStops.innerHTML = nearby
    .map((ponto) => renderStopCard(ponto, { compact: true }))
    .join('');
}

function renderLines() {
  if (!els.linesGrid) return;

  els.linesGrid.innerHTML = state.linhas
    .map((linha) => {
      const pontosLinha = state.pontos
        .filter((ponto) => ponto.linhaId === linha.id)
        .sort((a, b) => a.ordem - b.ordem);
      const horariosLinha = getHorario(linha.id, state.horarios, getCurrentDayType());
      const next = getNextDeparture(linha.id, state.horarios);
      const primeiroPonto = pontosLinha[0]?.nome || 'Ponto inicial não informado';
      const ultimoPonto = pontosLinha[pontosLinha.length - 1]?.nome || 'Ponto final não informado';

      return `
        <div class="line-card" data-line-id="${linha.id}">
          <div class="line-card-header">
            <div class="line-card-title-group">
              <div class="line-dot" style="background:${escapeAttr(linha.cor)}"></div>
              <span class="line-card-title">${escapeHtml(linha.nome)}</span>
            </div>
            <button class="card-action" type="button" data-action="focus-line" aria-label="Ver linha no mapa">
              <i class="ti ti-map"></i>
            </button>
          </div>
          <p class="line-card-route">${escapeHtml(linha.titulo)}</p>
          <span class="line-card-schedule-label">Tabela de horários</span>
          <div class="line-card-times">
            ${horariosLinha
              .map((horario) => `
                <span class="time-chip ${horario === next.time ? 'active' : 'inactive'}">${escapeHtml(horario)}</span>
              `)
              .join('')}
          </div>
          <div class="line-card-progress">
            <div class="progress-item">
              <div class="progress-dot active"></div>
              <span class="progress-text"><strong>${pontosLinha.length} pontos:</strong> ${escapeHtml(primeiroPonto)}</span>
            </div>
            <div class="progress-item">
              <div class="progress-dot next"></div>
              <span class="progress-text">Final: ${escapeHtml(ultimoPonto)}</span>
            </div>
            <div class="progress-item">
              <div class="progress-dot next"></div>
              <span class="progress-text">Próxima saída: ${escapeHtml(next.label)}</span>
            </div>
          </div>
          <div class="line-card-footer">
            <span data-action="filter-line">VER PONTOS DA LINHA</span>
          </div>
        </div>
      `;
    })
    .join('');
}

function renderStopCard(ponto, options = {}) {
  const linha = getLinha(ponto.linhaId, state.linhas);
  const next = getNextDeparture(ponto.linhaId, state.horarios);
  const horariosLinha = getHorario(ponto.linhaId, state.horarios, getCurrentDayType());
  const lineColors = getPointLineColors(ponto, state.pontos, state.linhas);
  const dotBackground = getMixedBackground(lineColors);
  const distanceText = typeof ponto.distancia === 'number'
    ? formatDistance(ponto.distancia)
    : hasCoords(ponto)
      ? 'No mapa'
      : 'Sem GPS';
  const selected = state.selectedStopId === ponto.id ? 'selected' : '';
  const mapDisabled = hasCoords(ponto) ? '' : 'disabled';
  const routeUrl = hasCoords(ponto)
    ? `https://www.google.com/maps/dir/?api=1&destination=${ponto.lat},${ponto.lng}`
    : '';
  const isFav = typeof Favorites !== 'undefined' && Favorites.isFavorite(String(ponto.id));
  const nextClass = next.minutes <= 5 ? 'now' : 'waiting';

  return `
    <div class="card stop-card ${selected}" data-stop-id="${ponto.id}">
      <div class="card-header">
        <div class="card-icon">
          <i class="ti ti-map-pin"></i>
        </div>
        <div class="card-header-right">
          <span class="card-distance">${escapeHtml(distanceText)}</span>
          <button class="fav-btn ${isFav ? 'favorited' : ''}" data-id="${ponto.id}" aria-label="Favoritar">
            <i class="ti ti-${isFav ? 'heart-filled' : 'heart'}"></i>
          </button>
        </div>
      </div>
      <h3 class="card-title">${escapeHtml(ponto.nome)}</h3>
      <p class="card-address">${escapeHtml(ponto.endereco)}</p>
      <div class="card-next-bus">
        <span class="card-next-label"><i class="ti ti-bus"></i> Próximo ônibus</span>
        <span class="card-next-time ${nextClass}">${escapeHtml(next.label)}</span>
      </div>
      <div class="card-meta">
        <span class="meta-chip">${escapeHtml(ponto.bairro)}</span>
        <span class="meta-chip line-meta-chip"><span class="chip-dot" style="background:${escapeAttr(dotBackground)}"></span>${escapeHtml(linha?.nome || 'Linha não informada')}</span>
        <span class="meta-chip">Ordem ${escapeHtml(String(ponto.ordem))}</span>
      </div>
      <div class="card-line">
        <span class="card-line-name">${escapeHtml(linha?.titulo || 'Rota não informada')}</span>
        <span class="card-line-time waiting">${horariosLinha.length} horários</span>
      </div>
      <div class="card-horarios">
        ${horariosLinha
          .map((horario) => `
            <span class="time-chip ${horario === next.time ? 'active' : 'inactive'}">${escapeHtml(horario)}</span>
          `)
          .join('')}
      </div>
      <div class="card-actions">
        <button class="card-action" type="button" data-action="focus-map" ${mapDisabled}>
          <i class="ti ti-map"></i> Ver mapa
        </button>
        ${routeUrl
          ? `<a class="card-action" href="${routeUrl}" target="_blank" rel="noopener">
              <i class="ti ti-route"></i> Traçar rota
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

function createLineMarker(lat, lng, linha, lineColors) {
  const colors = lineColors && lineColors.length ? lineColors : [linha && linha.cor ? linha.cor : '#888'];
  const fill = colors.length === 1 ? colors[0] : 'url(#pinGradient)';
  const defs = colors.length === 1
    ? ''
    : [
        '<defs><linearGradient id="pinGradient" x1="0%" y1="0%" x2="100%" y2="0%">',
        colors.map((color, index) => {
          const start = (index / colors.length) * 100;
          const end = ((index + 1) / colors.length) * 100;
          return '<stop offset="' + start + '%" stop-color="' + color + '"/><stop offset="' + end + '%" stop-color="' + color + '"/>';
        }).join(''),
        '</linearGradient></defs>',
      ].join('');
  const svg = [
    '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="36" viewBox="0 0 24 36">',
    defs,
    '<path d="M12 0C5.4 0 0 5.4 0 12c0 9 12 24 12 24s12-15 12-24c0-6.6-5.4-12-12-12z" fill="' + fill + '"/>',
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

function renderMapMarkers() {
  if (!state.map || !state.markerLayer) return;

  state.markerLayer.clearLayers();
  state.markers.clear();

  const pontosComGps = state.pontos.filter(hasCoords);
  pontosComGps.forEach((ponto) => {
    const linha = getLinha(ponto.linhaId, state.linhas);
    const marker = createLineMarker(ponto.lat, ponto.lng, linha, getPointLineColors(ponto, state.pontos, state.linhas))
      .bindPopup(`
        <strong>${escapeHtml(ponto.nome)}</strong>
        ${escapeHtml(ponto.endereco)}<br>
        ${escapeHtml(linha?.nome || '')} - ${escapeHtml(ponto.bairro)}
      `)
      .on('click', function () { openStopModal(ponto.id); });

    marker.addTo(state.markerLayer);
    state.markers.set(ponto.id, marker);
  });

  if (els.mapStatusText) {
    els.mapStatusText.textContent = `${pontosComGps.length} pontos no mapa`;
  }
}

function requestUserLocation(options = {}) {
  if (!navigator.geolocation) {
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

      setLocationStatus('Localização detectada', 'Calculando...', '--');
      renderNearbyStops();
      updateUserMarker();
      updateLocationSummary();

      if (options.scrollToNearby) {
        document.getElementById('pontos')?.scrollIntoView({ behavior: 'smooth' });
      }
    },
    (error) => {
      const message = error.code === error.PERMISSION_DENIED
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

  if (state.userMarker) {
    state.userMarker.setLatLng([state.userPosition.lat, state.userPosition.lng]);
  } else {
    state.userMarker = L.circleMarker([state.userPosition.lat, state.userPosition.lng], {
      radius: 8,
      color: '#ffffff',
      weight: 2,
      fillColor: '#4caf50',
      fillOpacity: 1,
    }).addTo(state.map).bindPopup('<strong>Sua localização</strong>');
  }
}

function updateLocationSummary() {
  if (!state.userPosition) return;

  const nearest = pontosComDistancia(state.pontos, state.userPosition)
    .filter(hasCoords)
    .sort((a, b) => a.distancia - b.distancia)[0];

  if (!nearest) {
    setLocationStatus('Localização detectada', 'Nenhum ponto com GPS', '--');
    return;
  }

  const next = getNextDeparture(nearest.linhaId, state.horarios);
  setLocationStatus(
    'Localização detectada',
    `${nearest.nome} (${formatDistance(nearest.distancia)})`,
    next.label,
  );

  if (!state.selectedStopId) {
    selectStop(nearest.id);
  }
}

function openStopModal(stopId) {
  const ponto = state.pontos.find(function (p) { return p.id === stopId; });
  if (!ponto) return;

  const linha = getLinha(ponto.linhaId, state.linhas);
  const next = getNextDeparture(ponto.linhaId, state.horarios);
  const horarios = getHorario(ponto.linhaId, state.horarios, getCurrentDayType());
  const sharedLineItems = getPointLineItems(ponto, state.pontos, state.linhas, state.horarios);
  const isFav = typeof Favorites !== 'undefined' && Favorites.isFavorite(String(ponto.id));

  let distancia = null;
  if (state.userPosition && hasCoords(ponto)) {
    distancia = distanceKm(state.userPosition.lat, state.userPosition.lng, ponto.lat, ponto.lng);
  }

  const allLinePoints = state.pontos
    .filter(function (p) { return p.linhaId === ponto.linhaId; })
    .sort(function (a, b) { return a.ordem - b.ordem; });

  Modal.open({
    ponto: ponto,
    linha: linha,
    sharedLineItems: sharedLineItems,
    lineColors: getPointLineColors(ponto, state.pontos, state.linhas),
    next: next,
    horarios: horarios,
    distancia: distancia,
    isFav: isFav,
    allLinePoints: allLinePoints,
    onMainMapFocus: function (p) {
      if (hasCoords(p) && state.map) {
        state.map.setView([p.lat, p.lng], 16, { animate: true });
        var marker = state.markers.get(p.id);
        if (marker) marker.openPopup();
      }
      document.getElementById('mapa')?.scrollIntoView({ behavior: 'smooth' });
    }
  });

  selectStop(stopId);
}

function selectStop(stopId, options = {}) {
  const ponto = state.pontos.find((item) => item.id === stopId);
  if (!ponto) return;

  state.selectedStopId = stopId;
  const linha = getLinha(ponto.linhaId, state.linhas);
  const next = getNextDeparture(ponto.linhaId, state.horarios);

  document.querySelectorAll('[data-stop-id]').forEach((card) => {
    card.classList.toggle('selected', Number(card.dataset.stopId) === stopId);
  });

  if (els.selectedStopName) els.selectedStopName.textContent = ponto.nome;
  if (els.selectedStopDetails) {
    els.selectedStopDetails.textContent = hasCoords(ponto)
      ? `${linha?.nome || 'Linha'} - ${ponto.endereco} - próxima saída ${next.label}`
      : `${linha?.nome || 'Linha'} - este ponto ainda não tem latitude e longitude.`;
  }

  if (hasCoords(ponto) && state.map) {
    state.map.setView([ponto.lat, ponto.lng], 16, { animate: true });
    state.markers.get(ponto.id)?.openPopup();
  }

  if (options.scrollToMap) {
    document.getElementById('mapa')?.scrollIntoView({ behavior: 'smooth' });
  }
}

function focusLine(lineId) {
  const pontosLinha = state.pontos.filter((ponto) => ponto.linhaId === lineId && hasCoords(ponto));
  if (!state.map || pontosLinha.length === 0) return;

  const bounds = L.latLngBounds(pontosLinha.map((ponto) => [ponto.lat, ponto.lng]));
  state.map.fitBounds(bounds, { padding: [28, 28], maxZoom: 15 });
  document.getElementById('mapa')?.scrollIntoView({ behavior: 'smooth' });
}

function setLocationStatus(location, nearest, departure) {
  if (els.userLocationText) els.userLocationText.textContent = location;
  if (els.nearestStopText) els.nearestStopText.textContent = nearest;
  if (els.nextDepartureText) els.nextDepartureText.textContent = departure;
}