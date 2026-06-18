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
  
  try {
    await carregarDados();
    renderAll();
    requestUserLocation();
  } catch (error) {
    console.error(error);
    showEmpty(els.nearbyStops, 'Não foi possível carregar os dados dos pontos.');
  }
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

    if (stopCard && !event.target.closest('a')) {
      selectStop(Number(stopCard.dataset.stopId));
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
        renderSearchSuggestions(pontosComDistancia().slice(0, 5));
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
  const lista = pontosComDistancia();
  return lista
    .filter((ponto) => {
      const linha = getLinha(ponto.linhaId);
      return normalize([
        ponto.nome,
        ponto.endereco,
        ponto.bairro,
        linha?.nome || '',
        linha?.titulo || '',
      ].join(' ')).includes(term);
    })
    .slice(0, 5);
}

function renderSearchSuggestions(results) {
  if (results.length === 0) {
    els.searchResults.innerHTML = '<div class="search-result-empty">Nenhum ponto encontrado</div>';
    els.searchResults.classList.add('show');
    return;
  }

  els.searchResults.innerHTML = results
    .map((ponto) => {
      const linha = getLinha(ponto.linhaId);
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
      selectStop(stopId, { scrollToMap: true });
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
  renderNearbyStops();
  renderMapMarkers();
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

  const nearby = pontosComDistancia()
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
      const horariosLinha = getHorario(linha.id);
      const next = getNextDeparture(linha.id);
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
  const linha = getLinha(ponto.linhaId);
  const next = getNextDeparture(ponto.linhaId);
  const horariosLinha = getHorario(ponto.linhaId);
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

  return `
    <div class="card stop-card ${selected}" data-stop-id="${ponto.id}">
      <div class="card-header">
        <div class="card-icon">
          <i class="ti ti-map-pin"></i>
        </div>
        <span class="card-distance">${escapeHtml(distanceText)}</span>
      </div>
      <h3 class="card-title">${escapeHtml(ponto.nome)}</h3>
      <p class="card-address">${escapeHtml(ponto.endereco)}</p>
      <div class="card-meta">
        <span class="meta-chip">${escapeHtml(ponto.bairro)}</span>
        <span class="meta-chip">${escapeHtml(linha?.nome || 'Linha não informada')}</span>
        <span class="meta-chip">Ordem ${escapeHtml(String(ponto.ordem))}</span>
      </div>
      <div class="card-line">
        <span class="card-line-name">Próxima saída</span>
        <span class="card-line-time ${next.minutes <= 5 ? 'now' : 'waiting'}">${escapeHtml(next.label)}</span>
      </div>
      <div class="card-line">
        <span class="card-line-name">${escapeHtml(linha?.titulo || 'Rota não informada')}</span>
        <span class="card-line-time waiting">${horariosLinha.length} horários</span>
      </div>
      <div class="line-card-times stop-times">
        ${horariosLinha
          .map((horario) => `
            <span class="time-chip ${horario === next.time ? 'active' : 'inactive'}">${escapeHtml(horario)}</span>
          `)
          .join('')}
      </div>
      <div class="card-actions">
        <button class="card-action primary" type="button" data-action="focus-map" ${mapDisabled}>
          <i class="ti ti-map"></i> Mapa
        </button>
        ${routeUrl
          ? `<a class="card-action" href="${routeUrl}" target="_blank" rel="noopener">
              <i class="ti ti-route"></i> Rota
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

function renderMapMarkers() {
  if (!state.map || !state.markerLayer) return;

  state.markerLayer.clearLayers();
  state.markers.clear();

  const pontosComGps = state.pontos.filter(hasCoords);
  pontosComGps.forEach((ponto) => {
    const linha = getLinha(ponto.linhaId);
    const marker = L.marker([ponto.lat, ponto.lng])
      .bindPopup(`
        <strong>${escapeHtml(ponto.nome)}</strong>
        ${escapeHtml(ponto.endereco)}<br>
        ${escapeHtml(linha?.nome || '')} - ${escapeHtml(ponto.bairro)}
      `)
      .on('click', () => selectStop(ponto.id));

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

  const nearest = pontosComDistancia()
    .filter(hasCoords)
    .sort((a, b) => a.distancia - b.distancia)[0];

  if (!nearest) {
    setLocationStatus('Localização detectada', 'Nenhum ponto com GPS', '--');
    return;
  }

  const next = getNextDeparture(nearest.linhaId);
  setLocationStatus(
    'Localização detectada',
    `${nearest.nome} (${formatDistance(nearest.distancia)})`,
    next.label,
  );

  if (!state.selectedStopId) {
    selectStop(nearest.id);
  }
}

function selectStop(stopId, options = {}) {
  const ponto = state.pontos.find((item) => item.id === stopId);
  if (!ponto) return;

  state.selectedStopId = stopId;
  const linha = getLinha(ponto.linhaId);
  const next = getNextDeparture(ponto.linhaId);

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

function pontosComDistancia() {
  return state.pontos.map((ponto) => {
    if (!state.userPosition || !hasCoords(ponto)) return { ...ponto };

    return {
      ...ponto,
      distancia: calcularDistanciaKm(
        state.userPosition.lat,
        state.userPosition.lng,
        ponto.lat,
        ponto.lng,
      ),
    };
  });
}

function calcularDistanciaKm(lat1, lng1, lat2, lng2) {
  const earthRadiusKm = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusKm * c;
}

function getNextDeparture(linhaId) {
  const horariosLinha = getHorario(linhaId);
  if (horariosLinha.length === 0) {
    return { time: '--', label: 'Sem horário', minutes: Number.POSITIVE_INFINITY };
  }

  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const departures = horariosLinha
    .map((horario) => {
      const [hours, minutes] = horario.split(':').map(Number);
      const total = hours * 60 + minutes;
      return {
        time: horario,
        diff: total >= currentMinutes ? total - currentMinutes : total + 1440 - currentMinutes,
      };
    })
    .sort((a, b) => a.diff - b.diff);

  const next = departures[0];
  return {
    time: next.time,
    label: formatMinutes(next.diff, next.time),
    minutes: next.diff,
  };
}

function formatMinutes(minutes, time) {
  if (minutes <= 1) return 'Agora';
  if (minutes < 60) return `${minutes} min`;
  if (minutes < 1440) {
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    return rest === 0 ? `${hours}h` : `${hours}h ${rest}min`;
  }
  return `Amanhã ${time}`;
}

function formatDistance(distanceKm) {
  if (distanceKm < 1) return `${Math.round(distanceKm * 1000)}m`;
  return `${distanceKm.toFixed(1).replace('.', ',')}km`;
}

function setLocationStatus(location, nearest, departure) {
  if (els.userLocationText) els.userLocationText.textContent = location;
  if (els.nearestStopText) els.nearestStopText.textContent = nearest;
  if (els.nextDepartureText) els.nextDepartureText.textContent = departure;
}

function showEmpty(container, message) {
  if (!container) return;
  container.innerHTML = `<div class="empty-state">${escapeHtml(message)}</div>`;
}

function getLinha(linhaId) {
  return state.linhas.find((linha) => linha.id === linhaId);
}

function getHorario(linhaId) {
  return state.horarios.find((item) => item.linhaId === linhaId)?.horarios || [];
}

function hasCoords(ponto) {
  return ponto.lat !== null
    && ponto.lng !== null
    && ponto.lat !== undefined
    && ponto.lng !== undefined
    && ponto.lat !== ''
    && ponto.lng !== ''
    && Number.isFinite(Number(ponto.lat))
    && Number.isFinite(Number(ponto.lng));
}

function normalize(value) {
  return String(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function toRad(value) {
  return value * Math.PI / 180;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function escapeAttr(value) {
  return escapeHtml(value).replaceAll('`', '&#096;');
}