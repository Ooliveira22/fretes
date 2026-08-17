# COMISSIONADO PWA

Site PWA para controle de fretes e comissões.

## Configuração local

1. Copie `local-config.example.js` para `local-config.js`.
2. Defina seu e-mail de administrador em `window.localConfig.OWNER_EMAIL`.
3. Não comite `local-config.js` — ele já está listado em `.gitignore`.

O e-mail em `local-config.js` deve coincidir com o configurado em `firestore.rules` (ou use `set-admin.js` para conceder a claim `isAdmin`).

## Deploy no GitHub Pages

1. Crie um repositório no GitHub.
2. No GitHub, vá em **Settings → Secrets → Actions** e adicione `OWNER_EMAIL` com o e-mail do administrador.
3. Em **Settings → Pages**, selecione **GitHub Actions** como fonte de deploy.
4. Envie para a branch `main` — o workflow `.github/workflows/deploy-pages.yml` gera `local-config.js` e publica o site.

## Banco no Firebase

1. No Firebase Console, abra **Authentication → Sign-in method** e ative somente **E-mail/senha**.
2. Crie o usuário administrador com o e-mail configurado e confirme o endereço.
3. Em **Firestore Database → Rules**, publique o conteúdo de `firestore.rules`:
   ```bash
   firebase deploy --only firestore:rules
   ```

Qualquer visitante pode ler os fretes. Somente o administrador com e-mail verificado (ou claim `isAdmin`) pode criar, editar ou excluir documentos.

## Script set-admin (opcional)

Para conceder acesso de administrador via custom claim em vez de e-mail fixo nas regras:

```bash
npm install
node set-admin.js <uid-do-usuario>
```

Requer `serviceAccountKey.json` na raiz (não comite este arquivo).

## Modo offline

O app armazena fretes no IndexedDB local. Se o Firebase estiver indisponível, os dados locais continuam acessíveis. A sincronização com Firestore requer conexão e login de administrador.

## Fontes

Roboto e Material Icons são carregados via Google Fonts (CDN). A CSP em `index.html` e `firebase.json` já permite `fonts.googleapis.com` e `fonts.gstatic.com`.
