# VM Lav — Perguntas e Lacunas 🔴

> Gerado pelo Writer (Reversa) em 2026-05-16
> Estas perguntas requerem validação humana antes da reimplementação.

---

## Q-01 — Estratégia de resolução do captcha

**Lacuna:** A autenticação no VM Lav usa Puppeteer para navegar na tela de login que possui captcha. O código não deixa claro como o captcha é resolvido.

**Perguntas:**
- O captcha é resolvido manualmente pelo operador?
- Existe integração com algum serviço de resolução de captcha (ex: 2captcha)?
- O captcha é bypassado de alguma outra forma (ex: cookie de sessão longo)?

**Impacto:** Sem resolver esta lacuna, a autenticação automática no VM Lav não pode ser reimplementada com fidelidade.

---

## Q-02 — Senha em texto plano

**Lacuna:** ADR-004 confirma que a senha de acesso ao VM Lav é armazenada em texto plano no banco MariaDB.

**Perguntas:**
- Esta decisão é aceitável para a reimplementação ou deve ser corrigida?
- Se deve ser corrigida: qual algoritmo de criptografia usar? (AES-256-GCM recomendado)
- Onde armazenar a chave de criptografia? (env var, KMS, cofre de segredos?)

**Impacto:** Risco de segurança crítico — comprometimento do banco expõe credenciais do sistema externo.

---

## Q-03 — Constantes hardcoded da empresa

**Lacuna:** Os valores `idEmpresa=1737`, `empresaLocalizador='lavateriajdnovomundo'` e IDs dos serviços (`LAVAGEM=3837`, `SECAGEM=3838`) estão hardcoded no código.

**Perguntas:**
- Estes valores são fixos e válidos para sempre (sistema é mono-tenant)?
- Ou precisam ser configuráveis (cenário multi-tenant ou mudança de ambiente)?
- As URLs da API (`apps.vmhub.vmtecnologia.io`) podem mudar?

**Impacto:** Se o sistema for reusado para outra lavanderia ou o ambiente mudar, toda a integração quebra.

---

## Q-04 — Comportamento quando token expira durante sync

**Lacuna:** O `VmLavConnectionManager` gerencia renovação automática do token, mas não está claro o que acontece se o token expirar no meio de uma sincronização em andamento.

**Perguntas:**
- O sync em andamento é abortado e reprocessado?
- A renovação é transparente (midstream)?
- Há retry automático?

---

## Q-05 — Escopo da função SQL `normaliza_telefone()`

**Lacuna:** A função `normaliza_telefone()` é usada no JOIN entre `conversations` e `vm_lav_clientes`, mas sua lógica exata não foi lida.

**Perguntas:**
- A função normaliza formato brasileiro (remove 55, DDD, formatação)?
- Como ela trata números com ou sem o dígito 9 extra?
- Está documentada algum DDL para esta função?

**Impacto:** JOIN entre conversas e clientes pode falhar silenciosamente se a normalização estiver incorreta.
