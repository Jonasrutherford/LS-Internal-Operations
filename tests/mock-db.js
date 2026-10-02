(function(){
const SEED = window.__SEED;
const store = {}; for (const [path, data] of Object.entries(SEED)) store[path] = JSON.parse(JSON.stringify(data));
const subs = [];
const merge = (a,b) => { for (const k in b){ if (b[k] && typeof b[k]==='object' && !Array.isArray(b[k]) && a[k] && typeof a[k]==='object') merge(a[k], b[k]); else a[k]=b[k]; } return a; };
const notify = () => subs.forEach(s => s());
const snapOf = (id, d) => ({id, exists:!!d, data:()=>d, metadata:{}});
const doc = path => ({ id:path.split('/').pop(), path,
  get: async () => snapOf(path.split('/').pop(), store[path]),
  set: async d => { store[path] = JSON.parse(JSON.stringify(d)); notify(); },
  update: async d => { if (!store[path]) throw {code:'invalid_argument'}; merge(store[path], JSON.parse(JSON.stringify(d))); notify(); },
  onSnapshot(n){ const f=()=>n(snapOf(path.split('/').pop(), store[path])); subs.push(f); setTimeout(f); return ()=>{}; } });
const collection = col => ({ onSnapshot(n){ const f = () => { const docs = Object.keys(store).filter(p => p.split('/').slice(0,-1).join('/')===col).map(p => snapOf(p.split('/').pop(), store[p])); n({docs, size:docs.length, empty:!docs.length, docChanges:()=>[]}); }; subs.push(f); setTimeout(f); return ()=>{}; }, doc: id => doc(col+'/'+id) });
const db = {doc, collection};
const user = {me: async () => ({id:'u_jonas', name:'Jonas', avatarUrl:'', isOwner:true}), isOwner: async()=>true};
window.claude = {use: async n => n==='db'?db : n==='user'?user : null};
})();
