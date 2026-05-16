# ADR-004 — Senha VM Lav armazenada em Texto Plano (reversão de criptografia)

> Status: Ativo (problemático)
> Data: 🟢 CONFIRMADO — migration `rename_senha_criptografada_to_senha.sql` com comentário explícito
> Confiança: 🟢 CONFIRMADO

## Contexto

A coluna original na tabela `vm_lav_credentials` chamava-se `senha_criptografada`, sugerindo que a senha era armazenada de forma criptografada. Uma migration posterior renomeou para `senha` com o comentário `'Senha em texto plano'`, revertendo a proteção.

## Decisão

A senha de acesso à plataforma VM Lavanderia é armazenada em **texto plano** no banco MariaDB. O nome original `senha_criptografada` foi abandonado.

## Motivação Provável (🟡 INFERIDA)

A senha precisa ser recuperada em texto plano para ser inserida automaticamente no formulário de login via Puppeteer. Uma criptografia irreversível (como bcrypt) impossibilitaria isso. Provavelmente optou-se por remover a criptografia ao invés de implementar criptografia simétrica (AES).

## Consequências

**Positivas:**
- Simplifica o código de Puppeteer (senha disponível diretamente)

**Negativas/Riscos:**
- 🔴 **Crítico**: qualquer acesso não autorizado ao banco expõe credenciais da VM Lav em texto claro
- 🔴 **Regulatório**: pode violar LGPD dependendo da natureza dos dados acessíveis com essas credenciais
- Sem possibilidade de recuperação do que foi antes criptografado

## Alternativas que Deveriam Ser Consideradas

- **Criptografia simétrica (AES-256)**: armazenar a senha cifrada com uma chave do `.env`. A descriptografia seria feita antes de passar ao Puppeteer.
- **HashiCorp Vault / AWS Secrets Manager**: armazenamento externo de segredos
- **Variável de ambiente**: nunca persistir no banco — usuário informa a senha a cada startup
