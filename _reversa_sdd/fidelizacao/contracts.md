# Fidelização — Contratos HTTP

> Gerado pelo Writer (Reversa) em 2026-05-16
> Base URL: `/api/fidelizacao`
> Autenticação: **obrigatória** em todas as rotas

---

## Prêmios

### GET /api/fidelizacao/premios
Lista catálogo de prêmios.  
**Response 200:** `Premio[]`

### POST /api/fidelizacao/premios
Cria prêmio.  
**Body:** `{ "nome": "Lavagem grátis", "meta": 10, "tipo_servico": 3837 }`  
**Response 201:** `Premio`

### PUT /api/fidelizacao/premios/:id
Atualiza prêmio.  
**Response 200:** `Premio`

### DELETE /api/fidelizacao/premios/:id
Remove prêmio.  
**Response 200:** `{ "message": "Prêmio removido" }`

---

## Clientes

### GET /api/fidelizacao/clientes
Lista clientes com saldo de fidelidade calculado.  
**Response 200:** `ClienteFidelidade[]`

### GET /api/fidelizacao/clientes/distribuicao
Distribuição de clientes por faixa percentual de progresso.  
**Response 200:** `[{ percentual: 0-100, count: number }]`

### GET /api/fidelizacao/clientes/:cpf
Saldo de fidelidade de um cliente.  
**Response 200:**
```json
{
  "atual": 7,
  "proximoObjetivo": 10,
  "faltam": 3,
  "proximoPremio": "Lavagem grátis",
  "conquistas": 2
}
```

### GET /api/fidelizacao/clientes/:cpf/pedidos
Histórico de pedidos filtrados (apenas Sucesso + não pagos com fidelidade).  
**Response 200:** `VmLavPedido[]`

### POST /api/fidelizacao/clientes/:cpf/apurar
Apura e registra prêmios conquistados pelo cliente.  
**Response 200:** `{ "conquistasGeradas": 1 }`

---

## Conquistas

### GET /api/fidelizacao/conquistas
Lista prêmios conquistados.  
**Response 200:** `PremioCliente[]`

### PUT /api/fidelizacao/conquistas/:id/utilizar
Marca prêmio como utilizado.  
**Response 200:** `PremioCliente`

### PUT /api/fidelizacao/conquistas/:id/entrega
Registra entrega física do prêmio.  
**Response 200:** `PremioCliente`

### PUT /api/fidelizacao/conquistas/:id/gerar-voucher
Gera voucher na API VM Lav para a conquista.  
**Response 200:** `{ "voucher": { "codigo": "XXXX", "validade": "..." } }`

---

## Notificações e Config

### GET /api/fidelizacao/notificacoes
Lista notificações enviadas.  
**Response 200:** `FidelizacaoNotificacao[]`

### POST /api/fidelizacao/notificacoes/:id/reenviar
Reenvia notificação ignorando anti-spam.  
**Response 200:** `{ "message": "Notificação reenviada" }`

### GET /api/fidelizacao/config
Configuração global do programa.  
**Response 200:** `FidelizacaoConfig`

### PATCH /api/fidelizacao/config/simulacao
Atualiza modo de simulação.  
**Response 200:** `FidelizacaoConfig`

---

## Automações

### GET /api/fidelizacao/automacoes/tipos
Lista tipos de gatilho disponíveis.  
**Response 200:** `TipoGatilho[]`

### GET /api/fidelizacao/automacoes/config
Configuração global das automações.  
**Response 200:** `AutomacoesConfig`

### PUT /api/fidelizacao/automacoes/config
Atualiza configuração das automações.  
**Response 200:** `AutomacoesConfig`

### GET /api/fidelizacao/automacoes/regras
Lista regras cadastradas.  
**Response 200:** `FidelizacaoRegra[]`

### POST /api/fidelizacao/automacoes/regras
Cria nova regra.  
**Body:** `{ "tipo_gatilho_id": 1, "vigencia_inicio": "...", "vigencia_fim": "...", "ativa": true, ... }`  
**Response 201:** `FidelizacaoRegra`

### PUT /api/fidelizacao/automacoes/regras/:id
Atualiza regra.  
**Response 200:** `FidelizacaoRegra`

### DELETE /api/fidelizacao/automacoes/regras/:id
Remove regra.  
**Response 200:** `{ "message": "Regra removida" }`

### PATCH /api/fidelizacao/automacoes/regras/:id/toggle
Ativa/desativa regra.  
**Response 200:** `FidelizacaoRegra`

### POST /api/fidelizacao/automacoes/regras/preview
Preview de regra por body (sem ID — regra ainda não salva).  
**Body:** `FidelizacaoRegra parcial`  
**Response 200:** `{ "clientesAfetados": 45, "preview": [...] }`

### POST /api/fidelizacao/automacoes/regras/:id/preview
Preview de regra existente por ID.  
**Response 200:** `{ "clientesAfetados": 45, "preview": [...] }`
