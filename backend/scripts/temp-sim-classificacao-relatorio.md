# Relatório de simulação — nova classificação sobre dados legados

Gerado em: 2026-07-18T21:44:11.866Z — script READ-ONLY (apenas SELECT)

## Volumetria

- Conversas: **1114**
- Mensagens: **11255**
- Notificações de fidelização enviadas (enviado_whatsapp=1): **2399**

## 1. Distribuição de sources derivados (backfill proposto para messages)

| Source | Mensagens |
|---|---|
| client | 2259 |
| ai | 1772 |
| human | 5002 |
| automation | 2222 |

> 2222 mensagens de automação estão hoje gravadas como se fossem de um humano (is_from_ai=0). O backfill as reclassificaria como 'automation'.

## 2. Kanban ATUAL vs PROPOSTO

| Coluna atual | Conversas |
|---|---|
| finalizado | 1081 |
| pendencias | 22 |
| nova_interacao | 10 |
| em_atendimento | 1 |

| Coluna proposta | Conversas |
|---|---|
| finalizadas | 1089 |
| pendencias | 22 |
| humano_atendendo | 2 |
| ia_atendendo | 1 |

### Matriz de migração (para onde cada card iria)

| Transição | Conversas |
|---|---|
| finalizado → finalizadas | 1079 |
| pendencias → pendencias | 22 |
| nova_interacao → finalizadas | 10 |
| finalizado → humano_atendendo | 2 |
| em_atendimento → ia_atendendo | 1 |

Total de conversas que mudariam de coluna: **1092** de 1114

## 3. Problemas do diagnóstico quantificados nos dados reais

### P1 — Conversas 'new' criadas só por disparo (cliente nunca falou) — poluem "Nova Interação": **0** conversa(s)

### P2 — Finalizadas com needs_intervention=1 — presas em "Pendências" para sempre: **20** conversa(s)

| Conv | Contato | Status atual | Última msg |
|---|---|---|---|
| 8 | Barbara Portilho (5561****6299) | finished | 2026-06-28T20:34:00.000Z |
| 20 | 556282465179 (5562****5179) | finished | 2026-06-28T20:52:20.000Z |
| 35 | 556298007888 (5562****7888) | finished | 2026-06-26T19:31:30.000Z |
| 318 | 556282112653 (5562****2653) | finished | 2026-05-05T17:49:41.000Z |
| 346 | 556291897050 (5562****7050) | finished | 2026-07-12T15:53:06.000Z |
| 422 | 556294356333 (5562****6333) | finished | 2026-04-28T14:33:19.000Z |
| 458 | 556281639330 (5562****9330) | finished | 2026-04-12T14:44:56.000Z |
| 470 | 556285170391 (5562****0391) | finished | 2026-04-08T22:23:57.000Z |
| 552 | Pedaco Do will (5598****5859) | finished | 2026-05-02T19:43:48.000Z |
| 606 | 556295078269 (5562****8269) | finished | 2026-06-26T19:31:34.000Z |
| ... | +10 conversas | | |

### P3 — Ativas com cliente inativo além do limite, mantidas "vivas" por mensagens não-cliente (job atual nunca finaliza): **0** conversa(s)

### P4 — 'in_progress' com última mensagem do cliente SEM resposta (falha silenciosa / falso "Em Atendimento"): **0** conversa(s)

### P6 — Humano atendendo (última resposta humana) mas card parado em "Nova Interação": **0** conversa(s)

### P5 — Status 'paused' (estado morto no ENUM): **0** conversa(s)

## 4. Amostra de mudanças de coluna (primeiras 20)

| Conv | Contato | De | Para |
|---|---|---|---|
| 1 | AS medicamentos (5562****8742) | finalizado | finalizadas |
| 2 | 556191829445 (5561****9445) | finalizado | finalizadas |
| 3 | Lavateria Park Lozandes (5562****3767) | finalizado | finalizadas |
| 6 | 18772241042 (1877***1042) | finalizado | finalizadas |
| 9 | 556293267158 (5562****7158) | finalizado | finalizadas |
| 10 | 5561981935443 (5561*****5443) | finalizado | finalizadas |
| 11 | 556192568616 (5561****8616) | finalizado | finalizadas |
| 13 | 556284732205 (5562****2205) | finalizado | finalizadas |
| 14 | 556295395041 (5562****5041) | finalizado | finalizadas |
| 15 | 556281108290 (5562****8290) | finalizado | finalizadas |
| 16 | 556298251924 (5562****1924) | finalizado | finalizadas |
| 17 | 556299112697 (5562****2697) | finalizado | finalizadas |
| 18 | 553492071292 (5534****1292) | finalizado | finalizadas |
| 19 | 556281487188 (5562****7188) | finalizado | finalizadas |
| 21 | 556285486271 (5562****6271) | finalizado | finalizadas |
| 22 | 556296398884 (5562****8884) | finalizado | finalizadas |
| 23 | 556282628263 (5562****8263) | finalizado | finalizadas |
| 24 | 556299133329 (5562****3329) | finalizado | finalizadas |
| 25 | 556285464925 (5562****4925) | finalizado | finalizadas |
| 26 | 556281025286 (5562****5286) | finalizado | finalizadas |

---
Relatório gerado por scripts/temp-sim-classificacao-legado.ts (temporário, read-only).