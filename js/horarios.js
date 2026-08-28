console.log("HORARIOS.JS FOI CARREGADO");

// ========================================
// CONFIGURAÇÃO CIRCULAR (sem alteração)
// ========================================

const CONFIG_HORARIOS = {
    minutosPorPonto: 2.5,

    rotas: {
        A: {
            nome: "Rota A",
            saidas: ["06:15", "07:15", "08:15"],
            encerraAproximadamente: "09:00",
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
            saidas: ["12:00", "13:15", "15:15", "17:15", "18:15"],
            ultimaSaida: "18:15",
            encerraAproximadamente: "20:15",
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
// CONVERSÃO DE HORÁRIOS
// ========================================

function horarioParaMinutos(horario) {
    const [horas, minutos] = horario.split(":").map(Number);
    return horas * 60 + minutos;
}

function minutosParaHorario(minutos) {
    const horas = Math.floor(minutos / 60);
    const mins = Math.round(minutos % 60);
    return `${String(horas).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
}


// ========================================
// CIRCULAR: SEQUÊNCIA DE UMA VIAGEM
// ========================================

function obterSequenciaViagem(rota, horarioSaida) {
    const saidaEspecial = rota.saidas[0] === horarioSaida;
    if (rota === CONFIG_HORARIOS.rotas.A && saidaEspecial) {
        return [...rota.inicioEspecial, ...rota.circuito];
    }
    return [...rota.circuito];
}


// ========================================
// CIRCULAR: ENCONTRA OCORRÊNCIAS
// ========================================

function encontrarOcorrencias(lista, pontoId) {
    const ocorrencias = [];
    lista.forEach((id, indice) => {
        if (id === pontoId) {
            ocorrencias.push(indice);
        }
    });
    return ocorrencias;
}


// ========================================
// CIRCULAR: CALCULA HORÁRIO DA PARADA
// ========================================

function calcularHorarioPonto(horarioSaida, posicao, minutosPorPonto) {
    const mpp = minutosPorPonto || CONFIG_HORARIOS.minutosPorPonto;
    const saida = horarioParaMinutos(horarioSaida);
    const tempoEstimado = posicao * mpp;
    return minutosParaHorario(saida + tempoEstimado);
}


// ========================================
// CIRCULAR: CALCULA TODAS AS PASSAGENS
// ========================================

function calcularPassagensDoPonto(pontoId) {
    const passagens = [];

    Object.entries(CONFIG_HORARIOS.rotas).forEach(
        ([codigoRota, rota]) => {
            rota.saidas.forEach(horarioSaida => {
                const sequencia = obterSequenciaViagem(rota, horarioSaida);
                const ocorrencias = encontrarOcorrencias(sequencia, pontoId);

                ocorrencias.forEach(posicao => {
                    const horario = calcularHorarioPonto(horarioSaida, posicao);
                    passagens.push({
                        linha: "circular",
                        nomeLinha: "Rota Circular",
                        rota: codigoRota,
                        nomeRota: rota.nome,
                        saida: horarioSaida,
                        pontoId,
                        posicao,
                        horario
                    });
                });
            });
        }
    );

    return passagens.sort(
        (a, b) => horarioParaMinutos(a.horario) - horarioParaMinutos(b.horario)
    );
}


// ========================================
// CIRCULAR: PRÓXIMO ÔNIBUS
// ========================================

function encontrarPassagens(pontoId, agora) {
    if (!agora) agora = new Date();
    const agoraEmMinutos = agora.getHours() * 60 + agora.getMinutes();

    const rotaA = CONFIG_HORARIOS.rotas.A;
    const rotaB = CONFIG_HORARIOS.rotas.B;

    const encerramentoA = horarioParaMinutos(rotaA.encerraAproximadamente);
    const encerramentoB = horarioParaMinutos(rotaB.encerraAproximadamente);
    const maiorEncerramento = Math.max(encerramentoA, encerramentoB);

    if (agoraEmMinutos > maiorEncerramento) {
        return {
            encontrado: false,
            estado: "encerrado",
            pontoId,
            mensagem: "Não há mais ônibus hoje."
        };
    }

    const passagens = calcularPassagensDoPonto(pontoId);
    const proxima = passagens.find(
        passagem => horarioParaMinutos(passagem.horario) >= agoraEmMinutos
    );

    if (!proxima) {
        return {
            encontrado: false,
            estado: "encerrado",
            pontoId,
            mensagem: "Não há mais ônibus hoje."
        };
    }

    const horarioMinutos = horarioParaMinutos(proxima.horario);
    const minutosRestantes = horarioMinutos - agoraEmMinutos;
    let estado = "proximo";
    if (minutosRestantes <= 1) estado = "chegando";

    return {
        encontrado: true,
        pontoId: proxima.pontoId,
        rota: proxima.rota,
        nomeRota: proxima.nomeRota,
        saida: proxima.saida,
        horario: proxima.horario,
        posicao: proxima.posicao,
        minutosRestantes,
        estado
    };
}


// ========================================
// CIRCULAR: TEXTO DO PRÓXIMO ÔNIBUS
// ========================================

function obterTextoProximoOnibus(pontoId) {
    const resultado = encontrarPassagens(pontoId);

    if (!resultado.encontrado) {
        return { texto: "Sem mais horários", horario: null, estado: "encerrado" };
    }
    if (resultado.estado === "chegando") {
        return { texto: "Chegando", horario: resultado.horario, estado: "chegando" };
    }
    return { texto: "Próximo ônibus", horario: resultado.horario, estado: "proximo" };
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


// ========================================
// TESTES
// ========================================

console.log(
    "PASSAGENS RODOVIÁRIA:",
    calcularPassagensDoPonto(1)
);

console.log(
    "RODOVIÁRIA 20:10:",
    encontrarPassagens(
        1,
        (() => {
            const d = new Date();
            d.setHours(20, 10, 0, 0);
            return d;
        })()
    )
);

console.table(
    calcularPassagensDoPonto(1).map(
        p => ({
            rota: p.rota,
            saida: p.saida,
            posicao: p.posicao,
            horario: p.horario
        })
    )
);
