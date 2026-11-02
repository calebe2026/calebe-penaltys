// Missão Calebe — contagem compartilhada e independente por categoria.
// Os dados pessoais da inscrição são enviados somente para o WhatsApp, não para o Firestore.
import { initializeApp } from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-app.js';
import { getAuth, signInAnonymously } from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js';
import { getFirestore, doc, onSnapshot, runTransaction } from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js';

const firebaseConfig = {
  apiKey: 'AIzaSyDHtID3pjMuhuu7DFcHbExnGhlKp-HlpEs',
  authDomain: 'calebe-penaltys.firebaseapp.com',
  projectId: 'calebe-penaltys',
  storageBucket: 'calebe-penaltys.firebasestorage.app',
  messagingSenderId: '370834177828',
  appId: '1:370834177828:web:28d3ffe185447d49613db1'
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const refs = {
  Juvenil: doc(db, 'contadores', 'juvenil'),
  Adulto: doc(db, 'contadores', 'adulto')
};
const latest = {
  Juvenil: { inscritos: null, server: false, error: '' },
  Adulto: { inscritos: null, server: false, error: '' }
};
let signedIn = false;
let authError = '';

const docName = category => category.toLowerCase();
function validCounter(data) {
  return data && typeof data.inscritos === 'number' && Number.isInteger(data.inscritos)
    && data.inscritos >= 0 && data.inscritos <= 64
    && typeof data.limite === 'number' && data.limite === 64;
}

function broadcast() {
  const readyByCategory = {};
  const errors = {};
  const counts = {};
  for (const category of Object.keys(refs)) {
    const value = latest[category];
    readyByCategory[category] = signedIn && !authError && value.server && !value.error;
    errors[category] = authError || value.error;
    counts[category] = typeof value.inscritos === 'number' ? value.inscritos : null;
  }
  window.dispatchEvent(new CustomEvent('calebe-firebase-state', {
    detail: { readyByCategory, errors, counts }
  }));
}

window.CalebeFirebase = {
  async reserve(category) {
    const ref = refs[category];
    if (!ref) throw Object.assign(new Error('Categoria inválida'), {code:'invalid-argument'});
    if (!signedIn || authError || !latest[category].server || latest[category].error) {
      throw Object.assign(new Error(latest[category].error || authError || 'Contador indisponível'), {code:'unavailable'});
    }
    await runTransaction(db, async (transaction) => {
      const snapshot = await transaction.get(ref);
      if (!snapshot.exists()) throw Object.assign(new Error('Documento não encontrado'), {code:'not-found'});
      const data = snapshot.data();
      if (!validCounter(data)) throw Object.assign(new Error('Campos inválidos no contador da categoria'), {code:'failed-precondition'});
      if (data.inscritos >= 64) throw Object.assign(new Error('Vagas esgotadas'), {code:'vagas-esgotadas'});
      transaction.update(ref, { inscritos: data.inscritos + 1 });
    });
  }
};

async function initialize() {
  try {
    await signInAnonymously(auth);
    signedIn = true;
    for (const [category, ref] of Object.entries(refs)) {
      onSnapshot(ref, {includeMetadataChanges:true}, (snapshot) => {
        const value = latest[category];
        if (!snapshot.exists()) {
          value.inscritos = null;
          value.server = false;
          value.error = `Falta o documento contadores/${docName(category)} no Firestore.`;
          broadcast();
          return;
        }
        const data = snapshot.data();
        if (!validCounter(data)) {
          value.inscritos = null;
          value.server = false;
          value.error = `Corrija contadores/${docName(category)} no Firebase: "inscritos" deve ser número de 0 a 64 e "limite" deve ser número 64 (tipo double ou integer).`;
        } else {
          value.inscritos = data.inscritos;
          value.server = !snapshot.metadata.fromCache && !snapshot.metadata.hasPendingWrites;
          value.error = '';
        }
        broadcast();
      }, (reason) => {
        const value = latest[category];
        value.server = false;
        value.error = `Não foi possível ler contadores/${docName(category)}. Confira as regras do Firestore e a conexão.`;
        console.error('Calebe Firebase:', category, reason);
        broadcast();
      });
    }
    broadcast();
  } catch (reason) {
    console.error('Calebe Firebase:', reason);
    authError = 'Falha na autenticação anônima do Firebase. Verifique Authentication > Método de login > Anônimo.';
    broadcast();
  }
}
initialize();
