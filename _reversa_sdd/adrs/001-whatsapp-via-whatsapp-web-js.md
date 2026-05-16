# ADR-001 — Integração WhatsApp via whatsapp-web.js + LocalAuth

> Status: Ativo
> Data: 🟡 INFERIDO — anterior a 2025-12-28 (data da migração `add_connection_failed_status.sql`)
> Confiança: 🟢 CONFIRMADO (tecnologia) / 🟡 INFERIDO (motivação)

## Contexto

O sistema precisa enviar e receber mensagens WhatsApp em nome do operador da lavanderia. A API oficial do WhatsApp Business requer aprovação Meta, tem custos por mensagem e limitações de tipos de conta.

## Decisão

Usar a biblioteca **whatsapp-web.js** com **Puppeteer** para automatizar o WhatsApp Web no browser, combinado com **LocalAuth** para persistir a sessão entre reinicializações do servidor.

## Justificativa

- **Custo zero**: não há cobrança por mensagem
- **Funcionalidade completa**: acessa todos os recursos do WhatsApp Web (envio de mídia, áudio, texto)
- **LocalAuth**: persiste cookies/sessão em disco — evita escaneamento de QR a cada reinicialização
- **whatsapp-web.js**: biblioteca madura com eventos bem documentados (qr, ready, message, auth_failure)

## Consequências

**Positivas:**
- Sem custo de API
- Sem processo de aprovação Meta
- Suporte a todos os tipos de mídia

**Negativas/Riscos:**
- Frágil a mudanças na interface do WhatsApp Web (quebra de automação)
- Viola os Termos de Serviço do WhatsApp (risco de ban do número)
- Processo Puppeteer consome memória significativa
- Requer mecanismos complexos de reconexão (keep-alive a cada 15min, health check a cada 30min)
- A desconexão requer `PowerShell` para matar processos Chrome no Windows

## Alternativas Consideradas

- **API Oficial WhatsApp Business**: rejeitada por custo e burocracia de aprovação
- **Twilio WhatsApp API**: rejeitada por custo por mensagem
- **Baileys (lib alternativa)**: 🔴 LACUNA — não há evidência de que foi avaliada
