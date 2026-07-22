(function () {

var state = {
    pontos: [],
    linhas: [],
    horarios: [],
    userPosition: null,
    selectedFilter: 'all',
    selectedPointId: null,
    scheduleTab: 'uteis',
    visibleCount: 5,
    map: null,
    markerLayer: null,
    userMarker: null,
    markers: new Map()
};

var els = {
    searchInput: document.getElementById('searchInput'),
    searchBox: document.getElementById('searchBox'),
    searchResults: document.getElementById('searchResults'),
    searchMobileBtn: document.getElementById('searchMobileBtn'),
    mobileMenuBtn: document.getElementById('mobileMenuBtn'),
    sidebar: document.getElementById('sidebar'),
    sidebarOverlay: document.getElementById('sidebarOverlay'),
    filterTags: document.querySelectorAll('#filterTags .filter-tag'),
    pointsGrid: document.getElementById('pointsGrid'),
    pageSubtitle: document.getElementById('pageSubtitle'),
    selectedPointName: document.getElementById('selectedPointName'),
    selectedDistance: document.getElementById('selectedDistance'),
    selectedAddress: document.getElementById('selectedAddress'),
    selectedLine: document.getElementById('selectedLine'),
    selectedNext: document.getElementById('selectedNext'),
    locationStatus: document.getElementById('locationStatus'),
    scheduleTable: document.getElementById('scheduleTable'),
    scheduleNote: document.getElementById('scheduleNote'),
    lineSelectText: document.getElementById('lineSelectText'),
    routeMap: document.getElementById('routeMap'),
    mapBtn: document.getElementById('mapBtn'),
    stopsCard: document.querySelector('.stops-card'),
    pointsCount: document.querySelector('.stops-count')
};

init();

async function init() {
    applyInitialFilter();
    bindEvents();
    applyInitialFilter();
    setupBackToTop();
    setupOfflineDetection();

    var cached = loadCache();
    var modalInited = false;
    function initModalOnce() {
        if (modalInited) return;
        modalInited = true;
        Modal.init({
          onFavToggle: function () {
            render();
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
            renderFilters();
            renderSelect();
            hideSplash();
        }

        var responses = await Promise.all([
            fetch('./dados/pontos.json'),
            fetch('./dados/linhas.json'),
            fetch('./dados/horarios.json')
        ]);

        if (responses.some(function (response) { return !response.ok; })) {
            throw new Error('Falha ao carregar os arquivos JSON.');
        }

        var data = await Promise.all(responses.map(function (response) { return response.json(); }));
        state.pontos = data[0];
        state.linhas = data[1];
        state.horarios = data[2];

        saveCache(state.pontos, state.linhas, state.horarios);

        initModalOnce();
        renderFilters();
        renderSelect();
        renderSchedule();
        initMap();
        renderMapMarkers();
        render();
        requestLocation();
    } catch (error) {
        console.error(error);
        if (!cached) {
            cached = loadCache();
        }
        if (cached) {
            state.pontos = cached.pontos;
            state.linhas = cached.linhas;
            state.horarios = cached.horarios;
            initModalOnce();
            renderFilters();
            renderSelect();
            initMap();
            renderMapMarkers();
            render();
            requestLocation();
        } else {
            if (els.pointsGrid) {
                els.pointsGrid.innerHTML = '<div class="empty-state">Nao foi possivel carregar os pontos. Abra a pagina por um servidor local para o fetch funcionar.</div>';
            }
            if (els.pageSubtitle) els.pageSubtitle.textContent = 'Erro ao carregar os dados dos pontos.';
        }
    }
    hideSplash();
}

function renderFilters() {
    var tagsHtml = '<div class="filter-tag active-tag" data-filter="all"><div class="filter-dot white-dot"></div><span>Todos</span></div>';
    state.linhas.forEach(function (linha) {
        tagsHtml += '<div class="filter-tag inactive-tag" data-filter="linha-' + linha.id + '"><div class="filter-dot border-dot"></div><span>' + escapeHtml(linha.nome) + '</span></div>';
    });
    var container = document.getElementById('filterTags');
    if (container) container.innerHTML = tagsHtml;
    els.filterTags = document.querySelectorAll('#filterTags .filter-tag');
    els.filterTags.forEach(function (tag) {
        tag.addEventListener('click', function () {
            state.selectedFilter = tag.dataset.filter || 'all';
            state.visibleCount = 5;
            setActiveFilter(state.selectedFilter);
            updateUrlFilter();
            syncLineSelect();
            render();
        });
    });
}

function renderSelect() {
    var select = document.getElementById('routeSelect');
    if (!select) return;
    select.innerHTML = '<option value="all">Todas as linhas</option>';
    state.linhas.forEach(function (linha) {
        select.innerHTML += '<option value="linha-' + linha.id + '">' + escapeHtml(linha.nome) + '</option>';
    });
}

function bindEvents() {
    if (els.searchInput) {
        var searchTimer;
        els.searchInput.addEventListener('input', function () {
            clearTimeout(searchTimer);
            searchTimer = setTimeout(function () {
                render();
                renderSearchSuggestions();
            }, 200);
        });
        els.searchInput.addEventListener('focus', renderSearchSuggestions);
    }

    if (els.searchMobileBtn) {
        els.searchMobileBtn.addEventListener('click', function () {
            if (els.searchBox) els.searchBox.classList.toggle('mobile-open');
            if (els.searchInput) els.searchInput.focus();
        });
    }

    if (els.mobileMenuBtn) {
        els.mobileMenuBtn.addEventListener('click', openSidebar);
    }

    if (els.sidebarOverlay) {
        els.sidebarOverlay.addEventListener('click', closeSidebar);
    }

    document.addEventListener('keydown', function (event) {
        if (event.key === 'Escape') {
            closeSidebar();
            hideSearchSuggestions();
        }
    });

    document.addEventListener('click', function (event) {
        if (!event.target.closest('.search-box')) hideSearchSuggestions();
        if (event.target.closest('.sidebar-link')) closeSidebar();
    });

    var lineSelect = document.getElementById('routeSelect');
    if (lineSelect) {
        lineSelect.addEventListener('change', function () {
            state.selectedFilter = this.value;
            state.visibleCount = 5;
            setActiveFilter(state.selectedFilter);
            updateUrlFilter();
            syncLineSelect();
            render();
        });
    }

    if (els.pointsGrid) {
        els.pointsGrid.addEventListener('click', function (event) {
            var favBtn = event.target.closest('.fav-btn');
            if (favBtn) {
                event.stopPropagation();
                var id = favBtn.dataset.id;
                Favorites.toggleFavorite(id);
                var isFav = Favorites.isFavorite(id);
                favBtn.classList.toggle('favorited', isFav);
                var icon = favBtn.querySelector('i');
                if (icon) {
                    icon.classList.remove('ti-heart', 'ti-heart-filled');
                    icon.classList.add(isFav ? 'ti-heart-filled' : 'ti-heart');
                }
                favBtn.classList.remove('fill', 'empty');
                void favBtn.offsetWidth;
                favBtn.classList.add(isFav ? 'fill' : 'empty');
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
            var card = event.target.closest('[data-point-id]');
            if (!card) return;
            cardClickEffect(card, function () {
                openPointModal(Number(card.dataset.pointId));
            });
        });
    }

    if (els.stopsCard) {
        els.stopsCard.addEventListener('click', function (event) {
            var item = event.target.closest('[data-point-id]');
            if (!item) return;
            openPointModal(Number(item.dataset.pointId));
        });
    }

    if (els.mapBtn) {
        els.mapBtn.addEventListener('click', function (event) {
            event.preventDefault();
            event.stopImmediatePropagation();
            fitMapToPoints();
        }, true);
    }

    var fabBtn = document.getElementById('fabBtn');
    if (fabBtn) {
        fabBtn.addEventListener('click', function () {
            requestLocation();
            render();
        });
    }
}

function applyInitialFilter() {
    var params = new URLSearchParams(window.location.search);
    var lineId = Number(params.get('linha'));
    if (lineId) {
        state.selectedFilter = 'linha-' + lineId;
    }
    setActiveFilter(state.selectedFilter);
    syncLineSelect();
}

function updateUrlFilter() {
    var url = new URL(window.location.href);
    if (state.selectedFilter.indexOf('linha-') === 0) {
        url.searchParams.set('linha', state.selectedFilter.replace('linha-', ''));
    } else {
        url.searchParams.delete('linha');
    }
    window.history.replaceState({}, '', url);
}

function openSidebar() {
    if (els.sidebar) els.sidebar.classList.add('open');
    if (els.sidebarOverlay) els.sidebarOverlay.classList.add('show');
    document.body.style.overflow = 'hidden';
}

function closeSidebar() {
    if (els.sidebar) els.sidebar.classList.remove('open');
    if (els.sidebarOverlay) els.sidebarOverlay.classList.remove('show');
    document.body.style.overflow = '';
}

function renderSuggestionsList(results) {
    if (!els.searchResults) return;
    if (results.length === 0) {
        els.searchResults.innerHTML = '<div class="search-result-empty">Nenhum ponto encontrado</div>';
    } else {
        els.searchResults.innerHTML = results.map(function (ponto) {
            var linha = getLinha(ponto.linhaId, state.linhas);
            return [
                '<div class="search-result-item" data-point-id="' + ponto.id + '">',
                '<div class="search-result-name"><i class="ti ti-map-pin"></i>' + escapeHtml(ponto.nome) + '</div>',
                '<div class="search-result-desc">' + escapeHtml(ponto.endereco) + ' - ' + escapeHtml(ponto.bairro) + ' - ' + escapeHtml(linha ? linha.nome : 'Linha') + '</div>',
                '</div>'
            ].join('');
        }).join('');
    }

    els.searchResults.classList.add('show');
    els.searchResults.querySelectorAll('[data-point-id]').forEach(function (item) {
        item.addEventListener('click', function () {
            openPointModal(Number(item.dataset.pointId));
            els.searchInput.value = '';
            hideSearchSuggestions();
            render();
        });
    });
}

function renderSearchSuggestions() {
    if (!els.searchResults || !els.searchInput) return;
    var term = normalize(els.searchInput.value);
    if (!term) {
        renderSuggestionsList(getDiverseSuggestions());
        return;
    }

    var results = getFilteredPoints('all').filter(function (ponto) {
        var linha = getLinha(ponto.linhaId, state.linhas);
        return normalize([ponto.nome, ponto.endereco, ponto.bairro, linha && linha.nome, linha && linha.titulo].join(' ')).includes(term);
    }).slice(0, 10);

    renderSuggestionsList(results);
}

function hideSearchSuggestions() {
    if (!els.searchResults) return;
    els.searchResults.classList.remove('show');
    els.searchResults.innerHTML = '';
}

function requestLocation() {
    if (!navigator.geolocation) {
        if (els.locationStatus) els.locationStatus.textContent = 'SEM GPS';
        return;
    }

    if (els.locationStatus) els.locationStatus.textContent = 'PEDINDO GPS';
    navigator.geolocation.getCurrentPosition(
        function (position) {
            state.userPosition = {
                lat: position.coords.latitude,
                lng: position.coords.longitude
            };
            if (els.locationStatus) els.locationStatus.textContent = 'GPS ATIVO';
            updateUserMarker();
            render();
        },
        function () {
            if (els.locationStatus) els.locationStatus.textContent = 'GPS NEGADO';
            render();
        },
        { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 }
    );
}

function render() {
    var pontos = getFilteredPoints();
    var showAll = state.visibleCount >= pontos.length;
    var visible = showAll ? pontos : pontos.slice(0, state.visibleCount);

    if (els.pageSubtitle) {
        els.pageSubtitle.textContent = state.userPosition
            ? 'Listando os pontos por distancia, linha e busca.'
            : 'Permita a localizacao para destacar os pontos mais proximos.';
    }

    if (!els.pointsGrid) return;

    if (pontos.length === 0) {
        showEmpty(els.pointsGrid, 'Nenhum ponto encontrado para essa busca.');
    } else {
        els.pointsGrid.innerHTML = visible.map(renderPointCard).join('');
    }

    var container = document.getElementById('showMoreContainer');
    if (container) {
        if (pontos.length > state.visibleCount) {
            container.innerHTML = '<button class="show-more-btn" id="showMoreBtn">Ver mais pontos (' + pontos.length + ' total)</button>';
            var showMoreBtn = document.getElementById('showMoreBtn');
            if (showMoreBtn) showMoreBtn.addEventListener('click', function () {
                state.visibleCount = pontos.length;
                render();
            });
        } else {
            container.innerHTML = '';
        }
    }

    renderSidebar(pontos);

    var pointsCountEl = document.querySelector('.stops-count');
    if (pointsCountEl) {
        pointsCountEl.textContent = pontos.length + ' CADASTRADOS';
    }

    if (!state.selectedPointId && visible[0]) {
        markSelectedCard();
    } else {
        markSelectedCard();
    }
}

function renderPointCard(ponto) {
    var linha = getLinha(ponto.linhaId, state.linhas);
    var next = getNextDeparture(ponto.linhaId, state.horarios);
    var selected = ponto.id === state.selectedPointId ? ' selected' : '';
    var isFav = typeof Favorites !== 'undefined' && Favorites.isFavorite(String(ponto.id));
    var lineColors = getPointLineColors(ponto, state.pontos, state.linhas);
    var dotBackground = getMixedBackground(lineColors);
    var nextClass = next.minutes <= 5 ? 'now' : 'waiting';
    var distancia = getDistanceText(ponto);
    return [
        '<div class="point-card' + selected + '" data-point-id="' + ponto.id + '">',
        '<div class="point-card-header">',
        '<h3 class="point-card-title">' + escapeHtml(ponto.nome) + '</h3>',
        '<div class="card-header-right">',
        '<span class="point-distance">' + escapeHtml(distancia) + '</span>',
        '<button class="fav-btn' + (isFav ? ' favorited' : '') + '" data-id="' + ponto.id + '" aria-label="Favoritar">',
        '<i class="ti ti-' + (isFav ? 'heart-filled' : 'heart') + '"></i>',
        '</button>',
        '</div>',
        '</div>',
        '<p class="point-address">' + escapeHtml(ponto.endereco) + '</p>',
        '<div class="point-next-bus">',
        '<span class="point-next-label"><i class="ti ti-bus"></i> Proximo onibus</span>',
        '<span class="point-next-time ' + nextClass + '">' + escapeHtml(next.label) + '</span>',
        '</div>',
        '<div class="point-meta">',
        '<span class="point-chip">' + escapeHtml(ponto.bairro) + '</span>',
        '<span class="point-chip point-line-chip"><span class="chip-dot" style="background:' + escapeAttr(dotBackground) + '"></span>' + escapeHtml(linha ? linha.nome : 'Linha') + '</span>',
        '<span class="point-chip">Ordem ' + escapeHtml(ponto.ordem) + '</span>',
        '</div>',
        '</div>'
    ].join('');
}

function renderSidebar(pontos) {
    if (!els.stopsCard) return;
    var list = pontos.slice(0, 5);
    els.stopsCard.innerHTML = [
        '<div class="stops-header">',
        '<span class="stops-title">Primeiros pontos</span>',
        '<span class="stops-count">' + state.pontos.length + ' CADASTRADOS</span>',
        '</div>',
        '<div class="line-legend">',
        state.linhas.map(function (linha) {
            return '<span class="line-legend-item"><span class="line-legend-icon" style="background:' + escapeAttr(linha.cor || '#888') + '"><i class="ti ti-route"></i></span>' + escapeHtml(linha.nome) + '</span>';
        }).join(''),
        '</div>',
        list.map(function (ponto, index) {
            var lineColors = getPointLineColors(ponto, state.pontos, state.linhas);
            var dotBackground = getMixedBackground(lineColors);
            var shadowColor = hexToRgba(lineColors[0] || '#e53935', 0.32);
            return [
                '<div class="stop-item" data-point-id="' + ponto.id + '">',
                '<div class="stop-line-col">',
                '<div class="stop-dot colored-dot" style="background:' + escapeAttr(dotBackground) + (index === 0 ? '; box-shadow:0 0 0 4px ' + escapeAttr(shadowColor) : '') + '"></div>',
                index < list.length - 1 ? '<div class="stop-line"></div>' : '',
                '</div>',
                '<div class="stop-info">',
                '<p class="stop-name">' + escapeHtml(ponto.nome) + '</p>',
                '<p class="stop-desc">' + escapeHtml(getDistanceText(ponto)) + ' - ' + escapeHtml(ponto.bairro) + '</p>',
                '</div>',
                '</div>'
            ].join('');
        }).join('')
    ].join('');
}

function openPointModal(pointId) {
    var ponto = state.pontos.find(function (p) { return p.id === pointId; });
    if (!ponto) return;

    var linha = getLinha(ponto.linhaId, state.linhas);
    var next = getNextDeparture(ponto.linhaId, state.horarios);
    var horarios = getHorario(ponto.linhaId, state.horarios);
    var sharedLineItems = getPointLineItems(ponto, state.pontos, state.linhas, state.horarios);
    var isFav = typeof Favorites !== 'undefined' && Favorites.isFavorite(String(ponto.id));

    var distancia = null;
    if (state.userPosition && hasCoords(ponto)) {
        distancia = distanceKm(state.userPosition.lat, state.userPosition.lng, Number(ponto.lat), Number(ponto.lng));
    }

    var allLinePoints = state.pontos
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
                state.map.invalidateSize();
                state.map.setView([Number(p.lat), Number(p.lng)], 16, { animate: true });
                var m = state.markers.get(p.id);
                if (m) m.openPopup();
            }
        }
    });

    selectPoint(pointId, true);
}

function selectPoint(pointId, silent) {
    var ponto = state.pontos.find(function (item) { return item.id === pointId; });
    if (!ponto) return;

    state.selectedPointId = pointId;
    var linha = getLinha(ponto.linhaId, state.linhas);
    var next = getNextDeparture(ponto.linhaId, state.horarios);

    if (els.selectedPointName) els.selectedPointName.textContent = ponto.nome;
    if (els.selectedDistance) els.selectedDistance.textContent = getDistanceText(ponto);
    if (els.selectedAddress) els.selectedAddress.textContent = ponto.endereco + ' - ' + ponto.bairro;
    if (els.selectedLine) els.selectedLine.textContent = linha ? linha.nome : 'Linha nao informada';
    if (els.selectedNext) els.selectedNext.textContent = next.label + (linha ? ' - ' + linha.titulo : '');
    if (els.lineSelectText) els.lineSelectText.textContent = linha ? linha.titulo : 'Linha selecionada';

    renderSchedule(ponto.linhaId, next.time);
    markSelectedCard();
    focusPointOnMap(ponto);

    if (!silent) {
        var detailCard = document.querySelector('.line-detail-card');
        if (detailCard) detailCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
}

function initMap() {
    if (!els.routeMap || typeof L === 'undefined') return;

    state.map = L.map(els.routeMap, {
        zoomControl: true,
        scrollWheelZoom: false
    }).setView([-22.4946, -48.5588], 13);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap'
    }).addTo(state.map);

    state.markerLayer = L.layerGroup().addTo(state.map);
    setTimeout(function () {
        state.map.invalidateSize();
        fitMapToPoints();
    }, 100);
}

function createLineMarker(lat, lng, linha, lineColors) {
    var colors = lineColors && lineColors.length ? lineColors : [linha && linha.cor ? linha.cor : '#888'];
    var fill = colors.length === 1 ? colors[0] : 'url(#pinGradient)';
    var defs = colors.length === 1 ? '' : [
        '<defs><linearGradient id="pinGradient" x1="0%" y1="0%" x2="100%" y2="0%">',
        colors.map(function (color, index) {
            var start = (index / colors.length) * 100;
            var end = ((index + 1) / colors.length) * 100;
            return '<stop offset="' + start + '%" stop-color="' + color + '"/><stop offset="' + end + '%" stop-color="' + color + '"/>';
        }).join(''),
        '</linearGradient></defs>'
    ].join('');
    var svg = [
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

    state.pontos.filter(hasCoords).forEach(function (ponto) {
        var linha = getLinha(ponto.linhaId, state.linhas);
        var marker = createLineMarker(Number(ponto.lat), Number(ponto.lng), linha, getPointLineColors(ponto, state.pontos, state.linhas))
            .bindPopup(
                '<strong>' + escapeHtml(ponto.nome) + '</strong><br>' +
                escapeHtml(ponto.endereco) + '<br>' +
                escapeHtml(linha ? linha.nome : 'Linha') + ' - ' + escapeHtml(ponto.bairro)
            )
            .on('click', function () {
                openPointModal(ponto.id);
            });

        marker.addTo(state.markerLayer);
        state.markers.set(ponto.id, marker);
    });
}

function focusPointOnMap(ponto) {
    if (!state.map || !hasCoords(ponto)) return;

    var latLng = [Number(ponto.lat), Number(ponto.lng)];
    state.map.invalidateSize();
    state.map.setView(latLng, 16, { animate: true });
    var marker = state.markers.get(ponto.id);
    if (marker) marker.openPopup();
}

function fitMapToPoints() {
    if (!state.map) return;

    var points = state.pontos.filter(hasCoords);
    if (points.length === 0) return;

    state.map.invalidateSize();
    var bounds = L.latLngBounds(points.map(function (ponto) {
        return [Number(ponto.lat), Number(ponto.lng)];
    }));

    if (state.userPosition) {
        bounds.extend([state.userPosition.lat, state.userPosition.lng]);
    }

    state.map.fitBounds(bounds, { padding: [22, 22], maxZoom: 15 });
}

function updateUserMarker() {
    if (!state.map || !state.userPosition) return;

    var latLng = [state.userPosition.lat, state.userPosition.lng];
    if (state.userMarker) {
        state.userMarker.setLatLng(latLng);
        return;
    }

    state.userMarker = L.circleMarker(latLng, {
        radius: 7,
        color: '#ffffff',
        weight: 2,
        fillColor: '#22c55e',
        fillOpacity: 1
    }).addTo(state.map).bindPopup('<strong>Sua localização</strong>');
}

function buildScheduleTabs() {
    var tabsHtml = '<div class="schedule-tabs">' +
        '<button class="schedule-tab' + (state.scheduleTab === 'uteis' ? ' active' : '') + '" data-tab="uteis">Dias Uteis</button>' +
        '<button class="schedule-tab' + (state.scheduleTab === 'sabado' ? ' active' : '') + '" data-tab="sabado">Sabado</button>' +
        '</div>';
    return tabsHtml;
}

function subtractMinutes(timeStr, minutes) {
    var parts = timeStr.split(':');
    var total = parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10) - minutes;
    if (total < 0) total += 1440;
    var h = Math.floor(total / 60);
    var m = total % 60;
    return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m;
}

function renderSchedule(linhaId, nextTime) {
    if (!els.scheduleTable) return;

    var horarios;
    if (linhaId) {
        horarios = getHorario(linhaId, state.horarios, state.scheduleTab);
    } else {
        var all = [];
        state.linhas.forEach(function (linha) {
            getHorario(linha.id, state.horarios, state.scheduleTab).forEach(function (h) {
                if (all.indexOf(h) === -1) all.push(h);
            });
        });
        horarios = all.sort();
    }

    var html = buildScheduleTabs();

    if (horarios.length === 0) {
        html += '<div class="schedule-row"><span class="schedule-time">Sem horarios para ' + (state.scheduleTab === 'uteis' ? 'dias uteis' : 'sabado') + '.</span></div>';
        els.scheduleTable.innerHTML = html;
        bindScheduleTabs();
        return;
    }

    html += '<div class="schedule-row schedule-row-header">' +
        '<span class="schedule-header-cell">Estar no ponto</span>' +
        '<span class="schedule-header-cell">Horarios</span>' +
        '</div>';
    html += horarios.map(function (time) {
        var earliest = subtractMinutes(time, 15);
        return '<div class="schedule-row">' +
            '<span class="schedule-arrival">' + earliest + '</span>' +
            '<span class="schedule-time' + (time === nextTime ? ' active-time' : '') + '">' + time + '</span>' +
            '</div>';
    }).join('');

    els.scheduleTable.innerHTML = html;
    bindScheduleTabs();

    if (els.scheduleNote) {
        els.scheduleNote.textContent = linhaId ? 'Horario destacado indica a proxima saida.' : 'Selecione um ponto para ver a proxima saida.';
    }
}

function bindScheduleTabs() {
    document.querySelectorAll('.schedule-tab').forEach(function (tab) {
        tab.addEventListener('click', function () {
            state.scheduleTab = tab.dataset.tab;
            document.querySelectorAll('.schedule-tab').forEach(function (t) {
                t.classList.toggle('active', t.dataset.tab === state.scheduleTab);
            });
            var ponto = state.selectedPointId ? state.pontos.find(function (p) { return p.id === state.selectedPointId; }) : null;
            if (ponto) {
                var next = getNextDeparture(ponto.linhaId, state.horarios);
                renderSchedule(ponto.linhaId, next.time);
            } else {
                renderSchedule();
            }
        });
    });
}

function getFilteredPoints(forceFilter) {
    var filter = forceFilter || state.selectedFilter;
    var term = normalize(els.searchInput ? els.searchInput.value : '');
    var lista = pontosComDistancia(state.pontos, state.userPosition);

    if (term) {
        lista = lista.filter(function (ponto) {
            var linha = getLinha(ponto.linhaId, state.linhas);
            return normalize([ponto.nome, ponto.endereco, ponto.bairro, linha && linha.nome, linha && linha.titulo].join(' ')).includes(term);
        });
    }

    if (filter.indexOf('linha-') === 0) {
        var lineId = Number(filter.replace('linha-', ''));
        lista = lista.filter(function (ponto) { return ponto.linhaId === lineId; });
    }

    lista = lista.sort(function (a, b) {
        if (a.linhaId !== b.linhaId) return a.linhaId - b.linhaId;
        return a.ordem - b.ordem;
    });

    return lista;
}

function getDiverseSuggestions() {
    var lista = pontosComDistancia(state.pontos, state.userPosition);
    var seenBairros = {};
    var seenLinhas = {};
    var result = [];
    for (var i = 0; i < lista.length; i++) {
        if (result.length >= 10) break;
        var ponto = lista[i];
        var linha = getLinha(ponto.linhaId, state.linhas);
        var bairroKey = normalize(ponto.bairro);
        var linhaKey = linha ? linha.id : 0;
        if (!seenBairros[bairroKey] || !seenLinhas[linhaKey]) {
            result.push(ponto);
            seenBairros[bairroKey] = true;
            seenLinhas[linhaKey] = true;
        }
    }
    return result.slice(0, 10);
}

function getDistanceText(ponto) {
    var withDist = ponto;
    if (ponto.distancia === undefined) {
        var arranged = pontosComDistancia([ponto], state.userPosition);
        withDist = arranged[0];
    }
    if (typeof withDist.distancia === 'number') {
        return formatDistance(withDist.distancia);
    }
    return hasCoords(ponto) ? 'Com GPS' : 'Sem GPS';
}

function setActiveFilter(filter) {
    els.filterTags.forEach(function (tag) {
        var active = tag.dataset.filter === filter;
        tag.className = 'filter-tag ' + (active ? 'active-tag' : 'inactive-tag');
        var dot = tag.querySelector('.filter-dot');
        if (dot) dot.className = 'filter-dot ' + (active ? 'white-dot' : 'border-dot');
    });
}

function syncLineSelect() {
    var select = document.getElementById('routeSelect');
    if (select) select.value = state.selectedFilter;
}

function markSelectedCard() {
    document.querySelectorAll('[data-point-id]').forEach(function (card) {
        card.classList.toggle('selected', Number(card.dataset.pointId) === state.selectedPointId);
    });
}

})();