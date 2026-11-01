// Missão Calebe — contador central. Dados pessoais NÃO são enviados ao Firestore.
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
const latest = {Juvenil:null, Adulto:null};
let signedIn = false;
let error = '';

function broadcast() {
  const valid = Object.values(latest).every(v => v && v.server && Number.isFinite(v.inscritos) && v.limite === 64);
  const ready = signedIn && !error && valid;
  window.dispatchEvent(new CustomEvent('calebe-firebase-state', {
    detail: {
      ready,
      error,
      counts: {
        Juvenil: latest.Juvenil?.inscritos ?? 0,
        Adulto: latest.Adulto?.inscritos ?? 0
      }
    }
  }));
}

window.CalebeFirebase = {
  async reserve(category) {
    if (!signedIn || error || !latest.Juvenil?.server || !latest.Adulto?.server) {
      throw Object.assign(new Error('Sem conexão com o Firebase'), {code:'unavailable'});
    }
    const ref = refs[category];
    if (!ref) throw Object.assign(new Error('Categoria inválida'), {code:'invalid-argument'});
    await runTransaction(db, async (transaction) => {
      const snapshot = await transaction.get(ref);
      if (!snapshot.exists()) throw Object.assign(new Error('Contador não existe no Firebase'), {code:'not-found'});
      const data = snapshot.data();
      const current = Number(data.inscritos);
      if (Number(data.limite) !== 64 || !Number.isInteger(current) || current < 0 || current > 64) {
        throw Object.assign(new Error('Dados inválidos no contador'), {code:'failed-precondition'});
      }
      if (current >= 64) throw Object.assign(new Error('Vagas esgotadas'), {code:'vagas-esgotadas'});
      transaction.update(ref, {inscritos: current+1});
    });
  }
};

async function initialize() {
  try {
    await signInAnonymously(auth);
    signedIn = true;
    for (const [category, ref] of Object.entries(refs)) {
      onSnapshot(ref, {includeMetadataChanges:true}, (snapshot) => {
        if (!snapshot.exists()) {
          error = `Falta o documento ${category.toLowerCase()} em contadores, no Firebase.`;
          broadcast();
          return;
        }
        const data = snapshot.data();
        const inscritos = Number(data.inscritos);
        const limite = Number(data.limite);
        if (!Number.isInteger(inscritos) || inscritos < 0 || inscritos > 64 || limite !== 64) {
          error = `Confira os campos inscritos e limite do documento ${category.toLowerCase()} no Firestore.`;
        } else if (error.startsWith('Confira os campos') || error.startsWith('Falta o documento')) {
          error = '';
        }
        latest[category] = {inscritos, limite, server:!snapshot.metadata.fromCache};
        broadcast();
      }, (reason) => {
        error = 'Erro ao ler o Firestore. Confira as regras e a conexão com a internet.';
        console.error('Calebe Firebase:',reason);
        broadcast();
      });
    }
    broadcast();
  } catch (reason) {
    console.error('Calebe Firebase:',reason);
    error = 'Não foi possível autenticar no Firebase. Confira Authentication > Anônimo e a conexão.';
    broadcast();
  }
}
initialize();
