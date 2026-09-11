(function () {
    'use strict';
    var aviso = 'Horários aproximados. Chegue alguns minutos antes.';
    function cards(lista,proxima) {
        return '<div class="circular-times">'+lista.map(function (p) {
            var primeiro=p===proxima;
            return '<div class="circular-time'+(primeiro?' is-next':'')+'">'+
                '<span class="circular-time-caption">'+(primeiro?'Próximo':p.nomeRota)+'</span>'+
                '<strong>'+escapeHtml(p.horario)+'</strong>'+
                (p.pontoId==5?'<small>'+ (p.rota==='B'&&p.ocorrencia===1 || p.rota==='A'&&p.ocorrencia===2 ? 'Após Fernandes Max' : 'Após Igreja Matriz')+'</small>':'')+
                '</div>';
        }).join('')+'</div>';
    }
    function schedule(pontoId,dia,expanded,agora) {
        agora=agora||new Date();
        if(dia==='domingo')return '<p class="circular-notice">A Circular não opera aos domingos.</p>';
        if(!pontoId)return '<div class="circular-general"><div><strong>Manhã</strong><p>06:15 · 07:15 · 08:15</p></div>'+ 
            '<div><strong>Tarde · Rodoviária</strong><p>'+obterSaidasDoDia(CONFIG_HORARIOS.rotas.B,dia).join(' · ')+'</p></div></div><p class="circular-notice">Selecione um ponto para ver os horários de passagem.</p>';
        var horarios=calcularPassagensDoPonto(pontoId,dia).filter(function(p) { return p.embarque; }),hoje=dia===diaCircular(agora),minuto=agora.getHours()*60+agora.getMinutes();
        if(!horarios.length)return '<p class="circular-notice">Atendimento deste ponto a confirmar.</p>';
        var future=horarios.filter(function(p){return !hoje||p.minutos>=minuto;});
        var past=horarios.filter(function(p){return hoje&&p.minutos<minuto;});
        var html=future.length?cards(future,hoje?future[0]:null):'<p class="circular-notice">Não há mais horários previstos para hoje.</p>';
        if(past.length)html+='<details class="passed-details schedule-history"><summary>'+ 
            '<svg class="history-icon" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M3 11a9 9 0 1 1 2.6 7M3 5v6h6M12 7v5l3 2" stroke-linecap="round" stroke-linejoin="round"/></svg>'+
            '<span class="history-title">Horários anteriores</span><span class="history-count">'+past.length+'</span>'+
            '<span class="history-action" aria-hidden="true"><span class="history-show">Ver</span><span class="history-hide">Ocultar</span><span class="history-chevron"></span></span>'+ 
            '</summary>'+cards(past,null)+'</details>';
        return html;
    }
    window.CircularUI={schedule:schedule,aviso:aviso};
})();
