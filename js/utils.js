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

var BUS_COLOR = '#e74c3c';

function normalize(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function toRad(value) {
  return value * Math.PI / 180;
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

function getCurrentDayType() {
  var day = new Date().getDay();
  if (day === 0) return 'domingo';
  if (day === 6) return 'sabado';
  return 'uteis';
}

function getHorario(horarios, dayType) {
  if (!horarios) return [];
  if (Array.isArray(horarios)) return horarios;
  var day = dayType || getCurrentDayType();
  return (horarios[day] && Array.isArray(horarios[day])) ? horarios[day] : [];
}

function getNextDeparture(horarios) {
  var horariosLinha = getHorario(horarios);
  if (horariosLinha.length === 0) {
    return { time: '--', label: 'Sem horário', minutes: Number.POSITIVE_INFINITY };
  }

  var now = new Date();
  var currentMinutes = now.getHours() * 60 + now.getMinutes();
  var departures = horariosLinha
    .map(function (horario) {
      var parts = horario.split(':').map(Number);
      var total = parts[0] * 60 + parts[1];
      return {
        time: horario,
        diff: total >= currentMinutes ? total - currentMinutes : total + 1440 - currentMinutes,
      };
    })
    .sort(function (a, b) { return a.diff - b.diff; });

  var next = departures[0];
  return {
    time: next.time,
    label: formatMinutes(next.diff, next.time),
    minutes: next.diff,
  };
}

function formatMinutes(minutes, time) {
  if (minutes <= 1) return 'Agora';
  if (minutes < 60) return minutes + ' min';
  if (minutes < 1440) {
    var hours = Math.floor(minutes / 60);
    var rest = minutes % 60;
    return rest === 0 ? hours + 'h' : hours + 'h ' + rest + 'min';
  }
  return 'Amanhã ' + time;
}

function formatDistance(distanceKm) {
  if (distanceKm < 1) return Math.round(distanceKm * 1000) + 'm';
  return distanceKm.toFixed(1).replace('.', ',') + 'km';
}

function distanceKm(lat1, lng1, lat2, lng2) {
  var earthRadiusKm = 6371;
  var dLat = toRad(lat2 - lat1);
  var dLng = toRad(lng2 - lng1);
  var a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusKm * c;
}

function pontosComDistancia(pontos, userPosition) {
  return pontos.map(function (ponto) {
    if (!userPosition || !hasCoords(ponto)) return Object.assign({}, ponto);
    return Object.assign({}, ponto, {
      distancia: distanceKm(
        userPosition.lat,
        userPosition.lng,
        Number(ponto.lat),
        Number(ponto.lng),
      ),
    });
  });
}

function hexToRgba(hex, alpha) {
  var clean = String(hex || '').replace('#', '');
  if (clean.length === 3) {
    clean = clean.split('').map(function (char) { return char + char; }).join('');
  }
  var value = parseInt(clean, 16);
  if (!Number.isFinite(value)) return 'rgba(229, 57, 53, ' + alpha + ')';
  var r = (value >> 16) & 255;
  var g = (value >> 8) & 255;
  var b = value & 255;
  return 'rgba(' + r + ', ' + g + ', ' + b + ', ' + alpha + ')';
}

function loadCache() {
  try {
    var data = localStorage.getItem('busCacheV2');
    return data ? JSON.parse(data) : null;
  } catch (e) { return null; }
}

function saveCache(pontos, horarios) {
  try {
    localStorage.setItem('busCacheV2', JSON.stringify({ pontos: pontos, horarios: horarios }));
  } catch (e) {}
}

function hideSplash() {
  setTimeout(function () {
    var el = document.getElementById('splash');
    if (el) el.classList.add('hide');
  }, 500);
}

function setupBackToTop() {
  var btn = document.getElementById('backToTop');
  if (!btn) return;
  window.addEventListener('scroll', function () {
    btn.classList.toggle('show', window.scrollY > 300);
  });
  btn.addEventListener('click', function () {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
}

function setupOfflineDetection() {
  function toggleBanner(offline) {
    var banner = document.getElementById('offlineBanner');
    if (banner) banner.style.display = offline ? 'block' : 'none';
  }
  window.addEventListener('online', function () { toggleBanner(false); });
  window.addEventListener('offline', function () { toggleBanner(true); });
  toggleBanner(!navigator.onLine);
}

function showEmpty(container, message) {
  if (!container) return;
  container.innerHTML = '<div class="empty-state">' + escapeHtml(message) + '</div>';
}

function sortPointsByContext(lista, sortMode) {
  var arr = Array.isArray(lista) ? lista.slice() : [];
  if (sortMode === 'distancia') {
    arr.sort(function (a, b) {
      var ad = typeof a.distancia === 'number' ? a.distancia : Number.POSITIVE_INFINITY;
      var bd = typeof b.distancia === 'number' ? b.distancia : Number.POSITIVE_INFINITY;
      if (ad !== bd) return ad - bd;
      return (a.ordem || 0) - (b.ordem || 0);
    });
  } else {
    arr.sort(function (a, b) {
      return (a.ordem || 0) - (b.ordem || 0);
    });
  }
  return arr;
}

function createDistanceCache(getPontos, getUserPosition, onChange) {
  var cachedList = null;
  var cachedById = new Map();
  var lastPontosRef = null;
  var lastPositionKey = '__no_position__';
  var dirty = true;

  function positionKey(pos) {
    if (!pos) return '__no_position__';
    return (pos.lat + '_' + pos.lng);
  }

  function isDirty() {
    if (dirty) return true;
    var pontosNow = (typeof getPontos === 'function') ? getPontos() : null;
    if (lastPontosRef !== pontosNow) return true;
    var posNow = (typeof getUserPosition === 'function') ? getUserPosition() : null;
    if (lastPositionKey !== positionKey(posNow)) return true;
    return false;
  }

  function rebuild() {
    var pontos = (typeof getPontos === 'function') ? getPontos() : [];
    var userPosition = (typeof getUserPosition === 'function') ? getUserPosition() : null;
    var list = pontosComDistancia(pontos || [], userPosition || null);
    cachedList = list;
    cachedById = new Map();
    list.forEach(function (ponto) {
      if (ponto && ponto.id != null) cachedById.set(String(ponto.id), ponto);
    });
    lastPontosRef = pontos || null;
    lastPositionKey = positionKey(userPosition);
    dirty = false;
    if (typeof onChange === 'function') {
      try { onChange(); } catch (e) {}
    }
  }

  function getAll() {
    if (isDirty()) rebuild();
    return cachedList ? cachedList.slice() : [];
  }

  function forSingle(ponto) {
    if (!ponto || ponto.id == null) return ponto;
    if (isDirty()) rebuild();
    var cached = cachedById.get(String(ponto.id));
    if (cached) return cached;
    var userPosition = (typeof getUserPosition === 'function') ? getUserPosition() : null;
    var arranged = pontosComDistancia([ponto], userPosition || null);
    var result = arranged && arranged[0] ? arranged[0] : ponto;
    cachedById.set(String(ponto.id), result);
    return result;
  }

  function invalidate() {
    dirty = true;
    cachedList = null;
    cachedById.clear();
  }

  function getSortMode() {
    var pos = (typeof getUserPosition === 'function') ? getUserPosition() : null;
    return (pos && typeof pos.lat === 'number' && typeof pos.lng === 'number') ? 'distancia' : 'ordem';
  }

  return {
    getAll: getAll,
    forSingle: forSingle,
    invalidate: invalidate,
    getSortMode: getSortMode
  };
}

function cardClickEffect(card, callback) {
  card.style.transition = 'transform 0.12s cubic-bezier(0.4, 0, 0.2, 1)';
  card.style.transform = 'scale(0.98)';
  requestAnimationFrame(function () {
    setTimeout(function () {
      card.style.transform = '';
      callback();
    }, 120);
  });
}
