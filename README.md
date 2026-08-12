# COMISSIONADO PWA

Site PWA para controle de fretes e comissoes.

## Deploy no GitHub Pages

1. Crie um repositório no GitHub.
2. No seu computador, abra o terminal na pasta do projeto.
3. Inicialize o Git e faça o primeiro commit:
   git init
   git add .
   git commit -m "Inicializa repositório PWA COMISSIONADO"
4. Adicione o remoto do GitHub (substitua <seu-usuario> e <seu-repo>):
   git remote add origin https://github.com/<seu-usuario>/<seu-repo>.git
5. Envie para o GitHub:
   git push -u origin main
6. No GitHub, vá em Settings > Pages e selecione o branch `main` e a pasta `/ (root)`.
7. Aguarde alguns minutos e acesse a URL do GitHub Pages para testar o app online.

## Banco no Firebase com leitura pública e escrita privada

1. No Firebase Console, abra `Authentication > Sign-in method` e ative somente `E-mail/senha`.
2. Crie o usuário administrador com o e-mail configurado no app e confirme o endereço de e-mail.
3. Em `Firestore Database > Rules`, publique o conteúdo do arquivo `firestore.rules`.
4. Use HTTPS em produção. O Firebase Hosting aplica os headers definidos em `firebase.json`; no GitHub Pages, mantenha o domínio HTTPS e considere o Firebase Hosting para aplicar os headers HTTP.

O arquivo `firebase.json` permite publicar as regras com o Firebase CLI usando `firebase deploy --only firestore:rules`.

Qualquer visitante pode ler os fretes. Somente o administrador com e-mail verificado pode criar, editar ou excluir documentos. A chave `apiKey` do Firebase presente no frontend identifica o projeto, mas não substitui as regras do Firestore e não deve ser tratada como senha.

Segurança local
1. Crie um arquivo `local-config.js` na raiz do projeto copiando `local-config.example.js`.
2. No `local-config.js`, defina seu e-mail de administrador em `window.localConfig.OWNER_EMAIL`.
3. Não comite `local-config.js` — ele já está listado em `.gitignore`.

Exemplo de uso: o aplicativo lerá `window.localConfig.OWNER_EMAIL` para validar o administrador sem manter o e-mail no código versionado.

