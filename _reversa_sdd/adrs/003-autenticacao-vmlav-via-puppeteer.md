# ADR-003 — Autenticação VM Lavanderia via Puppeteer Scraping

> Status: Ativo
> Data: 🟡 INFERIDO — junto com a adição do módulo vmLav
> Confiança: 🟢 CONFIRMADO (implementação)

## Contexto

O sistema precisa acessar dados de clientes e pedidos da plataforma VM Lavanderia (vmtecnologia.io). A API requer autenticação com JWT, mas não há documentação pública de uma API de autenticação programática direta — o login envolve resolução de captcha via interface web.

## Decisão

Usar **Puppeteer** para simular o login na interface web da VM Lavanderia, incluindo interação com o captcha. Após o login bem-sucedido, o JWT é extraído do `localStorage` do browser. O `VmLavConnectionManager` gerencia o ciclo de vida do token, renovando-o automaticamente quando expirado.

## Justificativa

- **Ausência de API de autenticação pública**: a plataforma VM Lav não expõe um endpoint direto de autenticação para integrações
- **Acesso necessário**: dados de clientes e pedidos são essenciais para o programa de fidelidade
- **Automação**: Puppeteer é a única forma viável de obter o token sem acesso a documentação interna

## Consequências

**Positivas:**
- Viabiliza a integração sem parceria formal com a VM Tecnologia
- Token renovado automaticamente

**Negativas/Riscos:**
- 🔴 **Extremamente frágil**: qualquer mudança no layout ou fluxo de login da VM Lav quebra a autenticação
- 🔴 **Captcha**: se o captcha mudar de provedor ou dificuldade, o login pode falhar completamente
- 🔴 **Viola ToS**: provavelmente viola os termos de uso da plataforma VM Lav
- Consumo extra de memória por instância Puppeteer adicional
- Dificuldade de debugging quando falha

## Alternativas Consideradas

- **API oficial VM Lav**: 🔴 LACUNA — sem documentação pública encontrada
- **Parceria/integração formal**: 🔴 LACUNA — não há evidência de tentativa
- **Exportação manual de dados**: descartada por não ser tempo-real
