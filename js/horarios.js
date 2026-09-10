// ========================================
// CONFIGURAÇÃO CIRCULAR
// ========================================

const CONFIG_HORARIOS = {
    // Tempo padrão por trecho (min) usado somente onde não há coordenadas para
    // estimar por distância. A calibração (abaixo) tem prioridade.
    baseTempoPorPonto: 2.5,

    // Janela de incerteza (± minutos). Sem rastreador no ônibus, a passagem real
    // pode acontecer antes (atraso) ou depois (adiantado) do previsto. O app jamais
    // afirma "passou/chegando" fora dessa janela:
    //   - estado "No ponto"  -> agora dentro de [previsto - antes, previsto + depois]
    //   - estado "Aguardando" -> falta mais de `depois` minutos para o previsto
    incerteza: { antes: 3, depois: 3 },

    // ========================================
    // CALIBRAÇÃO (tempos de viagem REAIS observados)
    // ========================================
    // Chave: "<ROTA>_<idDoPonto>"   Valor: minutos ENTRE a saída e a passagem real.
    // Como não há GPS no ônibus, baseie-se em observação: anote o horário que o bus
    // passa de verdade no ponto para uma saída conhecida e acrescente uma âncora aqui.
    // Ex.: saída B das 17:15 — Igreja(36) passa 17:40 (25 min), Orestes(37) 17:43
    // (28 min), Papa João(38) 17:46 (31 min). Os trechos entre âncoras (e antes da
    // primeira) são divididos proporcionalmente pela distância geográfica entre as
    // paradas, então quanto mais âncoras você cadastrar, mais preciso fica.
    calibracao: {
        "B_36": 25,    // Igreja        (real 17:40)
        "B_37": 28,    // Rua Orestes   (real 17:43)
        "B_38": 31     // Papa João     (real 17:46)
    },

    rotas: {
        A: {
            nome: "Rota A",
            // Horários de saída por tipo de dia. No domingo não há operação.
            saidas: {
                uteis: ["06:15", "07:15", "08:15"],
                sabado: ["06:15", "07:15", "08:15"],
                domingo: []
            },
            // A primeira saída do dia começa fora do terminal (rota especial).
            inicioEspecial: [13, 12],
            circuito: [
                33, 34, 35, 36, 37, 38, 39, 40,
                41, 42, 43, 44, 45, 46, 47, 48,
                49, 50, 51, 52,
                16, 17, 18, 14, 19, 20, 21, 22,
                23, 24, 10, 25, 26, 27, 28,
                5, 29, 1, 4, 5, 6, 7, 8, 9,
                53, 54, 55
            ]
        },
        B: {
            nome: "Rota B",
            saidas: {
                uteis: ["12:00", "13:15", "15:15", "17:15", "18:15"],
                sabado: ["15:15", "17:15"],
                domingo: []
            },
            circuito: [
                1, 4, 5, 6, 7, 8, 9,
                53, 54, 55,
                33, 34, 35, 36, 37, 38, 39, 40,
                41, 42, 43, 44, 45, 46, 47, 48,
                49, 50, 51, 52,
                16, 17, 18, 14, 19, 20, 21, 22,
                23, 24, 10, 25, 26, 27, 28,
                5, 29, 1
            ]
        }
    }
};


// ========================================
// CONFIGURAÇÃO PLENA (carregada do JSON)
// ========================================

var CONFIG_PLENA = null;

function carregarConfigPlena(horariosPlena) {
    CONFIG_PLENA = horariosPlena;
}


// ========================================
// PONTOS DA CIRCULAR (para cálculos por distância)
// ========================================

var PONTOS_CIRCULAR = [];
var TEMPOS_CACHE = {};

function setPontosCircular(pontos) {
    PONTOS_CIRCULAR = Array.isArray(pontos) ? pontos : [];
    TEMPOS_CACHE = {};
}

function getPontoCircular(pontoId) {
    for (var i = 0; i < PONTOS_CIRCULAR.length; i++) {
        if (String(PONTOS_CIRCULAR[i].id) === String(pontoId)) return PONTOS_CIRCULAR[i];
    }
    return null;
}

function distanciaEntrePontos(p1, p2) {
    if (!p1 || !p2) return null;
    if (!hasCoords(p1) || !hasCoords(p2)) return null;
    var d = distanceKm(Number(p1.lat), Number(p1.lng), Number(p2.lat), Number(p2.lng));
    return Number.isFinite(d) && d > 0 ? d : null;
}


// ========================================
// CONVERSÃO DE HORÁRIOS
// ========================================

function horarioParaMinutos(horario) {
    const [horas, minutos] = horario.split(":").map(Number);
    return horas * 60 + minutos;
}

function minutosParaHorario(minutos) {
    const total = Math.round(minutos);
    const horas = Math.floor(total / 60) % 24;
    const mins = total % 60;
    return `${String(horas).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
}


// ========================================
// JANELA DE INCERTEZA
// ========================================

function janelaPassagem() {
    var inc = CONFIG_HORARIOS.incerteza || {};
    return {
        antes: Math.max(0, Number(inc.antes) || 3),
        depois: Math.max(0, Number(inc.depois) || 3)
    };
}


// ========================================
// CIRCULAR: TEMPOS POR TRECHO
// ========================================
// Constrói o tempo de percurso entre cada parada consecutiva da sequência.
// Trechos conhecidos (âncoras calibradas) são respeitados; os demais são
// rateados proporcionalmente à distância geográfica entre as paradas.

function _buildTempos(rotaCodigo, sequencia) {
    var base = Number(CONFIG_HORARIOS.baseTempoPorPonto) > 0
        ? Number(CONFIG_HORARIOS.baseTempoPorPonto)
        : 2.5;
    var calibracao = CONFIG_HORARIOS.calibracao || {};
    var n = sequencia.length;
    var tempos = new Array(n);
    var gdist = new Array(n);
    var i;

    tempos[0] = 0;
    gdist[0] = 0;
    for (i = 1; i < n; i++) {
        var d = distanciaEntrePontos(getPontoCircular(sequencia[i - 1]), getPontoCircular(sequencia[i]));
        gdist[i] = d;
        tempos[i] = (d == null) ? base : null;
    }

    // Âncoras calibradas (primeira ocorrência de cada ponto).
    var anchors = [];
    var vistos = {};
    for (i = 0; i < n; i++) {
        var chave = rotaCodigo + '_' + String(sequencia[i]);
        if (vistos[chave]) continue;
        vistos[chave] = true;
        var alvo = Number(calibracao[chave]);
        if (Number.isFinite(alvo) && alvo > 0) anchors.push({ index: i, minutes: alvo });
    }

    function somarDist(i0, i1) {
        var acc = 0;
        for (var j = i0 + 1; j <= i1; j++) {
            if (gdist[j] != null) acc += gdist[j];
        }
        return acc;
    }

    // Rateia `delta` minutos entre os trechos i0+1..i1, proporcional à distância.
    function preencher(i0, i1, delta) {
        var totalDist = somarDist(i0, i1);
        var fixo = 0;
        for (var j = i0 + 1; j <= i1; j++) {
            if (gdist[j] == null) fixo += tempos[j];
        }
        var restante = Math.max(0, delta - fixo);
        var pace = totalDist > 0 ? restante / totalDist : null;
        for (var k = i0 + 1; k <= i1; k++) {
            if (gdist[k] == null) continue;
            tempos[k] = (pace != null && gdist[k] > 0) ? gdist[k] * pace : base;
        }
        return pace;
    }

    // Início -> 1ª âncora -> ... -> última âncora.
    var pontos = [{ index: 0, minutes: 0 }].concat(anchors);
    var paceAnterior = null;
    for (i = 0; i < pontos.length - 1; i++) {
        paceAnterior = preencher(pontos[i].index, pontos[i + 1].index, pontos[i + 1].minutes - pontos[i].minutes);
    }

    // Cauda (após a última âncora): extrapola com o ritmo "min/km" da última partição.
    if (anchors.length > 0) {
        var ultimo = anchors[anchors.length - 1];
        var deltaCauda = (paceAnterior != null) ? paceAnterior * somarDist(ultimo.index, n - 1) : null;
        if (deltaCauda == null || deltaCauda <= 0) {
            for (var t = ultimo.index + 1; t < n; t++) {
                if (gdist[t] != null) tempos[t] = base;
            }
        } else {
            preencher(ultimo.index, n - 1, deltaCauda);
        }
    } else {
        for (var s = 1; s < n; s++) {
            if (gdist[s] != null) tempos[s] = base;
        }
    }

    // Sanitização: garante trechos finitos e com mínimo de 0,5 min.
    for (i = 1; i < n; i++) {
        if (!Number.isFinite(tempos[i]) || tempos[i] <= 0) tempos[i] = base;
        if (tempos[i] < 0.5) tempos[i] = 0.5;
    }

    // Garante que a passagem nas âncoras seja EXATAMENTE a calibrada.
    var mapaAncora = {};
    anchors.forEach(function (a) { mapaAncora[a.index] = a.minutes; });
    var acumulado = 0;
    for (i = 0; i < n; i++) {
        acumulado += (i === 0) ? 0 : tempos[i];
        if (mapaAncora[i] !== undefined) {
            tempos[i] += mapaAncora[i] - acumulado;
            acumulado = mapaAncora[i];
        }
    }

    // Acumulado por parada (minutos após a saída).
    var cum = new Array(n);
    cum[0] = 0;
    for (i = 1; i < n; i++) cum[i] = cum[i - 1] + tempos[i];

    return { sequencia: sequencia, tempos: tempos, cum: cum };
}

function obterTemposRota(rotaCodigo, comEspecial) {
    var rota = CONFIG_HORARIOS.rotas[rotaCodigo];
    if (!rota) return null;
    var chave = rotaCodigo + ':' + (comEspecial ? 'E' : 'N');
    if (TEMPOS_CACHE[chave]) return TEMPOS_CACHE[chave];
    var sequencia = (comEspecial && Array.isArray(rota.inicioEspecial))
        ? rota.inicioEspecial.concat(rota.circuito)
        : rota.circuito;
    var build = _buildTempos(rotaCodigo, sequencia);
    TEMPOS_CACHE[chave] = build;
    return build;
}


// ========================================
// CIRCULAR: SAÍDAS POR DIA
// ========================================

function obterSaidasDoDia(rota, diaTipo) {
    diaTipo = diaTipo || getCurrentDayType();
    var mapa = rota && rota.saidas;
    var lista = mapa && Array.isArray(mapa[diaTipo]) ? mapa[diaTipo] : [];
    return lista;
}

function obterSaidasDoDiaCircular(diaTipo) {
    diaTipo = diaTipo || getCurrentDayType();
    var saidas = [];
    Object.keys(CONFIG_HORARIOS.rotas).forEach(function (codigo) {
        obterSaidasDoDia(CONFIG_HORARIOS.rotas[codigo], diaTipo).forEach(function (h) {
            if (saidas.indexOf(h) === -1) saidas.push(h);
        });
    });
    saidas.sort(function (a, b) { return horarioParaMinutos(a) - horarioParaMinutos(b); });
    return saidas;
}

function diasComHorariosCircular() {
    var out = [];
    ['uteis', 'sabado', 'domingo'].forEach(function (dia) {
        if (obterSaidasDoDiaCircular(dia).length > 0) {
            out.push({ id: dia, nome: dia === 'uteis' ? 'Dias Úteis' : dia === 'sabado' ? 'Sábado' : 'Domingo' });
        }
    });
    return out;
}


// ========================================
// CIRCULAR: PASSAGENS DE UM PONTO
// ========================================

function calcularPassagensDoPonto(pontoId, diaTipo) {
    diaTipo = diaTipo || getCurrentDayType();
    var passagens = [];

    Object.keys(CONFIG_HORARIOS.rotas).forEach(function (codigo) {
        var rota = CONFIG_HORARIOS.rotas[codigo];
        var saidas = obterSaidasDoDia(rota, diaTipo);
        saidas.forEach(function (saida, idx) {
            var comEspecial = !!(rota.inicioEspecial && idx === 0);
            var build = obterTemposRota(codigo, comEspecial);
            if (!build) return;
            var saidaMin = horarioParaMinutos(saida);
            for (var p = 0; p < build.sequencia.length; p++) {
                if (String(build.sequencia[p]) !== String(pontoId)) continue;
                var total = saidaMin + build.cum[p];
                passagens.push({
                    linha: 'circular',
                    nomeLinha: 'Rota Circular',
                    rota: codigo,
                    nomeRota: rota.nome,
                    saida: saida,
                    pontoId: pontoId,
                    posicao: p,
                    horario: minutosParaHorario(total),
                    minutos: Math.round(total)
                });
            }
        });
    });

    passagens.sort(function (a, b) { return a.minutos - b.minutos; });
    return passagens;
}

function obterHorariosDoPonto(pontoId, diaTipo) {
    var passagens = calcularPassagensDoPonto(pontoId, diaTipo);
    var vistos = {};
    var out = [];
    passagens.forEach(function (p) {
        if (!vistos[p.horario]) {
            vistos[p.horario] = true;
            out.push(p.horario);
        }
    });
    return out;
}


// ========================================
// CIRCULAR: PRÓXIMO ÔNIBUS (ESTADO HONESTO)
// ========================================

function encontrarPassagens(pontoId, agora, diaTipo) {
    agora = agora || new Date();
    diaTipo = diaTipo || getCurrentDayType();
    var passagens = calcularPassagensDoPonto(pontoId, diaTipo);
    var agoraMin = agora.getHours() * 60 + agora.getMinutes();

    if (passagens.length === 0) {
        var msg = diaTipo === 'domingo'
            ? 'Não opera aos domingos'
            : 'Sem horário';
        return { encontrado: false, estado: 'sem_horario', situacao: 'sem_horario', pontoId: pontoId, mensagem: msg };
    }

    var proxima = null;
    for (var i = 0; i < passagens.length; i++) {
        if (passagens[i].minutos >= agoraMin) { proxima = passagens[i]; break; }
    }

    if (!proxima) {
        return { encontrado: false, estado: 'encerrado', situacao: 'encerrado', pontoId: pontoId, mensagem: 'Sem ônibus hoje' };
    }

    var inc = janelaPassagem();
    var diff = proxima.minutos - agoraMin;

    var situacao;
    if (diff <= inc.depois) situacao = 'no_ponto';
    else situacao = 'aguardando';

    var estado = situacao === 'no_ponto' ? 'chegando' : 'proximo';
    var label;
    if (situacao === 'no_ponto') label = 'No ponto';
    else if (diff <= 1) label = 'Agora';
    else label = formatMinutes(diff, proxima.horario);

    var faixa = {
        de: minutosParaHorario(proxima.minutos - inc.antes),
        ate: minutosParaHorario(proxima.minutos + inc.depois)
    };
    faixa.label = faixa.de + '–' + faixa.ate;

    return {
        encontrado: true,
        pontoId: pontoId,
        rota: proxima.rota,
        nomeRota: proxima.nomeRota,
        saida: proxima.saida,
        posicao: proxima.posicao,
        horario: proxima.horario,
        esperado: proxima.horario,
        minutos: diff,
        minutosRestantes: diff,
        estado: estado,
        situacao: situacao,
        faixa: faixa,
        label: label
    };
}

// Wrapper pronto para a UI (cards/badges): devolve { time, label, minutos, faixa, situacao }.
function apresentarProximaCircular(pontoId, agora, diaTipo) {
    var r = encontrarPassagens(pontoId, agora, diaTipo);
    if (!r.encontrado) {
        return {
            encontrado: false,
            time: '--',
            label: r.mensagem || 'Sem horário',
            minutos: Number.POSITIVE_INFINITY,
            situacao: r.situacao,
            faixa: null
        };
    }
    return {
        encontrado: true,
        time: r.horario,
        label: r.label,
        minutos: r.minutos,
        situacao: r.situacao,
        faixa: r.faixa,
        rota: r.nomeRota,
        saida: r.saida
    };
}

function obterTextoProximoOnibus(pontoId) {
    var r = encontrarPassagens(pontoId);
    if (!r.encontrado) {
        return { texto: 'Sem ônibus hoje', horario: null, estado: 'encerrado' };
    }
    if (r.situacao === 'no_ponto') {
        return { texto: 'No ponto', horario: r.horario, estado: 'chegando' };
    }
    return { texto: 'Próximo ônibus', horario: r.horario, estado: 'proximo' };
}


// ========================================
// PLENA: OBTER SENTIDOS QUE PASSAM PELO PONTO
// ========================================

function obterSentidosPlena(pontoId) {
    if (!CONFIG_PLENA || !CONFIG_PLENA.sentidos) return [];
    return CONFIG_PLENA.sentidos.filter(function (s) {
        return s.pontos.indexOf(pontoId) !== -1;
    });
}


// ========================================
// PLENA: ABAS DE DIA DISPONÍVEIS (por ponto)
// ========================================

function obterAbasDiaPlena(sentidoId, pontoId) {
    if (!CONFIG_PLENA || !CONFIG_PLENA.sentidos) return [];
    var sentido = CONFIG_PLENA.sentidos.find(function (s) { return s.id === sentidoId; });
    if (!sentido || !sentido.pontosHorarios) return [];

    var ph = sentido.pontosHorarios[String(pontoId)];
    if (!ph) return [];

    var abas = [];

    var temUteis = ph.uteis && ph.uteis.length > 0;
    var temSabado = ph.sabado && ph.sabado.length > 0;
    var temDomingo = ph.domingo && ph.domingo.length > 0;
    var temFeriado = ph.feriado && ph.feriado.length > 0;

    if (temUteis) abas.push({ id: "uteis", nome: "Dias Úteis" });
    if (temSabado) abas.push({ id: "sabado", nome: "Sábado" });

    if (temDomingo && temFeriado) {
        var mesmoHorario = JSON.stringify(ph.domingo) === JSON.stringify(ph.feriado);
        if (mesmoHorario) {
            abas.push({ id: "domingo", nome: "Domingo/Feriado" });
        } else {
            abas.push({ id: "domingo", nome: "Domingo" });
            abas.push({ id: "feriado", nome: "Feriado" });
        }
    } else {
        if (temDomingo) abas.push({ id: "domingo", nome: "Domingo" });
        if (temFeriado) abas.push({ id: "feriado", nome: "Feriado" });
    }

    return abas;
}


// ========================================
// PLENA: HORÁRIOS DE UM PONTO + DIA
// ========================================

function obterHorariosPlena(sentidoId, diaTipo, pontoId) {
    if (!CONFIG_PLENA || !CONFIG_PLENA.sentidos) return [];
    var sentido = CONFIG_PLENA.sentidos.find(function (s) { return s.id === sentidoId; });
    if (!sentido || !sentido.pontosHorarios) return [];

    if (pontoId) {
        var ph = sentido.pontosHorarios[String(pontoId)];
        if (!ph) return [];
        var chave = diaTipo || "uteis";
        var lista = ph[chave];
        return (lista && Array.isArray(lista)) ? lista.slice() : [];
    }

    var chave = diaTipo || "uteis";
    var lista = sentido.horarios ? sentido.horarios[chave] : [];
    return (lista && Array.isArray(lista)) ? lista.slice() : [];
}


// ========================================
// PLENA: TODAS AS PASSAGENS DE UM PONTO
// ========================================

function calcularPassagensPlena(pontoId) {
    if (!CONFIG_PLENA || !CONFIG_PLENA.sentidos) return [];

    var passagens = [];

    CONFIG_PLENA.sentidos.forEach(function (sentido) {
        var ph = sentido.pontosHorarios ? sentido.pontosHorarios[String(pontoId)] : null;
        if (!ph) return;

        var todosHorarios = [];
        if (ph.uteis) todosHorarios = todosHorarios.concat(ph.uteis);
        if (ph.sabado) todosHorarios = todosHorarios.concat(ph.sabado);
        if (ph.domingo) todosHorarios = todosHorarios.concat(ph.domingo);
        if (ph.feriado) todosHorarios = todosHorarios.concat(ph.feriado);

        var horariosUnicos = [];
        var vistos = {};
        todosHorarios.forEach(function (h) {
            if (!vistos[h]) {
                horariosUnicos.push(h);
                vistos[h] = true;
            }
        });

        horariosUnicos.forEach(function (horarioSaida) {
            passagens.push({
                linha: "plena",
                nomeLinha: "Plena",
                sentido: sentido.id,
                nomeSentido: sentido.nome,
                saida: horarioSaida,
                pontoId: pontoId,
                horario: horarioSaida
            });
        });
    });

    return passagens.sort(
        function (a, b) { return horarioParaMinutos(a.horario) - horarioParaMinutos(b.horario); }
    );
}


// ========================================
// PLENA: PRÓXIMO ÔNIBUS (SENTIDO ESPECÍFICO)
// ========================================

function encontrarPassagensPlena(pontoId, sentidoId, diaTipo, agora) {
    if (!agora) agora = new Date();
    if (!diaTipo) diaTipo = getCurrentDayType();

    var agoraEmMinutos = agora.getHours() * 60 + agora.getMinutes();

    if (!CONFIG_PLENA || !CONFIG_PLENA.sentidos) {
        return { encontrado: false, estado: "sem_dados", pontoId: pontoId };
    }

    var sentido = CONFIG_PLENA.sentidos.find(function (s) { return s.id === sentidoId; });
    if (!sentido) {
        return { encontrado: false, estado: "sem_dados", pontoId: pontoId };
    }

    var ph = sentido.pontosHorarios ? sentido.pontosHorarios[String(pontoId)] : null;
    if (!ph) {
        return { encontrado: false, estado: "nao_passa", pontoId: pontoId };
    }

    var horarios = [];
    var lista = ph[diaTipo];
    if (lista && Array.isArray(lista)) horarios = lista.slice();

    if (horarios.length === 0) {
        return { encontrado: false, estado: "sem_horarios", pontoId: pontoId, sentidoId: sentidoId };
    }

    var proxima = null;
    horarios.forEach(function (h) {
        var hMin = horarioParaMinutos(h);
        if (hMin >= agoraEmMinutos) {
            if (!proxima || hMin < horarioParaMinutos(proxima)) {
                proxima = h;
            }
        }
    });

    if (!proxima) {
        return { encontrado: false, estado: "encerrado", pontoId: pontoId, sentidoId: sentidoId };
    }

    var horarioMinutos = horarioParaMinutos(proxima);
    var minutosRestantes = horarioMinutos - agoraEmMinutos;
    var estado = "proximo";
    if (minutosRestantes <= 1) estado = "chegando";

    return {
        encontrado: true,
        pontoId: pontoId,
        linha: "plena",
        nomeLinha: "Plena",
        sentido: sentidoId,
        nomeSentido: sentido.nome,
        saida: proxima,
        horario: proxima,
        minutosRestantes: minutosRestantes,
        estado: estado
    };
}


// ========================================
// PLENA: PRÓXIMO ÔNIBUS QUALQUER SENTIDO
// ========================================

function encontrarProximoPlena(pontoId, agora) {
    if (!CONFIG_PLENA || !CONFIG_PLENA.sentidos) {
        return { encontrado: false, estado: "sem_dados", pontoId: pontoId };
    }

    var sentidos = obterSentidosPlena(pontoId);
    if (sentidos.length === 0) {
        return { encontrado: false, estado: "nao_passa", pontoId: pontoId };
    }

    var agoraEmMinutos = agora ? agora.getHours() * 60 + agora.getMinutes() : null;
    var melhor = null;

    sentidos.forEach(function (sentido) {
        var ph = sentido.pontosHorarios ? sentido.pontosHorarios[String(pontoId)] : null;
        if (!ph) return;

        var todosHorarios = [];
        if (ph.uteis) todosHorarios = todosHorarios.concat(ph.uteis);
        if (ph.sabado) todosHorarios = todosHorarios.concat(ph.sabado);
        if (ph.domingo) todosHorarios = todosHorarios.concat(ph.domingo);
        if (ph.feriado) todosHorarios = todosHorarios.concat(ph.feriado);

        if (todosHorarios.length === 0) return;

        var horariosUnicos = [];
        var vistos = {};
        todosHorarios.forEach(function (h) {
            if (!vistos[h]) { horariosUnicos.push(h); vistos[h] = true; }
        });

        horariosUnicos.forEach(function (horarioSaida) {
            var hMin = horarioParaMinutos(horarioSaida);

            if (agoraEmMinutos !== null && hMin < agoraEmMinutos) return;

            if (!melhor || hMin < horarioParaMinutos(melhor.horario)) {
                melhor = {
                    linha: "plena",
                    nomeLinha: "Plena",
                    sentido: sentido.id,
                    nomeSentido: sentido.nome,
                    saida: horarioSaida,
                    horario: horarioSaida,
                    pontoId: pontoId
                };
            }
        });
    });

    if (!melhor) {
        return { encontrado: false, estado: "encerrado", pontoId: pontoId };
    }

    var agoraCalc = agora || new Date();
    var agoraMin = agoraCalc.getHours() * 60 + agoraCalc.getMinutes();
    var horarioMin = horarioParaMinutos(melhor.horario);
    var diff = horarioMin - agoraMin;
    var estado = diff <= 1 ? "chegando" : "proximo";

    return {
        encontrado: true,
        pontoId: melhor.pontoId,
        linha: "plena",
        nomeLinha: "Plena",
        sentido: melhor.sentido,
        nomeSentido: melhor.nomeSentido,
        saida: melhor.saida,
        horario: melhor.horario,
        minutosRestantes: diff,
        estado: estado
    };
}