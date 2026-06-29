# Arq Luz · Pedidos

Site para os vendedores cadastrarem pedidos de entrega (com porte P/M/G) e visitas em obra
(uso do carro), com visualização em tempo real para todo o time e aba de notificações.

## O que falta configurar (passo a passo)

### 1. Regras de segurança do Firestore
No Firebase Console → Firestore Database → aba **"Regras"**, cole isto e publique:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```

Isso libera leitura/escrita só para quem estiver logado (qualquer um dos usuários cadastrados).

### 2. Criar os usuários no Firebase Authentication
Vá em **Authentication → Users → Add user** e crie um login para cada pessoa, usando
exatamente estes e-mails (são fictícios, só servem pra identificar o login — escolha a senha
que quiser para cada um):

| Nome | E-mail (login) | Papel |
|---|---|---|
| Larissa | larissa@arqluzpedidos.app | Vendedor |
| Geovana | geovana@arqluzpedidos.app | Vendedor |
| Thays | thays@arqluzpedidos.app | Vendedor |
| Clarissa | clarissa@arqluzpedidos.app | Vendedor |
| Leonardo | leonardo@arqluzpedidos.app | Admin |
| Estoque | estoque@arqluzpedidos.app | Estoque |

Pra adicionar alguém novo depois: crie o login aqui do mesmo jeito, e adicione uma linha em
`js/usuarios.js` com o mesmo e-mail (esse arquivo é quem decide o nome e o papel de cada login
dentro do site).

### 3. Publicar o site (GitHub Pages)
Settings do repositório → Pages → Branch: `main` → pasta `/ (root)` → Save.
O site fica em algo como `https://SEU-USUARIO.github.io/arqluz-pedidos/`.

### 4. Domínio próprio (pedidos.arqluziluminacao.com)
Quando quiser, criamos um registro CNAME no seu provedor de domínio apontando
`pedidos.arqluziluminacao.com` para `SEU-USUARIO.github.io`, e configuramos isso nas
configurações do GitHub Pages.

### 5. Aviso no WhatsApp (opcional, via Make.com)
Hoje a notificação já funciona dentro do site (sininho no topo). Se quiser que também chegue
no WhatsApp do estoque: crie um cenário no Make.com com gatilho "Webhook" + ação Z-API de
envio de mensagem, copie a URL do webhook e cole na constante `MAKE_WEBHOOK_URL` no arquivo
`js/app.js`.

## Estrutura
- `index.html` — login
- `app.html` — aplicativo (entregas, visitas em obra, notificações)
- `css/style.css` — visual
- `js/firebase-config.js` — conexão com o Firebase
- `js/usuarios.js` — lista de quem pode logar
- `js/login.js` — lógica da tela de login
- `js/app.js` — lógica principal do app
