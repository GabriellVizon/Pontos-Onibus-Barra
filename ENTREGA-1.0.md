# BarraBus 1.0 — candidato à publicação (RC1)

Data: 15/09/2026. Base: Pontos-Onibus-Barra (2).zip fornecido pelo responsável.
**Implementação concluída e QA local aprovado. Validação em celular real ainda pendente. Esta entrega não publica o site.**

## Alterações entregues

- Modal dinâmico nas duas páginas: selecionar um ponto pelo seletor do Percurso ou pelo botão com seu nome atualiza título, endereço, referência, bairro, horário previsto, tabela, favorito, distância, marcador e destino do Maps. A aba Percurso permanece aberta.
- Os controles Anterior/Próximo continuam explorando a sequência compacta; o clique no nome ou a escolha no seletor consulta o ponto. Não foi criada uma lista longa.
- A origem GPS pertence à posição do usuário. Selecionar outro ponto só altera o destino.
- Sem localização, os pontos, pesquisa, horários, percurso e mapa continuam disponíveis. A distância fica indisponível, com nova tentativa discreta. “Abrir no Maps” envia o destino; com localização, “Traçar rota” inclui origem e destino para caminhada.
- Erros de localização e revogação de permissão eliminam a posição/distância anterior. Uma nova tentativa atualiza também um modal já aberto, sem trocar o ponto escolhido.
- Corrigida a busca mobile que podia fechar imediatamente ao tocar na lupa.
- Preservado o armazenamento de favoritos. A home não remove mais favoritos da Plena ao carregar somente dados da Circular.
- 19 nomes revisados, mantendo os nomes antigos na busca. Coordenadas do ponto 39 corrigidas conforme informação do responsável. Ponto 43 distingue casa de referência nº 669 do endereço cadastrado nº 678.
- Horários continuam previstos, sem afirmação de presença real do ônibus. A fórmula foi preservada; a correção da posição do ponto 39 repercute nas estimativas por distância. Os relatos de horário usados como âncoras continuam iguais.
- Abas Horários/Percurso permanecem abaixo do mapa; histórico visual de horários anteriores preservado.
- PWA mantida. Arquivos Leaflet 1.9.4 e Tabler 3.2.0, com suas licenças, acompanham o projeto para evitar dependência de CDN no carregamento offline. O fundo cartográfico do OpenStreetMap continua dependendo da conexão/cache do navegador.
- Cache de instalação corrigido para funcionar tanto na raiz quanto em subpastas. Erros HTTP não substituem arquivos válidos em cache; a limpeza remove apenas caches do BarraBus.
- Calendário da tabela principal acompanha a virada do dia quando não existe seleção manual de outro dia.

## QA realizado

Ambiente: Chrome desktop automatizado, Windows. GPS permitido foi emulado com coordenadas fixas; códigos de erro 1, 2 e 3 foram simulados na API. Isso não substitui teste com sensor GPS e permissões de um aparelho real.

| Verificação | Resultado |
| --- | --- |
| Testes existentes de horários e utilitários + regressão de distância herdada | 44 aprovados |
| ESLint | Sem erros ou avisos |
| Rodoviária → Percurso → Jaú Serve nas duas páginas | Aprovado |
| Seleção pelo nome do ponto no percurso | Aprovado |
| Plena 101 → 102, horários, destino e favorito | Aprovado |
| Marcador e centro do mapa correspondem ao novo ponto | Aprovado com Leaflet real |
| Origem GPS permanece inalterada ao trocar destino | Aprovado |
| GPS negado, indisponível, timeout e API ausente nas duas páginas | Aprovado |
| Nova tentativa bem-sucedida com modal aberto | Aprovado |
| Revogar permissão remove distância anterior | Aprovado |
| Busca mobile e pesquisa pelos nomes antigos | Aprovado |
| Histórico por clique e teclado; abas abaixo do mapa | Aprovado |
| Larguras 320, 390, 768 e 1440 px no modal | Sem rolagem horizontal |
| Tema claro/escuro | Inspeção visual realizada |
| Favoritos: adicionar, remover e fechar/reabrir navegador | Aprovado; Circular e Plena preservadas |
| Domingo, fim dos horários, virada de dia e escolha manual de sábado | Aprovado |
| Mapa online | Leaflet real e imagens do OpenStreetMap carregadas |
| PWA offline após primeiro acesso | Duas páginas, dados, horários, percurso e marcador disponíveis |
| PWA publicada em subpasta | Escopo e arquivos offline corretos |
| Manifesto e ícones 192×192 / 512×512 | Válidos |
| Verificação de instalabilidade do Chrome com perfil normal | Nenhum impedimento apontado |
| Instalação e uso em celular físico | Pendente |
| Abertura efetiva do aplicativo Google Maps no celular | Pendente; URLs e coordenadas foram conferidos |

Não foram implementados APK, conta de usuário, rastreamento de veículos ou outras funcionalidades grandes.

## Dados e conferências de campo

Leia [REVISAO-DOS-PONTOS.md](REVISAO-DOS-PONTOS.md) para os nomes antigos/novos, duplicidade conhecida 15/45 e limitações da revisão. Permanecem duas conferências importantes: a correspondência provisória 11/10 e os endereços genéricos da Plena. A validade numérica das coordenadas não comprova a localização física de todos os pontos.

## Validação final no celular

1. Servir esta pasta em HTTPS. Abrir início e pontos no aparelho.
2. Negar a localização, pesquisar um ponto e abrir horários, percurso e mapa.
3. Permitir localização e repetir Rodoviária → Percurso → Jaú Serve; conferir distância, favorito e Maps.
4. Desligar a localização do aparelho e tentar novamente. Confirmar que a consulta continua utilizável.
5. Instalar a PWA, fechar e reabrir. Conferir favoritos e ícone.
6. Reabrir offline após o primeiro carregamento. Os horários e pontos devem continuar disponíveis; imagens novas do mapa podem não carregar.
7. Conferir teclado de pesquisa, rolagem, botões junto às bordas e uso com uma mão no aparelho.
8. Conferir em campo o ponto 39 corrigido, as referências pendentes dos dados e a abertura do Maps no destino escolhido.

Depois da validação, publicar os arquivos estáticos em HTTPS e confirmar o domínio real em og:url. Não enviar node_modules, pastas de QA ou o ZIP ao servidor como conteúdo do aplicativo.

## Arquivos e manutenção

O README desta entrega e este registro substituem orientações de layout dos documentos históricos de versões anteriores. A sequência efetiva da Circular está em CONFIG_HORARIOS, em js/horarios.js; o campo ordem do cadastro serve à apresentação e não substitui as visitas repetidas do circuito.

Para verificar o código: npm ci, npm test e npm run lint. Para executar: usar Live Server ou outro servidor estático. Abrir diretamente com file:// não carrega os JSON.

Origem do pacote: SHA-256 do ZIP recebido
020ff6e33342a90e210e8da1b8d0c62156d3f6883aa7f69c6910e7b7f09c996f

