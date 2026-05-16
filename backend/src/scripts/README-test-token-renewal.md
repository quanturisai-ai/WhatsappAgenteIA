# Script de Teste: Renovação de Tokens VM Lav

## Descrição

Este script testa a capacidade de renovar tokens VM Lav usando o `token_inicial` para gerar novos `token_aplicacao` sem precisar de login manual ou Puppeteer.

## Objetivos do Teste

1. ✅ Verificar se `token_inicial` pode gerar `token_aplicacao`
2. ✅ Testar se a renovação funciona múltiplas vezes
3. ✅ Validar se o token renovado funciona em requisições reais
4. ✅ Simular renovação periódica
5. ✅ Verificar conceito de renovação proativa

## Como Executar

### Opção 1: Via npm script
```bash
cd backend
npm run test:token-renewal
```

### Opção 2: Via ts-node diretamente
```bash
cd backend
npx ts-node src/scripts/test-vmLav-token-renewal.ts
```

## Pré-requisitos

1. **Credenciais VM Lav configuradas**: Deve haver pelo menos uma credencial ativa no banco de dados
2. **Token inicial válido**: O `token_inicial` deve estar presente e válido nas credenciais
3. **Banco de dados acessível**: O script precisa de conexão com o banco

## O que o Script Faz

### 1. Busca Credenciais Ativas
- Procura por credenciais com `ativo = 1` e `status = 'ativo'`
- Seleciona o primeiro usuário encontrado

### 2. Verifica Tokens
- Verifica se `token_inicial` existe e está válido
- Verifica se `token_aplicacao` existe e está válido
- Mostra tempo restante até expiração

### 3. Testa Renovação
- Tenta gerar novo `token_aplicacao` usando `token_inicial`
- Valida se o novo token é válido
- Testa se o token funciona em requisições reais (busca de clientes)

### 4. Testa Renovação Múltipla
- Simula 3 renovações consecutivas
- Verifica se todas funcionam corretamente

### 5. Testa Conceito de Renovação Proativa
- Verifica se token está próximo de expirar (< 30 minutos)
- Recomenda renovação proativa quando necessário

### 6. Testa Método `obterTokenValido()`
- Testa o método que já existe no serviço
- Verifica se faz renovação automática quando necessário

## Resultados Esperados

### ✅ Sucesso
```
✅ Token de aplicação gerado com sucesso!
✅ Novo token é válido!
✅ Token funciona! Requisição bem-sucedida.
✅ Todas as renovações foram bem-sucedidas!
```

### ❌ Falhas Comuns

1. **Nenhuma credencial ativa**
   ```
   ❌ Nenhuma credencial ativa encontrada. Configure credenciais primeiro.
   ```
   **Solução**: Configure credenciais VM Lav primeiro via interface ou API

2. **Token inicial expirado**
   ```
   ⚠️  Token inicial não está válido, não é possível testar renovação
   ```
   **Solução**: Reconfigure as credenciais para obter novo `token_inicial`

3. **Erro ao gerar token**
   ```
   ❌ Falha ao gerar token de aplicação
   ```
   **Solução**: Verifique se o `token_inicial` ainda é válido no servidor VM Lav

## Interpretação dos Resultados

### Se todas as renovações funcionarem:
✅ **Conclusão**: O sistema pode usar `token_inicial` para renovação periódica sem Puppeteer

### Se algumas renovações falharem:
⚠️ **Conclusão**: Pode haver limitação de taxa ou problema de conectividade

### Se nenhuma renovação funcionar:
❌ **Conclusão**: `token_inicial` pode estar expirado ou inválido - necessário reconfigurar credenciais

## Próximos Passos

Após validar que a renovação funciona:

1. **Implementar Scheduler de Renovação Proativa**
   - Verificar tokens a cada 15-30 minutos
   - Renovar quando faltar < 30 minutos para expirar
   - Atualizar `token_expira_em` no banco

2. **Adicionar Keep-Alive**
   - Fazer requisições periódicas para manter sessão ativa
   - Evitar timeouts do servidor

3. **Monitoramento**
   - Adicionar logs de renovação
   - Alertar quando renovação falhar

## Notas Importantes

- ⚠️ O script **NÃO altera** dados no banco por padrão (apenas leitura)
- ⚠️ Para testar atualização real, use o método `obterTokenValido()` que já atualiza automaticamente
- ✅ O script é seguro e pode ser executado múltiplas vezes
- ✅ Não requer intervenção manual (exceto se credenciais estiverem inválidas)

## Exemplo de Saída

```
═══════════════════════════════════════════════════════════
🔄 TESTE DE RENOVAÇÃO DE TOKENS VM LAV
═══════════════════════════════════════════════════════════

1️⃣  Buscando credenciais ativas...
✅ Credencial encontrada para usuário: 1

2️⃣  Obtendo credenciais completas...
   Email: usuario@exemplo.com
   Status: ativo
   Token inicial: ✅ Presente
   Token aplicação: ✅ Presente
   Token expira em: 15/11/2025 18:30:00

3️⃣  Verificando validade dos tokens...
   Token Inicial: ✅ Válido (expira em 720 minutos)
   Token Aplicação: ✅ Válido (expira em 45 minutos)

4️⃣  Testando renovação usando token_inicial...
✅ Token de aplicação gerado com sucesso!
   Novo Token Aplicação: ✅ Válido (expira em 60 minutos)
✅ Novo token é válido!

5️⃣  Testando se o novo token funciona em requisições...
✅ Token funciona! Requisição bem-sucedida.
   Total de clientes disponíveis: 1250

...

✅ TESTE CONCLUÍDO
```

