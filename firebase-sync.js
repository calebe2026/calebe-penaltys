// MISSÃO CALEBE - FIREBASE COMPARTILHADO (SDK compat, com diagnóstico de erros)
// Sem falha silenciosa: se a conexão falhar, o site informa o motivo.
// As informações pessoais do formulário são enviadas para o WhatsApp; aqui só ficam os contadores.
(function () {
  'use strict';
  const config = {
    apiKey: 'AIzaSyDHtID3pjMuhuu7DFcHbExnGhlKp-HlpEs',
    authDomain: 'calebe-penaltys.firebaseapp.com',
    projectId: 'calebe-penaltys',
    storageBucket: 'calebe-penaltys.firebasestorage.app',
    messagingSenderId: '370834177828',
    appId: '1:370834177828:web:28d3ffe185447d49613db1'
  };
  const keys = ['Juvenil', 'Adulto'];
  const latest = {
    Juvenil: {inscritos:null, server:false, error:''},
    Adulto: {inscritos:null, server:false, error:''}
  };
  let signedIn = false;
  let authError = '';
  let db;
  let refs;
  let syncStarted = false;
  const shortCode = e => String(e?.code || '').replace(/[^a-zA-Z0-9/_-]/g,'').slice(0,85);

  function broadcast(){
    const readyByCategory = {}, counts = {}, errors = {};
    for(const category of keys){
      const v=latest[category];
      readyByCategory[category] = signedIn && !authError && v.server && !v.error;
      counts[category]=Number.isInteger(v.inscritos)?v.inscritos:null;
      errors[category]=authError || v.error;
    }
    window.dispatchEvent(new CustomEvent('calebe-firebase-state',{detail:{readyByCategory,counts,errors}}));
  }
  function setFailure(message){
    authError=message;
    broadcast();
  }
  function goodCounter(data){
    return data && Number.isInteger(data.inscritos) && data.inscritos>=0 && data.inscritos<=64
      && data.limite===64;
  }
  function reportError(category,error){
    const value=latest[category];
    value.inscritos=null;
    value.server=false;
    const code=shortCode(error);
    console.error('Calebe Firestore:',category,error);
    if(code==='permission-denied'){
      value.error='Acesso negado a contadores/'+category.toLowerCase()+'. Confira Firestore → Regras (permissão de leitura).';
    } else if(code==='unavailable'){
      value.error='Sem conexão com o Firestore ('+category+'). Verifique internet e bloqueadores do navegador.';
    } else {
      value.error='Falha ao ler contadores/'+category.toLowerCase()+' ('+(code||'erro desconhecido')+').';
    }
    broadcast();
  }

  async function boot(){
    if(syncStarted)return;
    syncStarted=true;
    window.CalebeFirebase = {
      async reserve(category){
        if(!keys.includes(category)) throw Object.assign(new Error('Categoria inválida'),{code:'invalid-argument'});
        const v=latest[category];
        if(!signedIn || !v.server || v.error || authError){
          throw Object.assign(new Error(v.error||authError||'Sem conexão ao contador'),{code:'unavailable'});
        }
        const ref=refs[category];
        await db.runTransaction(async transaction=>{
          const snap=await transaction.get(ref);
          if(!snap.exists)throw Object.assign(new Error('Contador não existe'),{code:'not-found'});
          const data=snap.data();
          if(!goodCounter(data))throw Object.assign(new Error('Dados do contador incorretos'),{code:'failed-precondition'});
          if(data.inscritos>=64)throw Object.assign(new Error('Vagas esgotadas'),{code:'vagas-esgotadas'});
          transaction.update(ref,{inscritos:data.inscritos+1});
        });
      }
    };
    if(!window.firebase || typeof window.firebase.initializeApp!=='function' ||
       typeof window.firebase.auth!=='function' || typeof window.firebase.firestore!=='function'){
      setFailure('Bibliotecas Firebase não carregaram. Confira a conexão com gstatic.com e recarregue (Ctrl+F5).');
      return;
    }
    try{
      const firebase=window.firebase;
      const app=firebase.apps.length ? firebase.app() : firebase.initializeApp(config);
      const auth=app.auth();
      db=app.firestore();
      refs={Juvenil:db.doc('contadores/juvenil'),Adulto:db.doc('contadores/adulto')};
      // Evita deixar o site para sempre em “Conectando...” quando o login trava.
      await Promise.race([
        auth.signInAnonymously(),
        new Promise((_,reject)=>setTimeout(()=>reject(Object.assign(new Error('Tempo esgotado'),{code:'auth/timeout'})),12000))
      ]);
      signedIn=true;
      broadcast();
      for(const category of keys){
        const ref=refs[category];
        ref.onSnapshot({includeMetadataChanges:true},snapshot=>{
          const v=latest[category];
          if(!snapshot.exists){
            v.inscritos=null;
            v.server=false;
            v.error='Documento contadores/'+category.toLowerCase()+' não encontrado no Firebase.';
          } else if(!goodCounter(snapshot.data())){
            v.inscritos=null;
            v.server=false;
            v.error='Em contadores/'+category.toLowerCase()+': confira inscritos (0 a 64) e limite (64), ambos numéricos.';
          } else {
            v.inscritos=snapshot.data().inscritos;
            v.server=!snapshot.metadata.fromCache && !snapshot.metadata.hasPendingWrites;
            v.error='';
          }
          broadcast();
        },error=>reportError(category,error));
      }
    }catch(error){
      console.error('Calebe Firebase Auth:',error);
      const code=shortCode(error);
      if(code==='auth/operation-not-allowed') setFailure('Ative Authentication → Método de login → Anônimo no Firebase.');
      else if(code==='auth/network-request-failed') setFailure('Falha na internet ao conectar ao Firebase. Confira a conexão e bloqueadores.');
      else if(code==='auth/unauthorized-domain') setFailure('Domínio não autorizado pelo Firebase Authentication.');
      else setFailure('Não foi possível autenticar com Firebase ('+(code||'erro sem código')+').');
    }
  }
  // Os scripts compat são carregados em ordem com defer no index.html.
  boot();
})();
