# User Stories — Fluxo do Programa de Fidelização

> Gerado pelo Writer (Reversa) em 2026-05-16
> Confiança geral: 🟢 CONFIRMADO (extraído de code-analysis.md e flowcharts/fidelizacao.md)

---

## Épico: Integração com VM Lavanderia

**US-F01** — Como operador, quero configurar minhas credenciais do VM Lav, para que o sistema sincronize automaticamente os dados de clientes e pedidos.
- Critério de aceite: POST /api/vmlav/credentials persiste credenciais; POST /test-connection retorna sucesso
- Rastreabilidade: `vmlav/`

**US-F02** — Como operador, quero que o sistema sincronize clientes e pedidos do VM Lav automaticamente a cada 10 minutos, para ter dados sempre atualizados sem intervenção manual.
- Critério de aceite: Scheduler executa sync a cada 10min; novos clientes aparecem em GET /clientes
- Rastreabilidade: `vmlav/` (vmLavScheduler)

**US-F03** — Como operador, quero que quando um cliente do WhatsApp seja identificado como cliente da lavanderia (via número de telefone), seus dados apareçam no painel de conversas.
- Critério de aceite: GET /api/conversations/:id retorna dados do cliente VM Lav quando telefone coincide
- Rastreabilidade: `conversa/` (LEFT JOIN normaliza_telefone), `vmlav/`

---

## Épico: Programa de Pontos

**US-F04** — Como operador, quero cadastrar prêmios com metas de utilização (ex: 10 lavagens = 1 lavagem grátis), para criar um programa de fidelidade para meus clientes.
- Critério de aceite: POST /api/fidelizacao/premios cria prêmio; GET retorna catálogo atualizado
- Rastreabilidade: `fidelizacao/`

**US-F05** — Como operador, quero consultar o saldo de fidelidade de um cliente pelo CPF, para saber quantas utilizações ele acumulou e qual o próximo prêmio.
- Critério de aceite: GET /api/fidelizacao/clientes/:cpf retorna SaldoFidelidade com atual, faltam e próximoPremio
- Rastreabilidade: `fidelizacao/` (FidelizacaoService.calcularSaldo)

**US-F06** — Como operador, quero apurar os prêmios conquistados por um cliente, para registrar formalmente que ele atingiu a meta.
- Critério de aceite: POST /clientes/:cpf/apurar cria registros em premios_clientes para metas atingidas
- Rastreabilidade: `fidelizacao/`

**US-F07** — Como operador, quero gerar um voucher de desconto para um cliente que conquistou um prêmio, para formalizar o benefício na plataforma VM Lav.
- Critério de aceite: PUT /conquistas/:id/gerar-voucher cria voucher na API VM Lav e retorna código
- Rastreabilidade: `fidelizacao/` (FidelizacaoVoucherAutoService)

**US-F08** — Como operador, quero visualizar a distribuição dos clientes por percentual de progresso ao próximo prêmio, para entender o engajamento do programa.
- Critério de aceite: GET /clientes/distribuicao retorna agrupamentos percentuais
- Rastreabilidade: `fidelizacao/`

---

## Épico: Automações de Engajamento

**US-F09** — Como operador, quero criar automações com gatilhos (ex: cliente sem compras há 30 dias), para que o sistema envie mensagens de reativação automaticamente.
- Critério de aceite: Regra com tipo_gatilho "reativação" e segmentacao "sem compras há 30 dias" dispara mensagem WhatsApp para clientes elegíveis
- Rastreabilidade: `fidelizacao/` (FidelizacaoRegrasService)

**US-F10** — Como operador, quero que o sistema não reenvie a mesma mensagem para o mesmo cliente antes do intervalo mínimo configurado, para evitar spam.
- Critério de aceite: Segundo disparo antes do intervalo é bloqueado (bloqueado_antispam=true)
- Rastreabilidade: `fidelizacao/` (filtros anti-spam)

**US-F11** — Como operador, quero fazer um preview de uma automação antes de ativá-la, para ver quantos clientes seriam afetados sem enviar mensagens reais.
- Critério de aceite: POST /automacoes/regras/preview retorna { clientesAfetados: N } sem enviar nada
- Rastreabilidade: `fidelizacao/` (previewRegraByBody)

**US-F12** — Como operador, quero configurar uma janela de vigência para cada automação (data de início e fim), para que campanhas temporárias sejam encerradas automaticamente.
- Critério de aceite: Automação com vigencia_fim = ontem não dispara mesmo se ativa=true
- Rastreabilidade: `fidelizacao/` (verificação de vigência no motor)

---

## Épico: Notificações via WhatsApp

**US-F13** — Como cliente da lavanderia, quero receber uma mensagem WhatsApp quando estiver próximo de conquistar um prêmio, para ser incentivado a continuar usando os serviços.
- Critério de aceite: Automação do tipo "próximo da meta" envia mensagem ao telefone do cliente via WhatsApp
- Rastreabilidade: `fidelizacao/`, `whatsapp/`

**US-F14** — Como operador, quero visualizar o histórico de notificações enviadas pelo programa de fidelidade, para monitorar o alcance das automações.
- Critério de aceite: GET /api/fidelizacao/notificacoes retorna lista de envios com data, cliente e tipo
- Rastreabilidade: `fidelizacao/`

**US-F15** — Como operador, quero reenviar uma notificação específica para um cliente, mesmo que o anti-spam esteja ativo, para casos de exceção.
- Critério de aceite: POST /notificacoes/:id/reenviar ignora bloqueio anti-spam e reenvia a mensagem
- Rastreabilidade: `fidelizacao/`
