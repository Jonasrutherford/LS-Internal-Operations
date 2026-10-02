/* Lucid OS standalone shim.
 *
 * Jonas's app reads its database and identity from the Claude platform via
 * window.claude.use('db') / use('user'). Outside Claude those do not exist, which
 * is why the Vercel build previously showed only a doorway.
 *
 * This provides the same db interface backed by the browser's own storage, so the
 * real app runs on an ordinary web page. use('user') deliberately returns null:
 * the app already handles that by falling back to its own person picker.
 *
 * No business data ships in this file. The repository is public, so revenue, time
 * and payout figures are never committed. Data is loaded by importing a seed file
 * once, and then lives only in this browser.
 */
(function () {
  const KEY = 'lucidos.store.v1';
  const subs = [];
  let store = {};

  const clone = (v) => JSON.parse(JSON.stringify(v));
  const notify = () => subs.forEach((f) => { try { f(); } catch (e) { console.error(e); } });

  function persist() {
    try {
      localStorage.setItem(KEY, JSON.stringify(store));
    } catch (e) {
      // Quota or private browsing. The session keeps working in memory.
      console.warn('Could not persist to this browser:', e && e.message);
    }
  }

  const snapOf = (id, d) => ({ id, exists: !!d, data: () => d, metadata: {} });

  function merge(a, b) {
    for (const k in b) {
      if (b[k] && typeof b[k] === 'object' && !Array.isArray(b[k]) && a[k] && typeof a[k] === 'object') merge(a[k], b[k]);
      else a[k] = b[k];
    }
    return a;
  }

  const doc = (path) => ({
    id: path.split('/').pop(),
    path,
    get: async () => snapOf(path.split('/').pop(), store[path]),
    set: async (d) => { store[path] = clone(d); persist(); notify(); },
    update: async (d) => {
      if (!store[path]) throw { code: 'invalid_argument' };
      merge(store[path], clone(d));
      persist();
      notify();
    },
    onSnapshot(n) {
      const f = () => n(snapOf(path.split('/').pop(), store[path]));
      subs.push(f);
      setTimeout(f);
      return () => {};
    },
  });

  const collection = (col) => ({
    onSnapshot(n) {
      const f = () => {
        const docs = Object.keys(store)
          .filter((p) => p.split('/').slice(0, -1).join('/') === col)
          .map((p) => snapOf(p.split('/').pop(), store[p]));
        n({ docs, size: docs.length, empty: !docs.length, docChanges: () => [] });
      };
      subs.push(f);
      setTimeout(f);
      return () => {};
    },
    doc: (id) => doc(col + '/' + id),
  });

  window.claude = {
    use: async (name) => (name === 'db' ? { doc, collection } : null),
  };

  /* ---------------------------------------------------------------- data gate */

  function screen(inner) {
    const el = document.createElement('div');
    el.id = 'lucid-gate';
    el.style.cssText =
      'position:fixed;inset:0;z-index:9999;display:grid;place-items:center;padding:24px;' +
      'background:var(--bg,#08091d);color:var(--ink,#eef0ff);font-family:var(--f-body,system-ui)';
    el.innerHTML =
      '<div style="max-width:440px;width:100%;background:var(--panel,#10122c);border:1px solid var(--line,#262a52);' +
      'border-radius:10px;padding:24px">' + inner + '</div>';
    document.body.appendChild(el);
    return el;
  }

  function askForData() {
    return new Promise((resolve) => {
      const el = screen(
        '<div style="font-family:var(--f-display,system-ui);font-size:11px;font-weight:600;letter-spacing:.09em;' +
        'text-transform:uppercase;color:var(--ink-3,#8387b5)">Lucid Studio</div>' +
        '<h1 style="font-family:var(--f-display,system-ui);margin:4px 0 10px;font-size:22px">Load your data</h1>' +
        '<p style="margin:0 0 16px;font-size:13.5px;color:var(--ink-2,#b4b7dc);line-height:1.5">' +
        'This browser has no Lucid OS data yet. Choose the seed file to load it. It stays in this ' +
        'browser only and is never uploaded or committed to the repository.</p>' +
        '<input type="file" accept="application/json,.json" id="lucid-seed-file" style="width:100%">' +
        '<p id="lucid-seed-msg" style="margin:12px 0 0;font-size:13px;color:var(--crit,#ff6b57)"></p>'
      );

      el.querySelector('#lucid-seed-file').addEventListener('change', async (ev) => {
        const file = ev.target.files && ev.target.files[0];
        if (!file) return;
        const msg = el.querySelector('#lucid-seed-msg');
        msg.textContent = '';
        try {
          const parsed = JSON.parse(await file.text());
          const docs = parsed && parsed.documents ? parsed.documents : parsed;
          if (!docs || typeof docs !== 'object' || !Object.keys(docs).length) {
            throw new Error('That file has no documents in it.');
          }
          store = docs;
          persist();
          el.remove();
          resolve();
        } catch (e) {
          msg.textContent = 'Could not read that file: ' + (e && e.message ? e.message : e);
        }
      });
    });
  }

  window.__lucidReady = (async () => {
    try {
      const saved = localStorage.getItem(KEY);
      if (saved) {
        store = JSON.parse(saved);
        if (Object.keys(store).length) return;
      }
    } catch (e) {
      console.warn('Stored data could not be read, asking for it again:', e && e.message);
    }
    await askForData();
  })();

  /* Lets you clear this browser's copy from the console: __lucidReset() */
  window.__lucidReset = () => {
    localStorage.removeItem(KEY);
    location.reload();
  };
})();
