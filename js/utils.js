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

function getLinha(linhaId, linhas) {
  return linhas.find(function (linha) { return linha.id === linhaId; });
}

function getCurrentDayType() {
  var day = new Date().getDay();
  if (day === 0) return 'domingo';
  if (day === 6) return 'sabado';
  return 'uteis';
}

function getHorario(linhaId, horarios, dayType) {
  var item = horarios.find(function (h) { return h.linhaId === linhaId; });
  if (!item) return [];
  if (Array.isArray(item.horarios)) return item.horarios;
  var day = dayType || getCurrentDayType();
  return (item.horarios && item.horarios[day]) ? item.horarios[day] : [];
}

function getNextDeparture(linhaId, horarios) {
  var horariosLinha = getHorario(linhaId, horarios);
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

function getPointGroupKey(ponto) {
  return normalize([ponto.nome, ponto.endereco].join('|'));
}

function getPointLineItems(ponto, pontos, linhas, horarios) {
  var key = getPointGroupKey(ponto);
  var seen = {};
  var items = [];

  pontos.forEach(function (item) {
    if (getPointGroupKey(item) !== key || seen[item.linhaId]) return;
    var linha = getLinha(item.linhaId, linhas);
    if (!linha) return;
    items.push({
      ponto: item,
      linha: linha,
      next: getNextDeparture(item.linhaId, horarios),
      horarios: getHorario(item.linhaId, horarios),
    });
    seen[item.linhaId] = true;
  });

  return items.length ? items : [{
    ponto: ponto,
    linha: getLinha(ponto.linhaId, linhas),
    next: getNextDeparture(ponto.linhaId, horarios),
    horarios: getHorario(ponto.linhaId, horarios),
  }];
}

function getPointLineColors(ponto, pontos, linhas) {
  var colors = [];
  var seen = {};

  getPointLineItems(ponto, pontos, linhas, []).forEach(function (item) {
    var linha = item.linha;
    if (!linha || !linha.cor || seen[linha.cor]) return;
    colors.push(linha.cor);
    seen[linha.cor] = true;
  });

  if (colors.length === 0) {
    var ownLine = getLinha(ponto.linhaId, linhas);
    if (ownLine && ownLine.cor) colors.push(ownLine.cor);
  }

  return colors.length ? colors : ['#888'];
}

function getMixedBackground(colors) {
  if (!colors || colors.length === 0) return '#888';
  if (colors.length === 1) return colors[0];
  return 'linear-gradient(90deg, ' + colors.map(function (color, index) {
    var start = (index / colors.length) * 100;
    var end = ((index + 1) / colors.length) * 100;
    return color + ' ' + start + '% ' + end + '%';
  }).join(', ') + ')';
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
    var data = localStorage.getItem('busCache');
    return data ? JSON.parse(data) : null;
  } catch (e) { return null; }
}

function saveCache(pontos, linhas, horarios) {
  try {
    localStorage.setItem('busCache', JSON.stringify({ pontos: pontos, linhas: linhas, horarios: horarios }));
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
