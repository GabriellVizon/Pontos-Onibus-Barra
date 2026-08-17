(function () {

    var state = {
        pontos: [],
        horarios: [],
        userPosition: null,
        selectedPointId: null,
        scheduleTab: 'uteis',
        visibleCount: 5,
        map: null,
        markerLayer: null,
        userMarker: null,
        markers: new Map(),
        distanceCache: null
    };

    var els = {
        searchInput: document.getElementById('searchInput'),
        searchBox: document.getElementById('searchBox'),
        searchResults: document.getElementById('searchResults'),
        searchMobileBtn: document.getElementById('searchMobileBtn'),
        mobileMenuBtn: document.getElementById('mobileMenuBtn'),
        sidebar: document.getElementById('sidebar'),
        sidebarOverlay: document.getElementById('sidebarOverlay'),
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

        routeMap: document.getElementById('routeMap'),
        mapBtn: document.getElementById('mapBtn'),
        stopsCard: document.querySelector('.stops-card'),
        pointsCount: document.querySelector('.stops-count')
    };

    init();

    async function init() {
        state.distanceCache = createDistanceCache(
            function () { return state.pontos; },
            function () { return state.userPosition; }
        );
        bindEvents();
        setupBackToTop();
        setupOfflineDetection();

        if (typeof Reminders !== 'undefined') {
            Reminders.init({
                onFire: function (reminder) {
                    showToast('Lembrete: ' + reminder.stopName + ' — ônibus das ' + reminder.departure + ' em ' + reminder.minutesBefore + ' min.');
                }
            });
        }
        setInterval(refreshLiveDepartures, 30000);

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
                state.horarios = cached.horarios;
                if (state.distanceCache) state.distanceCache.invalidate();
                initModalOnce();
                hideSplash();
            }

            await loadData();
            initModalOnce();
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
                state.horarios = cached.horarios;
                if (state.distanceCache) state.distanceCache.invalidate();
                initModalOnce();
                initMap();
                renderMapMarkers();
                render();
                requestLocation();
            } else {
                if (els.pointsGrid) {
                    els.pointsGrid.innerHTML = '<div class="empty-state">Não foi possível carregar os pontos. Abra a página por um servidor local para o fetch funcionar.</div>';
                }
                if (els.pageSubtitle) els.pageSubtitle.textContent = 'Erro ao carregar os dados dos pontos.';
            }
        }
        hideSplash();
    }

    function loadData() {
        return Promise.all([
            fetch('./dados/pontos.json'),
            fetch('./dados/horarios.json')
        ]).then(function (responses) {
            if (responses.some(function (response) { return !response.ok; })) {
                throw new Error('Falha ao carregar os arquivos JSON.');
            }
            return Promise.all(responses.map(function (response) { return response.json(); }));
        }).then(function (data) {
            state.pontos = data[0];
            state.horarios = data[1];
            if (state.distanceCache) state.distanceCache.invalidate();
            saveCache(state.pontos, state.horarios);
            if (typeof Favorites !== 'undefined') {
                Favorites.pruneFavorites(state.pontos.map(function (p) { return p.id; }));
            }
        });
    }

    function refresh() {
        var splash = document.getElementById('splash');
        if (splash) splash.classList.remove('hide');
        loadData().then(function () {
            renderSchedule();
            renderMapMarkers();
            render();
            requestLocation();
            hideSplash();
        }).catch(function () {
            hideSplash();
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
                refresh();
            });

            const searchIcon = document.querySelector('#searchBox .ti-search');
            searchIcon?.addEventListener('click', (e) => {
                e.stopPropagation();
                els.searchInput?.focus();
            });
        }
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
                return [
                    '<div class="search-result-item" data-point-id="' + ponto.id + '">',
                    '<div class="search-result-name"><i class="ti ti-map-pin"></i>' + escapeHtml(ponto.nome) + '</div>',
                    '<div class="search-result-desc">' + escapeHtml(ponto.endereco) + ' - ' + escapeHtml(ponto.bairro) + '</div>',
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

        var results = getFilteredPoints().filter(function (ponto) {
            return normalize([ponto.nome, ponto.endereco, ponto.bairro].join(' ')).includes(term);
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
                if (state.distanceCache) state.distanceCache.invalidate();
                if (els.locationStatus) els.locationStatus.textContent = 'GPS ATIVO';
                updateUserMarker();
                render();
            },
            function () {
                if (state.distanceCache) state.distanceCache.invalidate();
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
                ? 'Listando os pontos por distância, ordem e busca.'
                : 'Permita a localização para destacar os pontos mais próximos.';
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

        markSelectedCard();
    }

    function renderPointCard(ponto) {
        var next = getNextDeparture(state.horarios);
        var selected = ponto.id === state.selectedPointId ? ' selected' : '';
        var isFav = typeof Favorites !== 'undefined' && Favorites.isFavorite(String(ponto.id));
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
            '<span class="point-next-label"><i class="ti ti-bus"></i> Próximo ônibus</span>',
            '<span class="point-next-time ' + nextClass + '">' + escapeHtml(next.label) + '</span>',
            '</div>',
            '<div class="point-meta">',
            '<span class="point-chip">' + escapeHtml(ponto.bairro) + '</span>',
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
            list.map(function (ponto, index) {
                var shadowColor = hexToRgba(BUS_COLOR, 0.32);
                return [
                    '<div class="stop-item" data-point-id="' + ponto.id + '">',
                    '<div class="stop-line-col">',
                    '<div class="stop-dot colored-dot" style="background:' + escapeAttr(BUS_COLOR) + (index === 0 ? '; box-shadow:0 0 0 4px ' + escapeAttr(shadowColor) : '') + '"></div>',
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

        var next = getNextDeparture(state.horarios);
        var horarios = getHorario(state.horarios, getCurrentDayType());
        var isFav = typeof Favorites !== 'undefined' && Favorites.isFavorite(String(ponto.id));

        var distancia = null;
        if (state.userPosition && hasCoords(ponto)) {
            distancia = distanceKm(state.userPosition.lat, state.userPosition.lng, Number(ponto.lat), Number(ponto.lng));
        }

        var allLinePoints = state.pontos.slice().sort(function (a, b) { return (a.ordem || 0) - (b.ordem || 0); });

        Modal.open({
            ponto: ponto,
            next: next,
            horarios: horarios,
            lineColor: BUS_COLOR,
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
        var next = getNextDeparture(state.horarios);

        if (els.selectedPointName) els.selectedPointName.textContent = ponto.nome;
        if (els.selectedDistance) els.selectedDistance.textContent = getDistanceText(ponto);
        if (els.selectedAddress) els.selectedAddress.textContent = ponto.endereco + ' - ' + ponto.bairro;
        if (els.selectedLine) els.selectedLine.textContent = 'Rota Circular';
        if (els.selectedNext) els.selectedNext.textContent = next.label;

        renderSchedule(next.time);
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

    function createLineMarker(lat, lng) {
        var svg = [
            '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="36" viewBox="0 0 24 36">',
            '<path d="M12 0C5.4 0 0 5.4 0 12c0 9 12 24 12 24s12-15 12-24c0-6.6-5.4-12-12-12z" fill="' + BUS_COLOR + '"/>',
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
            var el = marker.getElement();
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

        state.pontos.filter(hasCoords).forEach(function (ponto) {
            var marker = createLineMarker(Number(ponto.lat), Number(ponto.lng))
                .bindPopup(
                    '<strong>' + escapeHtml(ponto.nome) + '</strong><br>' +
                    escapeHtml(ponto.endereco) + '<br>' +
                    escapeHtml(ponto.bairro)
                )
                .on('click', function () {
                    openPointModal(ponto.id);
                });

            enableMarkerKeyboard(marker, ponto, openPointModal);
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
            '<button class="schedule-tab' + (state.scheduleTab === 'uteis' ? ' active' : '') + '" data-tab="uteis">Dias Úteis</button>' +
            '<button class="schedule-tab' + (state.scheduleTab === 'sabado' ? ' active' : '') + '" data-tab="sabado">Sábado</button>' +
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

    function renderSchedule(nextTime) {
        if (!els.scheduleTable) return;

        var horarios = getHorario(state.horarios, state.scheduleTab);
        var html = buildScheduleTabs();
        var todayIsSunday = getCurrentDayType() === 'domingo';

        if (todayIsSunday) {
            html = '<div class="schedule-sunday-notice">Hoje é domingo &mdash; n&atilde;o h&aacute; opera&ccedil;&atilde;o de &ocirc;nibus em Barra Bonita. A tabela abaixo &eacute; de refer&ecirc;ncia para consulta.</div>' + html;
        }

        if (horarios.length === 0) {
            var emptyMsg = todayIsSunday
                ? 'Domingo n&atilde;o h&aacute; opera&ccedil;&atilde;o. Os hor&aacute;rios nas abas s&atilde;o apenas de refer&ecirc;ncia.'
                : 'Sem hor&aacute;rios para ' + (state.scheduleTab === 'uteis' ? 'dias &uacute;teis' : 's&aacute;bado') + '.';
            html += '<div class="schedule-row"><span class="schedule-time">' + emptyMsg + '</span></div>';
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
            if (todayIsSunday) {
                els.scheduleNote.textContent = 'Hoje é domingo e não há operação. A tabela mostra os horários de referência.';
            } else if (nextTime) {
                els.scheduleNote.textContent = 'Horário destacado indica a próxima saída.';
            } else {
                els.scheduleNote.textContent = 'Selecione um ponto para ver a próxima saída.';
            }
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
                    var next = getNextDeparture(state.horarios);
                    renderSchedule(next.time);
                } else {
                    renderSchedule();
                }
            });
        });
    }

    function getFilteredPoints() {
        var term = normalize(els.searchInput ? els.searchInput.value : '');
        var lista = state.distanceCache ? state.distanceCache.getAll() : pontosComDistancia(state.pontos, state.userPosition);

        if (term) {
            lista = lista.filter(function (ponto) {
                return normalize([ponto.nome, ponto.endereco, ponto.bairro].join(' ')).includes(term);
            });
        }

        var sortMode = state.distanceCache ? state.distanceCache.getSortMode() : 'ordem';
        return sortPointsByContext(lista, sortMode);
    }

    function getDiverseSuggestions() {
        var lista = state.distanceCache ? state.distanceCache.getAll() : pontosComDistancia(state.pontos, state.userPosition);
        var sortMode = state.distanceCache ? state.distanceCache.getSortMode() : 'ordem';
        var sorted = sortPointsByContext(lista, sortMode);
        var seenBairros = {};
        var result = [];
        for (var i = 0; i < sorted.length; i++) {
            if (result.length >= 10) break;
            var ponto = sorted[i];
            var bairroKey = normalize(ponto.bairro);
            if (!seenBairros[bairroKey]) {
                result.push(ponto);
                seenBairros[bairroKey] = true;
            }
        }
        return result.slice(0, 10);
    }

    function getDistanceText(ponto) {
        var withDist = (state.distanceCache && ponto) ? state.distanceCache.forSingle(ponto) : ponto;
        if (!withDist || withDist.distancia === undefined) {
            var arranged = pontosComDistancia([ponto], state.userPosition);
            withDist = arranged && arranged[0] ? arranged[0] : ponto;
        }
        if (typeof withDist.distancia === 'number') {
            return formatDistance(withDist.distancia);
        }
        return hasCoords(ponto) ? 'Com GPS' : 'Sem GPS';
    }

    function markSelectedCard() {
        document.querySelectorAll('[data-point-id]').forEach(function (card) {
            card.classList.toggle('selected', Number(card.dataset.pointId) === state.selectedPointId);
        });
    }

    function refreshLiveDepartures() {
        if (!state.horarios) return;
        var next = getNextDeparture(state.horarios);

        document.querySelectorAll('.point-next-time').forEach(function (el) {
            el.textContent = next.label;
            el.className = 'point-next-time ' + (next.minutes <= 5 ? 'now' : 'waiting');
        });

        if (els.selectedNext && state.selectedPointId != null) {
            els.selectedNext.textContent = next.label;
        }

        document.querySelectorAll('.schedule-time').forEach(function (el) {
            el.classList.toggle('active-time', el.textContent.trim() === next.time);
        });
    }

})();