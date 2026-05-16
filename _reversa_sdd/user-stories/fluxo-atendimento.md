# User Stories — Fluxo de Atendimento WhatsApp com IA

> Gerado pelo Writer (Reversa) em 2026-05-16
> Confiança geral: 🟢 CONFIRMADO (extraído de code-analysis.md, flowcharts e state-machines.md)

---

## Épico: Configuração Inicial do Agente

**US-01** — Como operador, quero criar minha conta e fazer login, para acessar o sistema.
- Critério de aceite: POST /api/auth/register cria conta; POST /api/auth/login retorna JWT
- Rastreabilidade: `autenticacao/`

**US-02** — Como operador, quero configurar o perfil do meu negócio (nome, serviços, horário, personalidade), para que a IA responda em nome da minha empresa.
- Critério de aceite: PUT /api/agent-config persiste configurações; IA usa essas informações no prompt
- Rastreabilidade: `configuracao-agente/`

**US-03** — Como operador, quero fazer upload de documentos (.pdf, .docx, .txt) com informações do meu negócio, para que a IA possa respondê-las com base neles.
- Critério de aceite: Documento indexado aparece nas respostas da IA quando relevante
- Rastreabilidade: `documento/`, `indexacao/`

**US-04** — Como operador, quero criar tópicos de conhecimento com palavras-chave gatilho, para que a IA priorize esse conteúdo quando o cliente perguntar sobre ele.
- Critério de aceite: Tópico com keyword "horário" é priorizado quando cliente pergunta sobre horário
- Rastreabilidade: `topico/`, `indexacao/`

---

## Épico: Ativação do WhatsApp

**US-05** — Como operador, quero inicializar a conexão WhatsApp e escanear o QR code, para que o agente comece a receber mensagens dos meus clientes.
- Critério de aceite: POST /api/whatsapp/initialize gera QR code; após scan, status = "connected"
- Rastreabilidade: `whatsapp/`

**US-06** — Como operador, quero que o sistema reconecte automaticamente após reiniciar o servidor, para não precisar escanear o QR code toda vez.
- Critério de aceite: Após restart, sessão com status "connected" é reconectada sem intervenção
- Rastreabilidade: `whatsapp/` (auto-reconnect no startup)

---

## Épico: Atendimento Automatizado

**US-07** — Como cliente, quero enviar uma mensagem no WhatsApp e receber uma resposta automática da IA em segundos, para resolver minha dúvida sem esperar um atendente humano.
- Critério de aceite: Pipeline RAG processa mensagem e envia resposta via WhatsApp em < 60s
- Rastreabilidade: `conversa/`, `indexacao/`

**US-08** — Como cliente, quero receber vídeos ou imagens promocionais no início do atendimento, para conhecer os serviços disponíveis.
- Critério de aceite: Mídias com mandatory_send=true são enviadas antes da primeira resposta da IA
- Rastreabilidade: `midia/`, `conversa/`

**US-09** — Como operador, quero que a IA solicite automaticamente intervenção humana quando necessário, para que minha equipe seja alertada via WhatsApp.
- Critério de aceite: Quando IA emite [ALERTA_ATENDENTE:msg], o atendente configurado recebe WhatsApp com o alerta
- Rastreabilidade: `atendente-humano/`, `conversa/`

---

## Épico: Controle pelo Operador

**US-10** — Como operador, quero pausar a IA em uma conversa específica para atender o cliente pessoalmente, sem que a IA interfira.
- Critério de aceite: POST /:id/pause → auto_responding=false; próximas mensagens não geram resposta da IA
- Rastreabilidade: `conversa/`

**US-11** — Como operador, quero retomar a IA depois de resolver o atendimento humano, para que o sistema volte a responder automaticamente.
- Critério de aceite: POST /:id/resume → auto_responding=true; próximas mensagens são respondidas pela IA
- Rastreabilidade: `conversa/`

**US-12** — Como operador, quero testar o comportamento da IA sem precisar do WhatsApp ativo, para validar as configurações antes de ativar para clientes.
- Critério de aceite: POST /api/test-chat com mensagem retorna resposta da IA em < 60s
- Rastreabilidade: `teste-chat/`

**US-13** — Como operador, quero verificar quais modelos estão disponíveis no Ollama, para selecionar o mais adequado para meu negócio.
- Critério de aceite: GET /api/ollama/models retorna lista de modelos instalados
- Rastreabilidade: `ollama/`

---

## Épico: Resiliência e Monitoramento

**US-14** — Como operador, quero que o sistema monitore automaticamente a conexão WhatsApp e me notifique se ela cair, para manter o atendimento funcionando.
- Critério de aceite: Após 4 falhas no keep-alive (~1h), status muda para "connection_failed"
- Rastreabilidade: `whatsapp/` (keep-alive)

**US-15** — Como operador, quero que conversas sem atividade há mais de 12 horas sejam encerradas automaticamente, para manter o painel organizado.
- Critério de aceite: Background job finaliza conversas inativas; IA retoma automaticamente na próxima mensagem
- Rastreabilidade: `conversa/` (finalizeOldConversations)
