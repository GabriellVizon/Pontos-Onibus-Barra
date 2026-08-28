(function () {

    var state = {
        pontos: [],
        horarios: [],
        pontosPlena: [],
        horariosPlena: null,
        userPosition: null,
        selectedPointId: null,
        visibleCount: 5,
        visibleCountPlena: 5,
        nearbyVisibleCount: 1,
        nearbyExpanded: false,
        nearbyResizeObserver: null,
        scheduleExpanded: false,
        map: null,
        markerLayer: null,
        userMarker: null,
        markers: new Map(),
        distanceCache: null,
        distanceCachePlena: null,
        scheduleLinha: 'circular',
        scheduleSentidoPlena: null,
        scheduleDiaTab: 'uteis',
        linhasDoPonto: []
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
        nearbyPriorityGrid: document.getElementById('nearbyPriorityGrid'),
        nearbyPriorityStatus: document.getElementById('nearbyPriorityStatus'),
        nearbyPriorityActions: document.getElementById('nearbyPriorityActions'),
        circularPointsSection: document.getElementById('circularPointsSection'),
        circularPointsCount: document.getElementById('circularPointsCount'),
        plenaPointsGrid: document.getElementById('plenaPointsGrid'),
        plenaSection: document.getElementById('plenaSection'),
        plenaDivider: document.getElementById('plenaDivider'),
        pageSubtitle: document.getElementById('pageSubtitle'),
        selectedPointName: document.getElementById('selectedPointName'),
        selectedDistance: document.getElementById('selectedDistance'),
        selectedAddress: document.getElementById('selectedAddress'),
        selectedLine: document.getElementById('selectedLine'),
        selectedNext: document.getElementById('selectedNext'),
        locationStatus: document.getElementById('locationStatus'),
        scheduleTable: document.getElementById('scheduleTable'),
        scheduleNote: document.getElementById('scheduleNote'),
        scheduleLineSelector: document.getElementById('scheduleLineSelector'),
        scheduleLineBtns: document.getElementById('scheduleLineBtns'),
        scheduleDirectionSelector: document.getElementById('scheduleDirectionSelector'),
        scheduleDirectionBtns: document.getElementById('scheduleDirectionBtns'),
        scheduleDynamicContent: document.getElementById('scheduleDynamicContent'),
        routeMap: document.getElementById('routeMap'),
        mapBtn: document.getElementById('mapBtn'),
    };

    init();

    async function init() {
        state.distanceCache = createDistanceCache(
            function () { return state.pontos; },
            function () { return state.userPosition; }
        );
        state.distanceCachePlena = createDistanceCache(
            function () { return state.pontosPlena; },
            function () { return state.userPosition; }
        );
        bindEvents();
        setupNearbyResponsiveObserver();
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
                    renderPlena();
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
            initMap();
            renderMapMarkers();
            render();
            renderPlena();
            renderScheduleCard(null);
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
                renderPlena();
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
            fetch('./dados/horarios.json'),
            fetch('./dados/pontos-plena.json').catch(function () { return { ok: false, json: function () { return []; } }; }),
            fetch('./dados/horarios-plena.json').catch(function () { return { ok: false, json: function () { return null; } }; })
        ]).then(function (responses) {
            if (!responses[0].ok || !responses[1].ok) {
                throw new Error('Falha ao carregar os arquivos JSON da Circular.');
            }
            return Promise.all([
                responses[0].json(),
                responses[1].json(),
                responses[2].ok ? responses[2].json() : Promise.resolve([]),
                responses[3].ok ? responses[3].json() : Promise.resolve(null)
            ]);
        }).then(function (data) {
            state.pontos = data[0];
            state.horarios = data[1];
            state.pontosPlena = Array.isArray(data[2]) ? data[2] : [];
            state.horariosPlena = data[3];

            if (state.horariosPlena && typeof carregarConfigPlena === 'function') {
                carregarConfigPlena(state.horariosPlena);
            }

            if (state.distanceCache) state.distanceCache.invalidate();
            if (state.distanceCachePlena) state.distanceCachePlena.invalidate();
            saveCache(state.pontos, state.horarios);

            if (typeof Favorites !== 'undefined') {
                var allIds = state.pontos.map(function (p) { return p.id; })
                    .concat(state.pontosPlena.map(function (p) { return p.id; }));
                Favorites.pruneFavorites(allIds);
            }
        });
    }

    function refresh() {
        var splash = document.getElementById('splash');
        if (splash) splash.classList.remove('hide');
        loadData().then(function () {
            renderMapMarkers();
            render();
            renderPlena();
            renderScheduleCard(state.selectedPointId ? state.pontos.find(function (p) { return p.id === state.selectedPointId; }) || state.pontosPlena.find(function (p) { return p.id === state.selectedPointId; }) : null);
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
                    renderPlena();
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
                    handleFavClick(favBtn);
                    return;
                }
                var card = event.target.closest('[data-point-id]');
                if (!card) return;
                cardClickEffect(card, function () {
                    openPointModal(Number(card.dataset.pointId), 'circular');
                });
            });
        }

        if (els.nearbyPriorityGrid) {
            els.nearbyPriorityGrid.addEventListener('click', function (event) {
                var card = event.target.closest('[data-point-id]');
                if (card) selectPoint(Number(card.dataset.pointId), false);
            });
        }
        if (els.nearbyPriorityActions) {
            els.nearbyPriorityActions.addEventListener('click', function (event) {
                var toggle = event.target.closest('#nearbyPriorityToggle');
                if (!toggle) return;
                state.nearbyExpanded = !state.nearbyExpanded;
                renderNearbyPriority(getFilteredPoints());
            });
        }
        if (els.plenaPointsGrid) {
            els.plenaPointsGrid.addEventListener('click', function (event) {
                var favBtn = event.target.closest('.fav-btn');
                if (favBtn) {
                    event.stopPropagation();
                    handleFavClick(favBtn);
                    return;
                }
                var card = event.target.closest('[data-point-id]');
                if (!card) return;
                cardClickEffect(card, function () {
                    openPointModal(Number(card.dataset.pointId), 'plena');
                });
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

    function handleFavClick(favBtn) {
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
                var linhaTag = ponto._linha === 'plena'
                    ? '<span class="search-linha-tag plena-tag">Plena</span>'
                    : '';
                return [
                    '<div class="search-result-item" data-point-id="' + ponto.id + '" data-linha="' + (ponto._linha || 'circular') + '">',
                    '<div class="search-result-name"><i class="ti ti-map-pin"></i>' + escapeHtml(ponto.nome) + linhaTag + '</div>',
                    '<div class="search-result-desc">' + escapeHtml(ponto.endereco) + ' - ' + escapeHtml(ponto.bairro) + '</div>',
                    '</div>'
                ].join('');
            }).join('');
        }

        els.searchResults.classList.add('show');
        els.searchResults.querySelectorAll('[data-point-id]').forEach(function (item) {
            item.addEventListener('click', function () {
                var linha = this.getAttribute('data-linha') || 'circular';
                openPointModal(Number(item.dataset.pointId), linha);
                els.searchInput.value = '';
                hideSearchSuggestions();
                render();
                renderPlena();
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

        var results = getAllPointsWithLinha().filter(function (ponto) {
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
                if (state.distanceCachePlena) state.distanceCachePlena.invalidate();
                if (els.locationStatus) els.locationStatus.textContent = 'GPS ATIVO';
                updateUserMarker();
                render();
                renderPlena();
                selectNearestPoint();
            },
            function () {
                if (state.distanceCache) state.distanceCache.invalidate();
                if (state.distanceCachePlena) state.distanceCachePlena.invalidate();
                if (els.locationStatus) els.locationStatus.textContent = 'GPS NEGADO';
                render();
                renderPlena();
            },
            { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 }
        );
    }

    /* ========================================
       CIRCULAR RENDER
       ======================================== */

    function render() {
        if (!els.pointsGrid) return;
        var ordered = getFilteredPoints();
        renderNearbyPriority(ordered);
        var pontos = state.userPosition ? ordered.slice(5) : ordered;
        var limit = 5;
        var expanded = pontos.length > limit && state.visibleCount >= pontos.length;
        var visible = expanded ? pontos : pontos.slice(0, limit);
        var count = document.getElementById('circularPointsCount');
        if (count) count.textContent = pontos.length + (pontos.length === 1 ? ' ponto' : ' pontos');
        if (els.pageSubtitle) els.pageSubtitle.textContent = state.userPosition ? 'Pontos ordenados pela distância da sua localização.' : 'Permita a localização para destacar os pontos mais próximos.';
        if (!pontos.length) showEmpty(els.pointsGrid, state.userPosition ? 'Não há outros pontos para mostrar.' : 'Nenhum ponto encontrado para essa busca.');
        else els.pointsGrid.innerHTML = visible.map(function (p) { return renderPointCard(p, 'circular'); }).join('');
        var container = document.getElementById('showMoreContainer');
        if (container) {
            if (pontos.length > limit) {
                container.innerHTML = '<button class="show-more-btn" id="showMoreBtn" type="button" aria-expanded="' + expanded + '"><i class="ti ti-' + (expanded ? 'minus' : 'plus') + '"></i>' + (expanded ? 'Mostrar menos pontos' : 'Mostrar mais ' + (pontos.length - limit) + ' pontos') + '</button>';
                container.querySelector('#showMoreBtn').addEventListener('click', function () {
                    state.visibleCount = expanded ? limit : pontos.length;
                    render();
                    if (expanded) document.getElementById('circularPointsSection').scrollIntoView({behavior:'smooth',block:'start'});
                });
            } else container.innerHTML = '';
        }
        markSelectedCard();
        if (state.userPosition) renderNearbyPriority(getFilteredPoints());
    }

    /* ========================================
       PLENA RENDER
       ======================================== */

    function renderPlena() {
        if (!state.pontosPlena || state.pontosPlena.length === 0) {
            if (els.plenaSection) els.plenaSection.style.display = 'none';
            if (els.plenaDivider) els.plenaDivider.style.display = 'none';
            return;
        }

        if (els.plenaDivider) els.plenaDivider.style.display = '';
        if (els.plenaSection) els.plenaSection.style.display = '';

        var pontos = getFilteredPointsPlena();
        var showAll = state.visibleCountPlena >= pontos.length;
        var visible = showAll ? pontos : pontos.slice(0, state.visibleCountPlena);

        if (!els.plenaPointsGrid) return;

        if (pontos.length === 0) {
            els.plenaPointsGrid.innerHTML = '<div class="empty-state">Nenhum ponto Plena encontrado para essa busca.</div>';
        } else {
            els.plenaPointsGrid.innerHTML = visible.map(function (p) {
                return renderPointCard(p, 'plena');
            }).join('');
        }

        var container = document.getElementById('plenaShowMoreContainer');
        if (container) {
            if (pontos.length > state.visibleCountPlena) {
                container.innerHTML = '<button class="show-more-btn" id="plenaShowMoreBtn">Ver mais pontos (' + pontos.length + ' total)</button>';
                var btn = document.getElementById('plenaShowMoreBtn');
                if (btn) btn.addEventListener('click', function () {
                    state.visibleCountPlena = pontos.length;
                    renderPlena();
                });
            } else {
                container.innerHTML = '';
            }
        }
    }

    function getFilteredPointsPlena() {
        var term = normalize(els.searchInput ? els.searchInput.value : '');
        var lista = state.distanceCachePlena
            ? state.distanceCachePlena.getAll()
            : pontosComDistancia(state.pontosPlena, state.userPosition);

        if (term) {
            lista = lista.filter(function (ponto) {
                return normalize([ponto.nome, ponto.endereco, ponto.bairro].join(' ')).includes(term);
            });
        }

        var sortMode = state.distanceCachePlena ? state.distanceCachePlena.getSortMode() : 'ordem';
        return sortPointsByContext(lista, sortMode);
    }

    /* ========================================
       POINT CARD (both lines)
       ======================================== */

    function renderPointCard(ponto, linha) {
        var next;
        var nextClass;

        if (linha === 'plena') {
            var resultado = typeof encontrarProximoPlena === 'function'
                ? encontrarProximoPlena(ponto.id)
                : { encontrado: false };
            if (resultado.encontrado) {
                var minRest = resultado.minutosRestantes;
                var label;
                if (resultado.estado === 'chegando') label = 'Agora';
                else if (minRest < 60) label = minRest + ' min';
                else {
                    var h = Math.floor(minRest / 60);
                    var m = minRest % 60;
                    label = m === 0 ? h + 'h' : h + 'h ' + m + 'min';
                }
                next = { label: label, minutes: minRest, time: resultado.horario };
                nextClass = minRest <= 5 ? 'now' : 'waiting';
            } else {
                next = { label: 'Sem horário', minutes: Infinity, time: '--' };
                nextClass = 'waiting';
            }
        } else {
            next = getNextDeparture(state.horarios);
            nextClass = next.minutes <= 5 ? 'now' : 'waiting';
        }

        var selected = ponto.id === state.selectedPointId ? ' selected' : '';
        var isFav = typeof Favorites !== 'undefined' && Favorites.isFavorite(String(ponto.id));
        var distancia = getDistanceText(ponto, linha);
        var dotColor = linha === 'plena' ? '#2196f3' : BUS_COLOR;

        var linhaTag = linha === 'plena'
            ? '<span class="point-line-tag plena">PLENA</span>'
            : '';

        return [
            '<div class="point-card' + selected + '" data-point-id="' + ponto.id + '" data-linha="' + linha + '">',
            '<div class="point-card-header">',
            '<div class="point-card-title-row">',
            '<h3 class="point-card-title">' + escapeHtml(ponto.nome) + '</h3>',
            linhaTag,
            '</div>',
            '<div class="card-header-right">',
            '<span class="point-distance">' + escapeHtml(distancia) + '</span>',
            '<button class="fav-btn' + (isFav ? ' favorited' : '') + '" data-id="' + ponto.id + '" aria-label="Favoritar">',
            '<i class="ti ti-' + (isFav ? 'heart-filled' : 'heart') + '"></i>',
            '</button>',
            '</div>',
            '</div>',
            '<p class="point-address">' + escapeHtml(ponto.endereco) + '</p>',
            '<div class="point-next-bus" style="border-left:3px solid ' + dotColor + '">',
            '<span class="point-next-label"><i class="ti ti-bus" style="color:' + dotColor + '"></i> Próximo ônibus</span>',
            '<span class="point-next-time ' + nextClass + '">' + escapeHtml(next.label) + '</span>',
            '</div>',
            '<div class="point-meta">',
            '<span class="point-chip">' + escapeHtml(ponto.bairro || '—') + '</span>',
            '</div>',
            '</div>'
        ].join('');
    }

    function getDistanceText(ponto, linha) {
        var cache = linha === 'plena' ? state.distanceCachePlena : state.distanceCache;
        var withDist = (cache && ponto) ? cache.forSingle(ponto) : ponto;
        if (!withDist || withDist.distancia === undefined) {
            var arranged = pontosComDistancia([ponto], state.userPosition);
            withDist = arranged && arranged[0] ? arranged[0] : ponto;
        }
        if (typeof withDist.distancia === 'number') {
            return formatDistance(withDist.distancia);
        }
        return hasCoords(ponto) ? 'Com GPS' : 'Sem GPS';
    }

    /* ========================================
       MODAL OPEN (both lines)
       ======================================== */

    function openPointModal(pointId, linhaOrigem) {
        var isPlena = linhaOrigem === 'plena';
        var ponto;

        if (isPlena) {
            ponto = state.pontosPlena.find(function (p) { return p.id === pointId; });
        } else {
            ponto = state.pontos.find(function (p) { return p.id === pointId; });
        }
        if (!ponto) return;

        var linhas = [];
        if (isPlena) {
            linhas.push('plena');
            var circularPoint = state.pontos.find(function (p) {
                return Math.abs(p.lat - ponto.lat) < 0.0005 && Math.abs(p.lng - ponto.lng) < 0.0005;
            });
            if (circularPoint) linhas.unshift('circular');
        } else {
            linhas.push('circular');
            var plenaPoint = state.pontosPlena.find(function (p) {
                return Math.abs(p.lat - ponto.lat) < 0.0005 && Math.abs(p.lng - ponto.lng) < 0.0005;
            });
            if (plenaPoint) linhas.push('plena');
        }

        var next;
        if (isPlena && linhas.length === 1) {
            var res = typeof encontrarProximoPlena === 'function'
                ? encontrarProximoPlena(ponto.id) : null;
            if (res && res.encontrado) {
                var minR = res.minutosRestantes;
                var lbl;
                if (res.estado === 'chegando') lbl = 'Agora';
                else if (minR < 60) lbl = minR + ' min';
                else {
                    var hh = Math.floor(minR / 60);
                    var mm = minR % 60;
                    lbl = mm === 0 ? hh + 'h' : hh + 'h ' + mm + 'min';
                }
                next = { time: res.horario, label: lbl, minutes: minR };
            } else {
                next = { time: '--', label: 'Sem horário', minutes: Infinity };
            }
        } else {
            next = getNextDeparture(state.horarios);
        }

        var horarios = isPlena ? [] : getHorario(state.horarios, getCurrentDayType());
        var isFav = typeof Favorites !== 'undefined' && Favorites.isFavorite(String(ponto.id));

        var distancia = null;
        if (state.userPosition && hasCoords(ponto)) {
            distancia = distanceKm(state.userPosition.lat, state.userPosition.lng, Number(ponto.lat), Number(ponto.lng));
        }

        var allLinePoints = state.pontos.slice().sort(function (a, b) { return (a.ordem || 0) - (b.ordem || 0); });

        Modal.open({
            ponto: ponto,
            linhas: linhas,
            next: next,
            horarios: horarios,
            lineColor: isPlena ? '#2196f3' : BUS_COLOR,
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
        var linhaOrigem = 'circular';
        if (!ponto) {
            ponto = state.pontosPlena.find(function (item) { return item.id === pointId; });
            linhaOrigem = 'plena';
        }
        if (!ponto) return;

        state.selectedPointId = pointId;

        var linhas = [];
        if (linhaOrigem === 'plena') {
            linhas.push('plena');
            var circularPoint = state.pontos.find(function (p) {
                return Math.abs(p.lat - ponto.lat) < 0.0005 && Math.abs(p.lng - ponto.lng) < 0.0005;
            });
            if (circularPoint) linhas.unshift('circular');
        } else {
            linhas.push('circular');
            var plenaPoint = state.pontosPlena.find(function (p) {
                return Math.abs(p.lat - ponto.lat) < 0.0005 && Math.abs(p.lng - ponto.lng) < 0.0005;
            });
            if (plenaPoint) linhas.push('plena');
        }

        state.linhasDoPonto = linhas;
        state.scheduleLinha = linhas.length === 1 ? linhas[0] : 'circular';
        state.scheduleDiaTab = 'uteis';

        if (state.scheduleLinha === 'plena') {
            var sentidos = typeof obterSentidosPlena === 'function' ? obterSentidosPlena(ponto.id) : [];
            state.scheduleSentidoPlena = sentidos.length > 0 ? sentidos[0].id : null;
        } else {
            state.scheduleSentidoPlena = null;
        }

        if (els.selectedPointName) els.selectedPointName.textContent = ponto.nome;
        if (els.selectedDistance) els.selectedDistance.textContent = getDistanceText(ponto);
        if (els.selectedAddress) els.selectedAddress.textContent = ponto.endereco + ' - ' + (ponto.bairro || '');

        renderScheduleCard(ponto);
        markSelectedCard();
        focusPointOnMap(ponto);

        if (!silent) {
            var detailCard = document.querySelector('.line-detail-card');
            if (detailCard) detailCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }

    /* ========================================
       MAP
       ======================================== */

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

    function createLineMarker(lat, lng, color) {
        var c = color || BUS_COLOR;
        var svg = [
            '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="36" viewBox="0 0 24 36">',
            '<path d="M12 0C5.4 0 0 5.4 0 12c0 9 12 24 12 24s12-15 12-24c0-6.6-5.4-12-12-12z" fill="' + c + '"/>',
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

    function enableMarkerKeyboard(marker, ponto, onActivate, linha) {
        marker.on('add', function () {
            var el = marker.getElement();
            if (!el) return;
            el.setAttribute('role', 'button');
            el.setAttribute('tabindex', '0');
            el.setAttribute('aria-label', ponto.nome + ' - ' + ponto.endereco);
            el.addEventListener('keydown', function (e) {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onActivate(ponto.id, linha);
                }
            });
        });
    }

    function renderMapMarkers() {
        if (!state.map || !state.markerLayer) return;

        state.markerLayer.clearLayers();
        state.markers.clear();

        state.pontos.filter(hasCoords).forEach(function (ponto) {
            var marker = createLineMarker(Number(ponto.lat), Number(ponto.lng), BUS_COLOR)
                .bindPopup(
                    '<strong>' + escapeHtml(ponto.nome) + '</strong><br>' +
                    escapeHtml(ponto.endereco) + '<br>' +
                    escapeHtml(ponto.bairro) +
                    '<br><small style="color:#e74c3c">Circular</small>'
                )
                .on('click', function () {
                    openPointModal(ponto.id, 'circular');
                });
            enableMarkerKeyboard(marker, ponto, openPointModal, 'circular');
            marker.addTo(state.markerLayer);
            state.markers.set(ponto.id, marker);
        });

        state.pontosPlena.filter(hasCoords).forEach(function (ponto) {
            var marker = createLineMarker(Number(ponto.lat), Number(ponto.lng), '#2196f3')
                .bindPopup(
                    '<strong>' + escapeHtml(ponto.nome) + '</strong><br>' +
                    escapeHtml(ponto.endereco) + '<br>' +
                    escapeHtml(ponto.bairro) +
                    '<br><small style="color:#2196f3">Plena</small>'
                )
                .on('click', function () {
                    openPointModal(ponto.id, 'plena');
                });
            enableMarkerKeyboard(marker, ponto, openPointModal, 'plena');
            marker.addTo(state.markerLayer);
            state.markers.set('plena_' + ponto.id, marker);
        });
    }

    function focusPointOnMap(ponto) {
        if (!state.map || !hasCoords(ponto)) return;

        var latLng = [Number(ponto.lat), Number(ponto.lng)];
        state.map.invalidateSize();
        state.map.setView(latLng, 16, { animate: true });

        var marker = state.markers.get(ponto.id) || state.markers.get('plena_' + ponto.id);
        if (marker) marker.openPopup();
    }

    function fitMapToPoints() {
        if (!state.map) return;

        var allPoints = state.pontos.concat(state.pontosPlena).filter(hasCoords);
        if (allPoints.length === 0) return;

        state.map.invalidateSize();
        var bounds = L.latLngBounds(allPoints.map(function (ponto) {
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

    /* ========================================
       NEARBY PRIORITY
       ======================================== */
    function selectNearestPoint() {
        if (!state.userPosition) return;
        var nearest = getFilteredPoints().filter(function (p) { return hasCoords(p) && typeof p.distancia === 'number'; })[0];
        if (nearest) selectPoint(nearest.id, true);
    }

    function getNearbyColumnCount(width) {
        if (width < 600) return 1;
        if (width < 1000) return 2;
        if (width < 1250) return 3;
        if (width < 1500) return 4;
        return 5;
    }

    function setupNearbyResponsiveObserver() {
        if (!els.nearbyPriorityGrid || typeof ResizeObserver === 'undefined') return;
        var scheduled = false;
        state.nearbyResizeObserver = new ResizeObserver(function (entries) {
            if (scheduled || !entries.length) return;
            scheduled = true;
            requestAnimationFrame(function () {
                scheduled = false;
                var width = entries[0].contentRect.width || els.nearbyPriorityGrid.clientWidth;
                var nextCount = getNearbyColumnCount(width);
                if (nextCount !== state.nearbyVisibleCount) {
                    state.nearbyVisibleCount = nextCount;
                    renderNearbyPriority(getFilteredPoints());
                }
            });
        });
        state.nearbyResizeObserver.observe(els.nearbyPriorityGrid);
        state.nearbyVisibleCount = getNearbyColumnCount(els.nearbyPriorityGrid.clientWidth);
    }

    function renderNearbyPriority(ordered) {
        if (!els.nearbyPriorityGrid) return;
        if (!state.userPosition) {
            els.nearbyPriorityGrid.style.setProperty('--nearby-columns', '1');
            els.nearbyPriorityGrid.innerHTML = '<div class="nearby-priority-empty"><i class="ti ti-location"></i><span>Permita a localização para ordenar e selecionar automaticamente o ponto mais próximo.</span></div>';
            if (els.nearbyPriorityStatus) els.nearbyPriorityStatus.textContent = 'Aguardando GPS';
            if (els.nearbyPriorityActions) els.nearbyPriorityActions.innerHTML = '';
            return;
        }
        var allNearby = ordered.filter(function (p) {
            return hasCoords(p) && typeof p.distancia === 'number';
        }).slice(0, 5);
        var fitCount = Math.max(1, Math.min(5, state.nearbyVisibleCount || 1));
        var visible = state.nearbyExpanded ? allNearby : allNearby.slice(0, fitCount);
        var hiddenCount = Math.max(0, allNearby.length - visible.length);
        var columns = state.nearbyExpanded ? Math.min(fitCount, allNearby.length) : Math.min(fitCount, visible.length);
        els.nearbyPriorityGrid.style.setProperty('--nearby-columns', String(Math.max(1, columns)));
        if (els.nearbyPriorityStatus) {
            els.nearbyPriorityStatus.textContent = 'Mostrando ' + visible.length + ' de ' + allNearby.length;
        }
        els.nearbyPriorityGrid.innerHTML = visible.map(function (p, index) {
            var badge = index === 0
                ? '<span class="nearby-rank nearest">Mais próximo</span>'
                : '<span class="nearby-rank">' + (index + 1) + 'º mais próximo</span>';
            return '<button type="button" class="nearby-card' + (p.id === state.selectedPointId ? ' selected' : '') + '" data-point-id="' + p.id + '" aria-label="Selecionar ' + escapeAttr(p.nome) + '">' +
                '<span class="nearby-card-top">' + badge + '<strong>' + escapeHtml(formatDistance(p.distancia)) + '</strong></span>' +
                '<span class="nearby-card-name">' + escapeHtml(p.nome) + '</span>' +
                '<span class="nearby-card-address">' + escapeHtml(p.endereco || '') + '</span></button>';
        }).join('');
        if (els.nearbyPriorityActions) {
            if (allNearby.length > fitCount) {
                els.nearbyPriorityActions.innerHTML = '<button type="button" class="nearby-toggle-btn" id="nearbyPriorityToggle" aria-expanded="' + state.nearbyExpanded + '">' +
                    '<i class="ti ti-' + (state.nearbyExpanded ? 'minus' : 'plus') + '"></i>' +
                    (state.nearbyExpanded ? 'Mostrar menos' : 'Mostrar mais ' + hiddenCount) + '</button>';
            } else {
                els.nearbyPriorityActions.innerHTML = '';
            }
        }
    }

    /* ========================================
       SCHEDULE CARD (Circular + Plena)
       ======================================== */

    function subtractMinutes(timeStr, minutes) {
        var parts = timeStr.split(':');
        var total = parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10) - minutes;
        if (total < 0) total += 1440;
        var h = Math.floor(total / 60);
        var m = total % 60;
        return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m;
    }

    function computeNextForSchedule() {
        if (state.scheduleLinha === 'plena' && state.scheduleSentidoPlena) {
            if (state.selectedPointId && typeof encontrarPassagensPlena === 'function') {
                var res = encontrarPassagensPlena(
                    state.selectedPointId,
                    state.scheduleSentidoPlena,
                    state.scheduleDiaTab
                );
                if (res.encontrado) {
                    var minR = res.minutosRestantes;
                    var lbl;
                    if (res.estado === 'chegando') lbl = 'Agora';
                    else if (minR < 60) lbl = minR + ' min';
                    else {
                        var h = Math.floor(minR / 60);
                        var m = minR % 60;
                        lbl = m === 0 ? h + 'h' : h + 'h ' + m + 'min';
                    }
                    return { time: res.horario, label: lbl, minutes: minR };
                }
                return { time: '--', label: 'Sem horário', minutes: Infinity };
            }
            var sentido = CONFIG_PLENA && CONFIG_PLENA.sentidos
                ? CONFIG_PLENA.sentidos.find(function (s) { return s.id === state.scheduleSentidoPlena; })
                : null;
            if (sentido && sentido.horarios) {
                var lista = sentido.horarios[state.scheduleDiaTab];
                if (lista && lista.length > 0) {
                    var agora = new Date();
                    var agoraMin = agora.getHours() * 60 + agora.getMinutes();
                    var proximo = null;
                    for (var i = 0; i < lista.length; i++) {
                        var parts = lista[i].split(':');
                        var hMin = parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
                        if (hMin >= agoraMin) { proximo = lista[i]; break; }
                    }
                    if (proximo) {
                        var pParts = proximo.split(':');
                        var pMin = parseInt(pParts[0], 10) * 60 + parseInt(pParts[1], 10);
                        var diff = pMin - agoraMin;
                        var lbl2 = diff <= 1 ? 'Agora' : diff < 60 ? diff + ' min' : Math.floor(diff / 60) + 'h';
                        return { time: proximo, label: lbl2, minutes: diff };
                    }
                    return { time: '--', label: 'Encerrado', minutes: Infinity };
                }
            }
            return { time: '--', label: 'Sem horário', minutes: Infinity };
        }
        return getNextDeparture(state.horarios);
    }

    function renderScheduleCard(ponto) {
        var next = computeNextForSchedule();

        if (els.selectedLine) {
            if (state.selectedPointId) {
                els.selectedLine.textContent = state.scheduleLinha === 'plena' ? 'Plena' : 'Rota Circular';
            } else {
                els.selectedLine.textContent = state.scheduleLinha === 'plena' ? 'Plena' : 'Rota Circular';
            }
        }
        if (els.selectedNext) els.selectedNext.textContent = state.selectedPointId ? next.label : 'Selecione um ponto';

        renderLineSelector();
        renderDirectionSelector();
        renderScheduleTable(next.time);

        if (els.scheduleNote) {
            if (state.selectedPointId && next.time && next.time !== '--') {
                els.scheduleNote.textContent = 'Horário destacado indica a próxima saída.';
            } else if (!state.selectedPointId) {
                els.scheduleNote.textContent = 'Horários gerais da linha. Selecione um ponto para ver a próxima saída.';
            } else {
                els.scheduleNote.textContent = 'Selecione um ponto para ver a próxima saída.';
            }
        }
    }

    function renderLineSelector() {
        var container = els.scheduleLineSelector;
        var btnsContainer = els.scheduleLineBtns;
        if (!container || !btnsContainer) return;

        var linhas = ['circular'];
        if (CONFIG_PLENA && CONFIG_PLENA.sentidos && CONFIG_PLENA.sentidos.length > 0) {
            linhas.push('plena');
        }

        container.style.display = '';
        var html = '';
        linhas.forEach(function (l) {
            var nome = l === 'circular' ? 'Circular de Barra Bonita' : 'Ônibus Plena';
            var cls = l === state.scheduleLinha ? 'schedule-sel-btn active' : 'schedule-sel-btn';
            var dotColor = l === 'circular' ? BUS_COLOR : '#2196f3';
            html += '<button class="' + cls + '" data-linha="' + l + '">' +
                '<span class="schedule-sel-dot" style="background:' + dotColor + '"></span>' +
                nome +
                '</button>';
        });
        btnsContainer.innerHTML = html;

        btnsContainer.querySelectorAll('.schedule-sel-btn').forEach(function (btn) {
            btn.addEventListener('click', function () {
                state.scheduleLinha = this.getAttribute('data-linha');

                if (state.scheduleLinha === 'plena') {
                    var sentidos = typeof obterSentidosPlena === 'function'
                        ? obterSentidosPlena(state.selectedPointId) : [];
                    if (sentidos.length === 0 && CONFIG_PLENA && CONFIG_PLENA.sentidos && CONFIG_PLENA.sentidos.length > 0) {
                        sentidos = CONFIG_PLENA.sentidos;
                    }
                    state.scheduleSentidoPlena = sentidos.length > 0 ? sentidos[0].id : null;
                } else {
                    state.scheduleSentidoPlena = null;
                }

                state.scheduleDiaTab = 'uteis';
                renderScheduleCard(null);
            });
        });
    }

    function renderDirectionSelector() {
        var container = els.scheduleDirectionSelector;
        var btnsContainer = els.scheduleDirectionBtns;
        if (!container || !btnsContainer) return;

        if (state.scheduleLinha !== 'plena') {
            container.style.display = 'none';
            return;
        }

        var sentidos = typeof obterSentidosPlena === 'function'
            ? obterSentidosPlena(state.selectedPointId) : [];
        if (sentidos.length === 0 && CONFIG_PLENA && CONFIG_PLENA.sentidos && CONFIG_PLENA.sentidos.length > 0) {
            sentidos = CONFIG_PLENA.sentidos;
        }

        if (sentidos.length <= 1) {
            container.style.display = 'none';
            if (sentidos.length === 1) state.scheduleSentidoPlena = sentidos[0].id;
            return;
        }

        container.style.display = '';
        var html = '';
        sentidos.forEach(function (s) {
            var cls = s.id === state.scheduleSentidoPlena ? 'schedule-sel-btn active' : 'schedule-sel-btn';
            html += '<button class="' + cls + '" data-sentido="' + s.id + '">' + escapeHtml(s.nome) + '</button>';
        });
        btnsContainer.innerHTML = html;

        btnsContainer.querySelectorAll('.schedule-sel-btn').forEach(function (btn) {
            btn.addEventListener('click', function () {
                state.scheduleSentidoPlena = this.getAttribute('data-sentido');
                state.scheduleDiaTab = 'uteis';
                renderScheduleCard(null);
            });
        });
    }

    function renderScheduleTable(nextTime) {
        var container = els.scheduleDynamicContent;
        if (!container) return;
        var html = '', abas = [], horarios = [];
        if (state.scheduleLinha === 'plena' && state.scheduleSentidoPlena) {
            if (state.selectedPointId && typeof obterAbasDiaPlena === 'function') abas = obterAbasDiaPlena(state.scheduleSentidoPlena,state.selectedPointId);
            if (!abas.length && CONFIG_PLENA && CONFIG_PLENA.sentidos) {
                var sentido = CONFIG_PLENA.sentidos.find(function(x){return x.id===state.scheduleSentidoPlena;});
                if(sentido&&sentido.horarios){['uteis','sabado','domingo'].forEach(function(id){if(sentido.horarios[id]&&sentido.horarios[id].length)abas.push({id:id,nome:id==='uteis'?'Dias Úteis':id==='sabado'?'Sábado':'Domingo'});});}
            }
            if (state.selectedPointId && typeof obterHorariosPlena === 'function') horarios=obterHorariosPlena(state.scheduleSentidoPlena,state.scheduleDiaTab,state.selectedPointId);
            if(!horarios.length&&CONFIG_PLENA&&CONFIG_PLENA.sentidos){var sh=CONFIG_PLENA.sentidos.find(function(x){return x.id===state.scheduleSentidoPlena;});var lista=sh&&sh.horarios?sh.horarios[state.scheduleDiaTab]:[];if(Array.isArray(lista))horarios=lista.slice();}
        } else {
            if(state.horarios){['uteis','sabado','domingo'].forEach(function(id){if(state.horarios[id]&&state.horarios[id].length)abas.push({id:id,nome:id==='uteis'?'Dias Úteis':id==='sabado'?'Sábado':'Domingo'});});}
            horarios=getHorario(state.horarios,state.scheduleDiaTab);
        }
        if(abas.length>1){html+='<div class="schedule-day-tabs">';abas.forEach(function(a){html+='<button class="schedule-day-tab'+(a.id===state.scheduleDiaTab?' active':'')+'" data-dia="'+a.id+'">'+escapeHtml(a.nome)+'</button>';});html+='</div>';}
        if(!horarios.length) html+='<div class="schedule-empty-msg">Sem horários disponíveis para este dia.</div>';
        else {
            var now=new Date(), nowMinutes=now.getHours()*60+now.getMinutes(), passed=[], future=[];
            horarios.forEach(function(t){var m=timeToMinutes(t);if(m!==null&&m<nowMinutes)passed.push(t);else future.push(t);});
            var current=future.length?future[0]:null, visible=state.scheduleExpanded?future:future.slice(0,6), hidden=Math.max(0,future.length-6);
            html+='<div class="schedule-legend"><span><i class="legend-dot passed"></i>Passou</span><span><i class="legend-dot current"></i>Próximo</span><span><i class="legend-dot upcoming"></i>Mais tarde</span></div>';
            if(visible.length){html+='<div class="schedule-timeline">';visible.forEach(function(t){var active=t===current,diff=Math.max(0,timeToMinutes(t)-nowMinutes);html+='<div class="schedule-time-card '+(active?'current':'upcoming')+'"><span class="schedule-status">'+(active?'Próximo ônibus':'Mais tarde')+'</span><strong class="schedule-time">'+escapeHtml(t)+'</strong>'+(active?'<span class="schedule-countdown">'+(diff<=1?'Agora':diff+' min')+'</span>':'')+'</div>';});html+='</div>';}
            else html+='<div class="schedule-empty-msg schedule-ended"><i class="ti ti-moon-stars"></i><strong>Operação encerrada hoje</strong><span>Consulte outro dia nas abas acima.</span></div>';
            html+='<div class="schedule-actions">';
            if(future.length>6)html+='<button type="button" class="schedule-toggle-btn" id="scheduleFutureToggle"><i class="ti ti-'+(state.scheduleExpanded?'minus':'plus')+'"></i>'+(state.scheduleExpanded?'Mostrar menos horários':'Ver mais '+hidden+' horários')+'</button>';
            if(passed.length)html+='<details class="passed-details"><summary><span class="passed-summary-main"><i class="ti ti-history"></i><span><strong>Horários passados</strong><small>Consulte as saídas anteriores de hoje</small></span></span><span class="passed-count">'+passed.length+'</span><i class="ti ti-chevron-down passed-chevron"></i></summary><div class="passed-times">'+passed.map(function(t){return '<span>'+escapeHtml(t)+'</span>';}).join('')+'</div></details>';
            html+='</div>';
        }
        container.innerHTML=html;
        container.querySelectorAll('.schedule-day-tab').forEach(function(tab){tab.addEventListener('click',function(){state.scheduleDiaTab=this.dataset.dia;state.scheduleExpanded=false;renderScheduleCard(null);});});
        var toggle=container.querySelector('#scheduleFutureToggle');if(toggle)toggle.addEventListener('click',function(){state.scheduleExpanded=!state.scheduleExpanded;renderScheduleCard(null);});
    }

    /* ========================================
       SEARCH + FILTERS
       ======================================== */

    function getAllPointsWithLinha() {
        var circular = state.pontos.map(function (p) {
            return Object.assign({}, p, { _linha: 'circular' });
        });
        var plena = state.pontosPlena.map(function (p) {
            return Object.assign({}, p, { _linha: 'plena' });
        });
        return circular.concat(plena);
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
        var allPoints = getAllPointsWithLinha();
        var lista = allPoints.map(function (p) {
            var cache = p._linha === 'plena' ? state.distanceCachePlena : state.distanceCache;
            if (cache) return cache.forSingle(p);
            var arranged = pontosComDistancia([p], state.userPosition);
            return arranged && arranged[0] ? arranged[0] : p;
        });

        var seenBairros = {};
        var result = [];
        for (var i = 0; i < lista.length; i++) {
            if (result.length >= 10) break;
            var ponto = lista[i];
            var bairroKey = normalize(ponto.bairro);
            if (!seenBairros[bairroKey]) {
                result.push(ponto);
                seenBairros[bairroKey] = true;
            }
        }
        return result.slice(0, 10);
    }

    function markSelectedCard() {
        document.querySelectorAll('[data-point-id]').forEach(function (card) {
            card.classList.toggle('selected', Number(card.dataset.pointId) === state.selectedPointId);
        });
    }

    function refreshLiveDepartures() {
        if (!state.horarios && state.scheduleLinha !== 'plena') return;

        if (state.selectedPointId != null) {
            var ponto = state.pontos.find(function (p) { return p.id === state.selectedPointId; })
                || state.pontosPlena.find(function (p) { return p.id === state.selectedPointId; });
            if (ponto) {
                var next = computeNextForSchedule();
                if (els.selectedNext) els.selectedNext.textContent = next.label;

                var dynamicContent = els.scheduleDynamicContent;
                if (dynamicContent) {
                    dynamicContent.querySelectorAll('.schedule-time').forEach(function (el) {
                        el.classList.toggle('active-time', el.textContent.trim() === next.time);
                    });
                }
            }
        }

        var fallbackNext = getNextDeparture(state.horarios);
        document.querySelectorAll('.point-next-time').forEach(function (el) {
            el.textContent = fallbackNext.label;
            el.className = 'point-next-time ' + (fallbackNext.minutes <= 5 ? 'now' : 'waiting');
        });
    }

    /* ========================================
       GLOBAL: obterPontosPlena (para modal route tab)
       ======================================== */

    window.obterPontosPlena = function (ids) {
        if (!Array.isArray(ids)) return [];
        return ids.map(function (id) {
            return state.pontosPlena.find(function (p) { return p.id === id; });
        }).filter(Boolean);
    };

})();
