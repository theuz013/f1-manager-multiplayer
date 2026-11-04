# F1 MANAGER — ESPECIFICAÇÃO MULTIPLAYER v1.0

## Documento de Concepção e Regras de Negócio

---

## 1. VISÃO GERAL

- Multiplayer **assíncrono** baseado em ligas privadas
- Cada jogador administra sua equipe (pilotos, carro, finanças, estratégia)
- Corridas **simuladas automaticamente** pelo servidor em horários pré-definidos
- Modo Multiplayer **não compromete** o Modo Carreira Solo

## 2. ESTRUTURA DAS LIGAS

| Configuração | Regra |
|---|---|
| Equipes no grid | **11 fixas** |
| Jogadores humanos | 1 a 11 |
| Equipes IA | Completam o grid |
| Grandes Prêmios | **12** |
| Intervalo entre GPs | **48 horas** |
| Formato | **Assíncrono** |

- Um jogador cria a liga como **administrador**
- Participantes entram por **convite ou código de acesso**

## 3. EQUILÍBRIO INICIAL

Todas as 11 equipes começam em **condições absolutamente iguais**:
- Mesmo orçamento
- Mesmo desempenho dos carros
- Mesma capacidade de desenvolvimento
- Mesmas condições financeiras

> Nomes e identidades visuais são mantidos, mas parâmetros competitivos equalizados.

## 4. DRAFT DE EQUIPES

1. Jogadores confirmam presença
2. **Sorteio aleatório** da ordem de escolha
3. Cada jogador escolhe uma equipe (fica indisponível para os demais)
4. Equipes restantes → IA

> A ordem do Draft de equipes **NÃO** determina a ordem do Draft de pilotos.

## 5. MERCADO INICIAL — SNAKE DRAFT

### Pote 1 — Elite (11 pilotos)
- GER alto e muito próximo (diferença máx de 1-2 pts)
- Diversidade em: idade, habilidades, personalidade, potencial, experiência

### Pote 2 — Desenvolvimento (≥11 pilotos)
- GER intermediário e equilibrado
- Jovens promessas, talentos em desenvolvimento, estreantes

### Snake Draft
1. **Pote 1:** Jogador 1 → 2 → 3 → ... → 11
2. **Pote 2:** Jogador 11 → 10 → 9 → ... → 1

- Prazo por escolha: **30 minutos**
- Timeout = escolha automática
- IA escolhe instantaneamente

## 6. SISTEMA FINANCEIRO

- **Valor de contratação fixo** por pote (todos iguais dentro do pote)
- **Salários individuais** (variam por GER, idade, potencial, reputação)
- **Orçamento único** compartilhado entre pilotos + carro + operações

## 7. CALENDÁRIO E CORRIDAS

- 12 GPs com intervalo de 48h
- Conversão automática de fuso horário
- **Bloqueio de configurações** 1h antes da largada
- **Simulação automática** no horário programado

### Fluxo de cada GP:
| Horário | Evento |
|---|---|
| Até T-1h | Preparação assíncrona |
| T-1h | Bloqueio (server-side) |
| T | Simulação automática |
| Após | Resultados publicados |

## 8. MERCADO DINÂMICO (Pós-Draft)

Três fontes de movimentação:
1. **Geração de novos pilotos** (reposição do mercado)
2. **Contratação de agentes livres**
3. **Transferências entre equipes** (com negociação multi-parte)

### Transferências:
1. Jogador seleciona piloto de outra equipe
2. Envia proposta ao proprietário
3. Proprietário aceita/recusa/contraproposta
4. Piloto avalia e decide
5. Confirmação

### Modalidades:
- Contratação de livres
- Transferências
- Contrapropostas
- Renovações
- Pré-contratos
- Empréstimos
- Rescisões

## 9. FLUXO COMPLETO DA LIGA

```
ETAPA 1: Criação → Convites → Config
ETAPA 2: Draft de Equipes
ETAPA 3: Snake Draft de Pilotos (Pote 1 + Pote 2)
ETAPA 4: Fechamento Financeiro
ETAPA 5: Preparação Inicial
ETAPA 6: Temporada (12 GPs + Mercado Dinâmico)
ETAPA 7: Encerramento + Entressafra
```

## 10. VALORES PENDENTES DE DEFINIÇÃO

| Assunto | Status |
|---|---|
| Orçamento inicial | 🔴 Pendente |
| Valor contratação Pote 1 | 🔴 Pendente |
| Valor contratação Pote 2 | 🔴 Pendente |
| Fórmula de salários | 🔴 Pendente |
| Faixa GER Pote 1 | 🔴 Pendente |
| Faixa GER Pote 2 | 🔴 Pendente |
| Qtd pilotos Pote 2 | 🔴 Pendente |
| Prazo Draft (30min?) | 🟡 Provisório |
| Prazo resposta propostas (24h?) | 🟡 Provisório |
| Premiações por GP | 🔴 Pendente |
| Duração contratos | 🔴 Pendente |
| Janelas de transferência | 🔴 Pendente |
| Frequência geração talentos | 🔴 Pendente |
| Critérios promoção F2 | 🔴 Pendente |
| Duração entressafra | 🔴 Pendente |

## 11. DIRETRIZES TÉCNICAS

1. Reaproveitar sistema existente de pilotos, mercado, contratos, personalidades
2. Mercado compartilhado por toda a liga
3. Dados consistentes entre todos os participantes
4. Simulações centralizadas no servidor
5. Bloqueio validado server-side
6. Prazos funcionam mesmo offline
7. Todas as transações registradas
8. IA obedece mesmas regras dos humanos
9. Fusos horários corretos
10. Identidades únicas de pilotos por liga

