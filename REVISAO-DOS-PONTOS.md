# Revisão dos pontos — 15/09/2026

Base: ZIP Pontos-Onibus-Barra (2).zip fornecido pelo responsável. A revisão verificou consistência do cadastro; não equivale a vistoria de todos os pontos na rua.

## Resultado

- 50 registros da Circular e 4 da Plena; IDs únicos.
- Nome, endereço, bairro e coordenadas presentes em todos os registros.
- Coordenadas numéricas válidas e dentro da região de Barra Bonita/Igaraçu. Isso não comprova individualmente cada posição física.
- Todas as referências de pontos nas sequências das duas linhas existem no cadastro.
- Sequências, IDs e lógica dos horários preservados. O Jaú Serve aparece duas vezes no circuito, em passagens diferentes, intencionalmente.
- Ponto 39 corrigido para **-22.4678526, -48.5619391**, conforme coordenadas fornecidas pelo responsável nesta conversa. Referência: casa do portão vermelho, de frente para a Rua Célso Sebastião. Apenas este registro teve coordenadas alteradas.
- Ponto 43: nº 669 é a casa de referência; nº 678 permanece no endereço cadastrado, conforme esclarecimento do responsável. O modal distingue os dois.
- 19 nomes ajustados. Nomes antigos permanecem em `apelidos` e continuam pesquisáveis.

## Correspondências e pendências de campo

- **15 / 45**: Banca de Calçados e Divinitos compartilham coordenadas exatamente iguais. Correspondência confirmada anteriormente pelo responsável. IDs mantidos para preservar favoritos e compatibilidade; não foram criados novos pontos.
- **11 / 10**: Prédio da Marinha usa os horários do Boca Rica por uma correspondência já existente, explicitamente provisória. Mantidos os registros e posições distintos. Confirmar em campo se é uma mesma parada ou duas paradas próximas antes de fundir qualquer cadastro.
- **Plena 101–104**: endereços ainda são referências genéricas (“Ponto de embarque central/COHAB”). Não foram inventados números ou ruas. Confirmar a localização física e detalhar esses endereços quando houver informação confiável.
- Demais posições não foram remarcadas apenas pela proximidade com outro ponto: podem representar sentidos ou paradas diferentes.

## Nomes atualizados

| ID | Nome anterior, preservado na busca | Nome atual |
| --- | --- | --- |
| 53 | Atrás do Antigo James | R. Natale Petri, 60 |
| 12 | Pracinha Lojas São Paulo | Praça da Rua Antônio Dario |
| 17 | Esquina com Armando Moretti | Arlindo Santille × Armando Moretti |
| 27 | Sorveteria (Em Frente) | Rua Prudente de Morais |
| 37 | Esquina com a Rua Orestes Gerin | Geraldo Salvi × Orestes Gerin |
| 38 | Esquina com a Rua Papa João | Geraldo Salvi × Papa João |
| 39 | Esquina com a Rua Célso Sebastião | Antônio Destro × Célso Sebastião |
| 40 | Atrás do campinho | R. Erasmo Balde, 191 |
| 41 | Em frente a casa Nº 160 | R. Júlio Guiraldello, 160 |
| 42 | Em frente ao SADH | SADH |
| 43 | Em frente a casa Nº 669 | Leonardo de Águiar — em frente ao nº 669 |
| 44 | Esquina com a Rua Jorge Pedrola | Leonardo de Águiar × Jorge Pedrola |
| 46 | Atrás da Igreja | R. Roberto Chiaratto, 500 |
| 47 | R. Mario Andréoli | R. Mário Andréoli, 245 |
| 48 | Bar ao lado do Hair Nail Studio | R. Mário Andréoli, 549 |
| 49 | Parquinho Antigo | R. Domingos Miguel Ursini, 101 |
| 50 | Atrás do Sesi | SESI — R. Avelino Bressanin |
| 51 | Esquina com a Rua Sílvio Cestari | João Morelato × Sílvio Cestari |
| 52 | Esquina com a Rua Ângelo Biliassi | Armando Moretti × Ângelo Biliassi |

## Efeito da correção geográfica nos horários

A lógica de médias foi preservada. Corrigir a posição do ponto 39 altera as distâncias usadas pela própria fórmula e, portanto, algumas estimativas entre registros. Os relatos usados como âncoras permanecem iguais: Bar do Amaral às 06:30/07:30/08:30, Hospital às 09:00 na última volta da manhã, Jaú Serve às 17:20, Igreja às 17:40, Orestes Gerin às 17:43 e Papa João às 17:46. Os testes de regressão conferem essas referências.

Não há GPS dos veículos. As projeções continuam aproximadas; a duração estimada de uma volta não foi transformada em comprovação operacional.
