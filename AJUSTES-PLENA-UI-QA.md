# Ajustes da Plena — UI/UX + QA

## O que foi corrigido

- A Home agora carrega os dados da **Circular e da Plena**.
- Os 4 registros da Plena aparecem no mapa inicial com marcadores azuis.
- Busca e favoritos da Home reconhecem os registros da Plena sem misturar as linhas.
- Cards da Plena usam o mesmo padrão visual dos demais cards, mantendo azul apenas como identidade da linha.
- A apresentação dos horários da Plena foi alinhada ao padrão visual da Circular: cards de horário, destaque do próximo, histórico de horários anteriores e abas por dia.
- O modal da Plena usa a mesma linguagem visual de horários da Circular.
- O cálculo de “próximo ônibus” da Plena foi corrigido para considerar apenas os horários do dia atual, sem misturar dias úteis, sábado e domingo.
- O cache do Service Worker foi atualizado para `barrabus-1.0-rc2` para distribuir as alterações.

## Localização dos pontos da Plena

Os locais exatos dos embarques 101–104 ainda não estão confirmados. Para não apresentar precisão falsa:

- os registros foram marcados com `localizacaoConfirmada: false`;
- o endereço exibido é **“Localização exata ainda não informada”**;
- os marcadores azuis do mapa são identificados como **referência aproximada**;
- esses pontos não entram no cálculo de “3 pontos mais próximos” enquanto a localização não for confirmada;
- a interface não mostra distância exata para esses registros;
- ações de mapa usam o texto **“Ver referência” / “Abrir referência no Maps”**, em vez de afirmar que a rota leva ao ponto exato.

Quando houver endereço/coordenadas confiáveis, basta atualizar `dados/pontos-plena.json` e trocar `localizacaoConfirmada` para `true` em cada registro confirmado.

## QA

- `node --check` aprovado nos arquivos JavaScript alterados.
- `npm test`: **45/45 testes aprovados**.
- Foi adicionado teste de regressão para impedir que a Plena volte a misturar horários de dias diferentes.
- O ESLint consta no projeto, mas a instalação local das dependências não estava disponível no ambiente de revisão; a tentativa de `npm ci` excedeu o limite do ambiente. Nenhum erro de sintaxe foi encontrado.
