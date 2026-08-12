// Uso: node set-admin.js <uid>
// Coloque sua chave da conta de serviço em `serviceAccountKey.json` (NUNCA comite este arquivo)

const admin = require('firebase-admin');
const fs = require('fs');

const uid = process.argv[2];
if (!uid) {
  console.error('Uso: node set-admin.js <uid>');
  process.exit(1);
}

const keyPath = './serviceAccountKey.json';
if (!fs.existsSync(keyPath)) {
  console.error('Arquivo serviceAccountKey.json não encontrado. Gere a chave no Firebase Console > Project Settings > Service accounts.');
  process.exit(1);
}

const serviceAccount = require(keyPath);
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });

admin.auth().setCustomUserClaims(uid, { isAdmin: true })
  .then(() => {
    console.log('Claim isAdmin set for', uid);
    process.exit(0);
  })
  .catch((err) => {
    console.error('Erro ao setar claim:', err);
    process.exit(1);
  });
