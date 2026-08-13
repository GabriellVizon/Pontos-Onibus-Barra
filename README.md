# BarraBus

Pontos de ônibus e horários de Barra Bonita (SP). Site estático em HTML/CSS/JS puro (PWA, funciona offline).

## Como rodar

Abra com um servidor local (o `fetch` dos JSON não funciona abrindo `file://`):

```bash
# com Node (npx serve) ou qualquer servidor estático:
npx serve .
```

Ou use a extensão "Live Server" do VS Code.

## Estrutura

```
index.html      → Home (busca, favoritos, pontos próximos, mapa)
pontos.html     → Pontos e horários (tabela, mapa, sidebar)
css/shared.css  → Estilos compartilhados (variáveis de tema, modal, cards)
css/index.css   → Estilos da Home
css/pontos.css  → Estilos da página Pontos
js/utils.js     → Funções puras (distância, horários, cache, helpers)
js/theme.js     → Tema claro/escuro
js/favorites.js → Favoritos (localStorage)
js/modal.js     → Modal de detalhe do ponto (com mini-mapa e percurso)
js/appShell.js  → Shell da página (sidebar, topbar, splash, footer)
js/bootstrap-home.js / bootstrap-points.js → Renderizam o shell por página
js/pontos.js    → Lógica da página Pontos
js/script.js    → Lógica da Home
dados/pontos.json    → Pontos (id, ordem, nome, endereço, bairro, lat, lng)
dados/horarios.json  → Horários (uteis, sabado, domingo)
sw.js           → Service Worker (offline/PWA)
manifest.json   → Manifest do PWA
```

## Dados

- `dados/pontos.json`: lista de pontos, ordenada pelo campo `ordem`.
- `dados/horarios.json`: horários agrupados por dia — `uteis`, `sabado` e `domingo`.
  Aos domingos **não há operação** (`domingo: []`), e o app avisa isso na interface.

## Scripts

```bash
npm test     # roda os testes unitários das funções de js/utils.js (node:test)
npm run lint # roda o ESLint em todo o JS
```

## Notas de manutenção

- Não há build step: o JS roda direto no navegador, então não introduza sintaxe acima de ES2020 sem verificar compatibilidade.
- Ao mudar assets/arquivos que devem ficar offline, atualize `PRE_CACHE_URLS` no `sw.js` e aumente `CACHE_NAME`.
- Troca de tema: as cores vêm de variáveis CSS em `css/shared.css` (`[data-theme="light"]` redefine as variáveis). Evite cores fixas (`#fff`/`#000`) nos componentes; prefira `var(--text-primary)`.
