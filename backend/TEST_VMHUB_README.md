# Teste de Login VMHub

Este script testa a conexão com o sistema VMHub, automatizando o processo de login que inclui resolução de reCAPTCHA, obtenção de token JWT com `clientId` e busca de clientes.

## 🔄 Fluxo de Autenticação Implementado

O script agora implementa o fluxo completo de autenticação descoberto através do monitoramento de rede:

1. **Login inicial** (`POST /conta/api/v1/contas-usuarios/login`)
   - Retorna token JWT inicial (sem `clientId`)

2. **Obter token da aplicação** (`GET /conta/api/v1/contas-usuarios/login/aplicacao`)
   - Usa o token inicial no header `Authorization: Bearer {token}`
   - Retorna token específico com `clientId: "vmlav"` (extraído do HTML ou JSON)

3. **Buscar clientes** (`POST /vmlav/api/v1/relatorios/clientes`)
   - Usa o token da aplicação para acessar os dados dos clientes

## 📋 Pré-requisitos

- Node.js instalado
- Dependências do projeto instaladas (`npm install`)
- Puppeteer instalado (já está nas dependências)

## 🚀 Como Usar

### 1. Executar o Script

```bash
cd backend
npm run test:vmhub
```

Ou diretamente com ts-node:

```bash
cd backend
npx ts-node --transpile-only test-vmhub-login.ts
```

### 2. Processo de Login

1. **O navegador será aberto automaticamente** mostrando a página de login
2. **O script preencherá automaticamente** o email e senha
3. **Você precisará resolver o CAPTCHA manualmente** no navegador
4. **O script detectará quando o CAPTCHA for resolvido** e fará a requisição de login
5. **O token JWT será exibido** no console se o login for bem-sucedido
6. **Após o login, o script buscará automaticamente os clientes** e exibirá os resultados
7. **Os dados dos clientes serão salvos** em um arquivo JSON (`clientes_export.json`)

### 3. Configurar Credenciais

Edite o arquivo `test-vmhub-login.ts` e altere as credenciais na função `main()`:

```typescript
const credentials: LoginCredentials = {
  email: 'seu-email@exemplo.com',
  senha: 'sua-senha',
};
```

## 🔧 Estratégias de Resolução de CAPTCHA

O script suporta duas estratégias:

### Modo Manual (Padrão)
- Aguarda você resolver o CAPTCHA manualmente no navegador
- Detecta automaticamente quando o CAPTCHA é resolvido
- Timeout padrão: 5 minutos

### Modo Automático
- Tenta extrair o token do reCAPTCHA periodicamente
- Útil se você tiver um serviço de resolução automática configurado

Para alterar o modo, edite a função `main()`:

```typescript
const result = await tester.testLogin(credentials, {
  headless: false,        // Mostra o navegador (false) ou executa em background (true)
  manualCaptcha: true,    // true = modo manual, false = modo automático
  captchaTimeout: 300000, // Timeout em milissegundos (5 minutos)
});
```

## 📊 Estrutura da Resposta

O script retorna um objeto `LoginResponse`:

```typescript
{
  success: boolean;    // true se o login foi bem-sucedido
  token: string;       // JWT token retornado pela API
  error?: string;      // Mensagem de erro (se houver)
}
```

## 🔍 Detalhes Técnicos

### Endpoints

- **Página de Login**: `https://conta.vmhub.vmtecnologia.io/conta/login`
- **API de Login**: `https://apps.vmhub.vmtecnologia.io/conta/api/v1/contas-usuarios/login`
- **API de Clientes**: `https://apps.vmhub.vmtecnologia.io/vmlav/api/v1/relatorios/clientes`

### Headers da Requisição

O script envia os seguintes headers para simular uma requisição real do navegador:

- `Content-Type: application/json`
- `Origin: https://conta.vmhub.vmtecnologia.io`
- `Referer: https://conta.vmhub.vmtecnologia.io/`
- `User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:144.0) Gecko/20100101 Firefox/144.0`
- `Time-Zone: America/Sao_Paulo`
- `X-Origin: https://vmlav.vmhub.vmtecnologia.io`

### Payload da Requisição

```json
{
  "email": "seu-email@exemplo.com",
  "senha": "sua-senha",
  "tokenRecaptcha": "token-extraido-do-recaptcha"
}
```

## 🐛 Troubleshooting

### Erro: "Não foi possível encontrar o campo de email/senha"

- O seletor do campo pode ter mudado
- Inspecione a página de login e atualize os seletores no método `fillLoginForm()`

### Erro: "Token do reCAPTCHA não encontrado"

- Certifique-se de que o CAPTCHA foi resolvido completamente
- Verifique se o elemento `textarea[name="g-recaptcha-response"]` existe na página
- Tente aumentar o `captchaTimeout`

### Erro: "Resposta da API não contém token válido"

- Verifique se as credenciais estão corretas
- Verifique se o token do reCAPTCHA é válido
- Inspecione a resposta da API para mais detalhes

### Erro ao buscar clientes

- Verifique se o token JWT ainda é válido (tokens expiram após algum tempo)
- Verifique se o header `X-Vm-Emp` está correto (empresa: `lavateriajdnovomundo`)
- Verifique se o token tem permissões para acessar a API de clientes
- Tente fazer login novamente se o token expirou

### Navegador não fecha automaticamente

- O script mantém o navegador aberto por padrão para inspeção
- Pressione `Ctrl+C` no terminal para encerrar o script e fechar o navegador

## 🔐 Segurança

⚠️ **IMPORTANTE**: 
- Não commite credenciais no código
- Use variáveis de ambiente para credenciais sensíveis
- Este script é apenas para testes de desenvolvimento

## 📋 Buscar Clientes

Após o login bem-sucedido, o script automaticamente busca os clientes do sistema. Você também pode buscar clientes programaticamente:

### Uso Programático

```typescript
const tester = new VMHubLoginTester();

// Primeiro, fazer login
const loginResult = await tester.testLogin(credentials);

if (loginResult.success) {
  // Buscar clientes com filtros
  const clientesResult = await tester.buscarClientes(loginResult.token, {
    nome: null,        // ou string para filtrar por nome
    cpf: null,         // ou string para filtrar por CPF
    email: null,       // ou string para filtrar por email
    telefone: null,    // ou string para filtrar por telefone
    // ... outros filtros
  }, {
    pagina: 0,
    quantidade: 10000,
    campoOrdenacao: 'cliente.nome',
    direcaoOrdenacao: 'ASC',
    empresa: 'lavateriajdnovomundo',
  });

  if (clientesResult.success) {
    console.log(`Total: ${clientesResult.total}`);
    console.log(`Retornados: ${clientesResult.clientes?.length}`);
  }
}
```

### Estrutura dos Dados dos Clientes

Cada cliente retornado contém:

```typescript
{
  id: number;
  nome: string;
  dataNascimento: string;
  cpf: string;
  telefone: string;
  email: string;
  genero: string;
  dataCadastro: string;
  dataUltimaCompra: string;
  qtdCompras: number;
  valorTotalCompras: string;
  qtdCompras90: number;
  valorTotalCompras90: string;
  qtdCompras30: number;
  valorTotalCompras30: string;
  qtdCompras7: number;
  valorTotalCompras7: string;
  lavanderia: string;
  acoes: {
    idCliente: number;
    cpf: string;
    nome: string;
    telefone: string;
    email: string;
  };
}
```

### Exportação de Dados

Os dados dos clientes são automaticamente salvos em `backend/clientes_export.json` após a busca bem-sucedida. O arquivo contém:

- Total de clientes
- Array completo de clientes
- Data/hora da exportação

## 📝 Próximos Passos

Após validar o login e a busca de clientes, você pode:

1. Integrar este código em um serviço do backend
2. Implementar cache de tokens
3. Adicionar tratamento de erros mais robusto
4. Implementar renovação automática de tokens
5. Adicionar suporte a serviços de resolução automática de CAPTCHA (2Captcha, AntiCaptcha, etc.)
6. Criar endpoints da API para buscar clientes
7. Implementar sincronização periódica de clientes

## 🔗 Serviços de Resolução Automática de CAPTCHA

Se você quiser automatizar completamente a resolução do CAPTCHA, considere usar:

- **2Captcha**: https://2captcha.com
- **AntiCaptcha**: https://anti-captcha.com
- **DeathByCaptcha**: https://www.deathbycaptcha.com

Esses serviços podem ser integrados no método `waitForManualCaptchaResolution()` para resolver o CAPTCHA automaticamente.

