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

1. No Firebase Console, abra `Authentication > Sign-in method` e ative `E-mail/senha`.
2. Em `Firestore Database > Rules`, publique o conteúdo do arquivo `firestore.rules`.
3. Crie seu acesso na tela do aplicativo. Cada frete novo será vinculado somente ao seu usuário.
4. Para preservar fretes antigos, abra cada documento existente na coleção `fretes` e adicione o campo `ownerId` com o UID do seu usuário autenticado. Depois disso, eles voltarão a aparecer.

O arquivo `firebase.json` permite publicar as regras com o Firebase CLI usando `firebase deploy --only firestore:rules`.

