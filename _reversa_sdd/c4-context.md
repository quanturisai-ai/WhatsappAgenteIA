# C4 — Diagrama de Contexto (Nível 1)

> Gerado pelo Arquiteto (Reversa) em 2026-05-16
> Referência: C4 Model — https://c4model.com

---

## Descrição

O diagrama de contexto mostra o **Agente Zap** como sistema central, os usuários que interagem com ele e os sistemas externos com os quais se integra.

---

## Diagrama Mermaid

```mermaid
C4Context
    title Diagrama de Contexto — Agente Zap

    Person(operador, "Operador da Lavanderia", "Dono ou atendente que configura e monitora o agente via dashboard web")
    Person(cliente_wpp, "Cliente da Lavanderia", "Pessoa física que envia mensagens pelo WhatsApp pessoal")

    System(agente_zap, "Agente Zap", "Sistema de atendimento automatizado via WhatsApp com IA local, programa de fidelidade e integração com VM Lavanderia")

    System_Ext(whatsapp, "WhatsApp Web", "Plataforma de mensageria. Acesso via automação de browser (whatsapp-web.js + Puppeteer)")
    System_Ext(ollama, "Ollama", "Servidor LLM local. Gera respostas de texto e embeddings. Roda modelos como deepseek-r1 localmente")
    System_Ext(vmlav, "VM Lavanderia (vmtecnologia.io)", "Plataforma SaaS de gestão de lavanderias. Fornece dados de clientes, pedidos e vouchers via REST API")
    System_Ext(whisper_ext, "faster-whisper", "Biblioteca Python de transcrição de áudio (Speech-to-Text). Roda localmente via microserviço FastAPI")

    Rel(operador, agente_zap, "Configura agente, monitora conversas, faz upload de documentos", "HTTPS/WebSocket")
    Rel(cliente_wpp, whatsapp, "Envia e recebe mensagens", "WhatsApp Protocol")
    Rel(agente_zap, whatsapp, "Recebe mensagens, envia respostas automáticas", "whatsapp-web.js (browser automation)")
    Rel(agente_zap, ollama, "Gera embeddings e respostas de texto", "HTTP REST :11434")
    Rel(agente_zap, vmlav, "Sincroniza clientes, pedidos e vouchers; autentica via Puppeteer", "HTTPS REST")
    Rel(agente_zap, whisper_ext, "Transcreve mensagens de áudio recebidas", "HTTP REST (FastAPI local)")

    UpdateRelStyle(operador, agente_zap, $textColor="black", $lineColor="#0066cc")
    UpdateRelStyle(cliente_wpp, whatsapp, $textColor="black", $lineColor="#25D366")
    UpdateRelStyle(agente_zap, whatsapp, $textColor="black", $lineColor="#25D366")
    UpdateRelStyle(agente_zap, ollama, $textColor="black", $lineColor="#6B4EFF")
    UpdateRelStyle(agente_zap, vmlav, $textColor="black", $lineColor="#FF6B35")
    UpdateRelStyle(agente_zap, whisper_ext, $textColor="black", $lineColor="#888888")
```

---

## Atores e Sistemas

### Usuários (Pessoas)

| Ator | Descrição | Canal de Acesso |
|------|-----------|----------------|
| **Operador da Lavanderia** | Dono ou funcionário que possui conta no Agente Zap. Configura o agente, faz upload de documentos, monitora conversas via dashboard Kanban e gerencia regras de fidelidade | Frontend web (HTTPS + WebSocket) |
| **Cliente da Lavanderia** | Pessoa física que entrega roupas na lavanderia e interage com o bot pelo WhatsApp pessoal. Não tem conta no Agente Zap | WhatsApp (via bot) |

### Sistemas Externos

| Sistema | Tipo | Protocolo | Observações |
|---------|------|-----------|-------------|
| **WhatsApp Web** | Plataforma de mensageria | Browser automation (Puppeteer) | Não é API oficial — usa `whatsapp-web.js` que emula o cliente web. Frágil a mudanças do WhatsApp. |
| **Ollama** | LLM local | HTTP REST :11434 | Roda localmente na mesma máquina. Modelos configuráveis (padrão: deepseek-r1). Responsável por embeddings E geração de texto. |
| **VM Lavanderia** | SaaS externo | HTTPS REST | Plataforma de gestão de lavanderias da vmtecnologia.io. Autenticação via scraping Puppeteer (captcha). URLs hardcoded. |
| **faster-whisper** | Biblioteca Python local | HTTP REST (FastAPI) | Transcrição de áudio Speech-to-Text. Roda localmente como microserviço separado. |

---

## Escala de Confiança

- 🟢 **CONFIRMADO** — todos os atores e integrações verificados no código-fonte
