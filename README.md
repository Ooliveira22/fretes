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

## Banco privado no Firebase

1. No Firebase Console, abra `Authentication > Sign-in method` e ative `Anônimo` e `E-mail/senha`.
2. Em `Firestore Database > Rules`, publique o conteúdo do arquivo `firestore.rules`.
3. Crie o usuário administrador com o e-mail configurado no app. Visitantes entram como visualizadores e não podem alterar fretes.

O arquivo `firebase.json` permite publicar as regras com o Firebase CLI usando `firebase deploy --only firestore:rules`.

