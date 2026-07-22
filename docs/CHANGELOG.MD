# Changelog - BarraBus

---

## Backup de Dados - 22/07/2026

### Horarios.json (ANTES da atualizacao)

Estrutura: 3 linhas com horarios separados por dia da semana.

#### Linha 01 - Habitacional / Centro / Cecap / Sonho Nosso

**Uteis:**
06:20, 07:05, 08:00, 09:00, 11:15, 13:15, 15:15, 17:15, 18:15

**Sabado:**
06:20, 07:05, 08:00, 09:00, 11:15, 13:15, 15:15, 17:15, 18:15

**Domingo:**
08:00, 11:15, 15:15, 18:15

#### Linha 02 - Centro / Nova Barra / Cohab

**Uteis:**
06:20, 07:20, 10:15, 12:15, 16:15, 17:15

**Sabado:**
06:20, 07:20, 10:15, 12:15, 16:15, 17:15

**Domingo:**
10:15, 16:15

#### Linha 03 - Centro / Sonho Nosso / Hotel Estancia

**Uteis:**
06:30, 07:15, 08:30, 10:00, 12:00, 14:00, 16:00, 17:00, 18:00, 19:30, 23:00

**Sabado:**
06:30, 07:15, 08:30, 10:00, 12:00, 14:00, 16:00, 17:00, 18:00, 19:30

**Domingo:**
08:30, 12:00, 16:00, 18:00

---

### linhas.json (mantido como esta)

| ID | Nome                                    | Cor     |
|----|-----------------------------------------|---------|
| 1  | Linha 01 - Habitacional / Centro / Cecap / Sonho Nosso | #f1c40f |
| 2  | Linha 02 - Centro / Nova Barra / Cohab  | #e74c3c |
| 3  | Linha 03 - Centro / Sonho Nosso / Hotel Estancia | #3498db |

---

### Fonte dos dados antigos
Dados preenchidos automaticamente na refactorizacao do projeto (baseados em estimativas dos dados originais do JSON).

---

## Atualizacao de Horarios - 22/07/2026

### Motivo
Horarios antigos eram estimativas/ficticios. Horarios novos foram coletados diretamente com a motorista do onibus.

### Horarios.json (DEPOIS da atualizacao)

Estrutura: 3 linhas com os MESMOS horarios (facilita remocao futura de linhas).

#### Todas as linhas (01, 02, 03) - Horario Circular

**Uteis:**
- Saindo da Av. Joao Paulo (manha): 06:15, 07:15, 08:15
- Saindo da Rodovia (tarde/noite): 12:00, 13:15, 15:15, 17:15, 18:15

**Sabado:**
- Saindo da Av. Joao Paulo (manha): 06:15, 07:15, 08:15
- Saindo da Rodovia (tarde/noite): 15:15, 17:15
- Removidos do sabado: 12:00, 13:15, 18:15

**Domingo:**
- Sem servico

### Notas
- A Av. Joao Paulo e a Rodovia sao 2 pontos de partida da mesma linha circular
- Manha sai da Av. Joao Paulo, tarde/noite sai da Rodovia
- As 3 linhas no sistema estao com os mesmos horarios por enquanto
- O conceito de "linhas separadas" pode nao existir mais (pendente verificacao)
- Para remover linhas futuramente, basta deletar os objetos do JSON
