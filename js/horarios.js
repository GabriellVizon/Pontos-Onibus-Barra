console.log("HORARIOS.JS FOI CARREGADO");

const CONFIG_HORARIOS = {
    minutosPorPonto: 2.5,

    rotas: {
        A: {
            nome: "Rota A",

            saidas: [
                "06:15",
                "07:15",
                "08:15"
            ],

            encerraAproximadamente: "09:00",

            // Acontece somente na primeira saída
            inicioEspecial: [
                13, // Sinal Verde
                12  // Pracinha Lojas São Paulo
            ],

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

            saidas: [
                "12:00",
                "13:15",
                "15:15",
                "17:15",
                "18:15"
            ],

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
// SEQUÊNCIA DE UMA VIAGEM
// ========================================

function obterSequenciaViagem(rota, horarioSaida) {

    const saidaEspecial =
        rota.saidas[0] === horarioSaida;

    // Rota A possui dois pontos extras
    // somente na primeira saída
    if (
        rota === CONFIG_HORARIOS.rotas.A &&
        saidaEspecial
    ) {
        return [
            ...rota.inicioEspecial,
            ...rota.circuito
        ];
    }

    return [...rota.circuito];
}


// ========================================
// ENCONTRA TODAS AS OCORRÊNCIAS
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
// CALCULA HORÁRIO DA PARADA
// ========================================

function calcularHorarioPonto(horarioSaida, posicao) {

    const saida =
        horarioParaMinutos(horarioSaida);

    const tempoEstimado =
        posicao * CONFIG_HORARIOS.minutosPorPonto;

    return minutosParaHorario(
        saida + tempoEstimado
    );
}


// ========================================
// CALCULA TODAS AS PASSAGENS
// ========================================

function calcularPassagensDoPonto(pontoId) {

    const passagens = [];

    Object.entries(CONFIG_HORARIOS.rotas).forEach(
        ([codigoRota, rota]) => {

            rota.saidas.forEach(
                horarioSaida => {

                    const sequencia =
                        obterSequenciaViagem(
                            rota,
                            horarioSaida
                        );

                    const ocorrencias =
                        encontrarOcorrencias(
                            sequencia,
                            pontoId
                        );

                    ocorrencias.forEach(
                        posicao => {

                            const horario =
                                calcularHorarioPonto(
                                    horarioSaida,
                                    posicao
                                );

                            passagens.push({
                                rota: codigoRota,
                                nomeRota: rota.nome,
                                saida: horarioSaida,
                                pontoId,
                                posicao,
                                horario
                            });

                        }
                    );

                }
            );

        }
    );

    return passagens.sort(
        (a, b) =>
            horarioParaMinutos(a.horario) -
            horarioParaMinutos(b.horario)
    );
}


// ========================================
// PRÓXIMO ÔNIBUS
// ========================================

function encontrarPassagens(
    pontoId,
    agora = new Date()
) {

    const agoraEmMinutos =
        agora.getHours() * 60 +
        agora.getMinutes();

    const rotaA =
        CONFIG_HORARIOS.rotas.A;

    const rotaB =
        CONFIG_HORARIOS.rotas.B;


    // ========================================
    // ENCERRAMENTO DAS ROTAS
    // ========================================

    const encerramentoA =
        horarioParaMinutos(
            rotaA.encerraAproximadamente
        );

    const encerramentoB =
        horarioParaMinutos(
            rotaB.encerraAproximadamente
        );

    const maiorEncerramento =
        Math.max(
            encerramentoA,
            encerramentoB
        );


    // Depois do encerramento aproximado
    // não existem mais ônibus hoje.
    if (agoraEmMinutos > maiorEncerramento) {

        return {
            encontrado: false,
            estado: "encerrado",
            pontoId,
            mensagem: "Não há mais ônibus hoje."
        };
    }


    // ========================================
    // BUSCA TODAS AS PASSAGENS
    // ========================================

    const passagens =
        calcularPassagensDoPonto(pontoId);


    // ========================================
    // ENCONTRA A PRÓXIMA PASSAGEM
    // ========================================

    const proxima =
        passagens.find(
            passagem =>
                horarioParaMinutos(
                    passagem.horario
                ) >= agoraEmMinutos
        );


    // Nenhuma passagem restante
    if (!proxima) {

        return {
            encontrado: false,
            estado: "encerrado",
            pontoId,
            mensagem: "Não há mais ônibus hoje."
        };
    }


    // ========================================
    // CALCULA TEMPO RESTANTE
    // ========================================

    const horarioMinutos =
        horarioParaMinutos(
            proxima.horario
        );

    const minutosRestantes =
        horarioMinutos -
        agoraEmMinutos;


    let estado = "proximo";


    if (minutosRestantes <= 1) {
        estado = "chegando";
    }


    // ========================================
    // RETORNO
    // ========================================

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
// TEXTO DO PRÓXIMO ÔNIBUS
// ========================================

function obterTextoProximoOnibus(pontoId) {

    const resultado =
        encontrarPassagens(pontoId);


    if (!resultado.encontrado) {

        return {
            texto: "Sem mais horários",
            horario: null,
            estado: "encerrado"
        };
    }


    if (resultado.estado === "chegando") {

        return {
            texto: "Chegando",
            horario: resultado.horario,
            estado: "chegando"
        };
    }


    return {
        texto: "Próximo ônibus",
        horario: resultado.horario,
        estado: "proximo"
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

            d.setHours(
                20,
                10,
                0,
                0
            );

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