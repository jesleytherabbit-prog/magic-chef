// ==UserScript==
// @name         Magic Chef · del foro al tracker
// @namespace    https://jesleytherabbit-prog.github.io/magic-chef/
// @version      1.7
// @description  Lee los posts y los dados del tema de Magic Chef y los envía al tracker. En la ficha de un concursante, envía la ficha.
// @match        https://hp-avada-kedavra.foroactivo.com/t*
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  // ---------------------------------------------------------------- datos fijos
  const MASTER = 'Hana Park';
  const DADOS = 'Dados Mágicos';
  const FB = { apiKey: 'AIzaSyCK40yLbR9jEi4LSb3UNipmuD-ExXKfPwI', projectId: 'appsavada' };
  const DOC = 'MC-MAGICCHEF-IMPORT';
  const PJS = {
    logan: 'Logan Pusset-Strauss', volker: 'Volker Krämer', irina: 'Irina Mills', derek: 'Derek Black',
    robert: 'Robert Stevenson', ileen: 'Ileen Eaglebone', owein: 'Owein Higham', robin: 'Robin Blackstone',
    emma: 'Emma Hakim', elizabeth: 'Elizabeth Atkinson', travis: 'Travis', miguel: 'Miguel Umberland',
    hiraki: 'Hiraki Mynos', nick: 'Nick Walterson', jennifer: 'Jennifer Harrison', amanda: 'Amanda Goldgrasp',
    winter: 'Winter A. Torrance', elle: 'Elle Winthers', maximilian: 'Maximilian Jackson', woojin: 'Woojin Moon'
  };
  const JUECES = {
    tuck: /\b(tuck|barnaby)\b/i,
    pommeroy: /pommeroy|c[ée]leste/i,
    vael: /\bvael\b|\bingrid\b/i,
    rupert: /\brupert\b|\bbramble\b/i
  };
  const JN = { tuck: 'Tuck', pommeroy: 'Pommeroy', vael: 'Vael', rupert: 'Rupert' };
  const MES = { ene: 0, feb: 1, mar: 2, abr: 3, may: 4, jun: 5, jul: 6, ago: 7, sep: 8, oct: 9, nov: 10, dic: 11 };

  const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
  const ID_DE = {}; Object.entries(PJS).forEach(([id, n]) => { ID_DE[norm(n)] = id; });
  const pjId = nombre => ID_DE[norm(nombre)] || null;

  // ---------------------------------------------------------------- fechas del foro
  function fecha(txt) {
    const t = String(txt || '').trim();
    let m = t.match(/(Hoy|Ayer) a las (\d{1,2}):(\d{2})/i);
    if (m) { const d = new Date(); if (/ayer/i.test(m[1])) d.setDate(d.getDate() - 1); d.setHours(+m[2], +m[3], 0, 0); return d; }
    m = t.match(/(\d{1,2}) (\w{3})\w* (\d{4})\s*-\s*(\d{1,2}):(\d{2})/);
    if (m) { const mes = MES[norm(m[2]).slice(0, 3)]; if (mes != null) return new Date(+m[3], mes, +m[1], +m[4], +m[5]); }
    return null;
  }

  // ---------------------------------------------------------------- leer una página
  function leerPagina(doc, url) {
    const out = [];
    doc.querySelectorAll('div.post[id^="p"]').forEach(el => {
      const pid = el.id.slice(1);
      const au = el.querySelector('p.author');
      if (!au) return;
      const nombre = (au.querySelector('strong') || {}).textContent || '';
      const fechaTxt = au.textContent.replace(/^[\s\S]*?por\s*/i, '').replace(nombre, '').trim();
      const cont = el.querySelector('.content');
      const html = cont ? cont.innerHTML : '';
      const texto = cont ? (cont.textContent || '').replace(/\s+/g, ' ') : ''; // textContent también lee lo que está dentro de spoilers
      // la marca de edición del foro está fuera de .content: «Última edición por X el Jue 5 Nov 2026 - 22:08, editado 2 veces»
      const marcas = [...((el.querySelector('.postbody') || el).textContent || '').replace(/\s+/g, ' ').matchAll(/Última edición por .+? el (.+?), editado (\d+) ve/gi)];
      const um = marcas[marcas.length - 1]; const ed = um ? { fecha: fecha(um[1]), txt: um[1].trim(), n: +um[2] } : null;
      out.push({ pid: +pid, autor: nombre.trim(), fecha: fecha(fechaTxt), fechaTxt, ed, html, texto, url: url.split('#')[0] + '#' + pid });
    });
    return out;
  }
  async function leerTodo() {
    const urls = new Set([location.href.split('#')[0]]);
    document.querySelectorAll('a[href*="/t37947"]').forEach(a => { const h = a.href.split('#')[0].split('?')[0]; if (/\/t37947(p\d+)?-/.test(h)) urls.add(h); });
    let posts = [];
    for (const u of urls) {
      if (u === location.href.split('#')[0]) { posts = posts.concat(leerPagina(document, u)); continue; }
      try { const r = await fetch(u, { credentials: 'include' }); const h = await r.text(); posts = posts.concat(leerPagina(new DOMParser().parseFromString(h, 'text/html'), u)); } catch (e) { console.warn('Magic Chef: no pude leer', u, e); }
    }
    const vistos = new Set(); posts = posts.filter(p => !vistos.has(p.pid) && vistos.add(p.pid));
    return posts.sort((a, b) => a.pid - b.pid);
  }

  // ---------------------------------------------------------------- entender la acción del Turno 1
  function acciones(texto) {
    const t = String(texto || '').replace(/Última edición por[\s\S]*$/i, '');
    // qué tirada es: primero mira la propia tirada; si no dice nada, lo que está justo antes
    const metodo = (antes, dentro) => {
      const d = dentro;
      if (/biblioteca/i.test(d)) return { acc: 'A', met: 'bib' };
      if (/informantes/i.test(d)) return { acc: 'A', met: 'inf' };
      if (/seguidores|coordinaci[oó]n/i.test(d)) return { acc: 'A', met: 'seg' };
      if (/investigaci[oó]n/i.test(d) && !/trasfondo/i.test(d)) return { acc: 'A', met: 'bib' };
      if (/influencia|intimidaci[oó]n/i.test(d)) return { acc: 'C' };
      if (/trasfondo/i.test(d + ' ' + antes.slice(-160))) return { acc: 'A', met: null }; // «Tirada de Trasfondos …»: el tipo sale de la ficha
      if (/seducci[oó]n|congeni/i.test(d)) return { acc: 'B' };
      if (/oratoria/i.test(d) && /espec[ií]fico|trasfondo/i.test(d)) return { acc: 'A', met: 'inf' };
      const a = antes.slice(-220);
      if (/congeni|buf[eé]/i.test(a)) return { acc: 'B' };
      if (/biblioteca/i.test(a)) return { acc: 'A', met: 'bib' };
      if (/informantes/i.test(a)) return { acc: 'A', met: 'inf' };
      if (/seguidores/i.test(a)) return { acc: 'A', met: 'seg' };
      return { acc: 'B' };
    };
    const hitsEn = v => { const h = []; Object.entries(JUECES).forEach(([k, re]) => { const g = new RegExp(re.source, 'gi'); let m; while ((m = g.exec(v))) h.push({ k, i: m.index }); }); return h.sort((a, b) => a.i - b.i); };
    const elegir = (v, met) => { // entre varios jueces mencionados, el que está junto a palabras de investigar o del mismo trasfondo
      const h = hitsEn(v); if (!h.length) return null;
      const pal = met === 'bib' ? /biblioteca|libro|investig|analiz/i : met === 'inf' ? /informantes|contactos|investig|averig/i : met === 'seg' ? /seguidores/i : /congeni|charl|habl|acerc|salud|bufé|buf[eé]/i;
      const bueno = h.filter(x => pal.test(v.slice(Math.max(0, x.i - 90), x.i + 90)));
      return (bueno.length ? bueno[bueno.length - 1] : h[h.length - 1]).k;
    };
    // cada tirada empieza con el dado: "1d10 (8)", "Dado (10)", "1D10 [8]", "d10(6)", "dado: 2", "4 (Dado)"
    const starts = []; const g = /\d{0,3}d1?10\s*[(\[:]|dados?\s*[(\[:]\s*\d|\d+\s*\(\s*dado\s*\)/gi; let m;
    while ((m = g.exec(t))) { if (!starts.length || m.index - starts[starts.length - 1] > 12) starts.push(m.index); }
    if (!starts.length) { const tail = t.slice(-700); const mt = metodo(tail, ''); const k = mt.acc === 'C' ? null : elegir(tail, mt.met); return k || mt.acc === 'C' ? [Object.assign(k ? { obj: k } : {}, mt, { rev: true })] : []; }
    let anterior = null;
    return starts.map((st, n) => {
      const prev = n ? starts[n - 1] : Math.max(0, st - 450);
      const next = starts[n + 1] || t.length;
      const antes = t.slice(Math.max(prev, st - 450), st);
      let dentro = t.slice(st, Math.min(next, st + 220)); const corte = dentro.search(/=\s*\d+/); if (corte > 0) dentro = dentro.slice(0, corte + 6);
      let mt = metodo(antes, dentro);
      if (mt.acc === 'B' && anterior && anterior.acc === 'A' && /oratoria|investigaci/i.test(dentro)) mt = { acc: 'A', met: anterior.met };
      anterior = mt;
      let suya = t.slice(st, Math.min(next, st + 260)); const fin = suya.slice(3).search(/·|\btiradas?\b/i); if (fin >= 0) suya = suya.slice(0, fin + 3);
      const tr = trasfondo(suya) || trasfondo(antes.slice(-200));
      if (mt.acc === 'A' && !mt.met && tr && tr.tipo) mt = { acc: 'A', met: { Biblioteca: 'bib', Informantes: 'inf', Seguidores: 'seg' }[tr.tipo] || null };
      if (mt.acc === 'C') return Object.assign({ acc: 'C' }, tr ? { tr } : {});
      let k = elegir(antes, mt.met) || (hitsEn(dentro)[0] || {}).k || null;
      const af = t.slice(st, Math.min(next, st + 200)).match(/(?:penaliza\w*|bonifica\w*|afinidad)\s*(?:por|con|de)?\s*(?:la\s+)?(?:jueza?\s+|profesora?\s+|señora?\s+|madame\s+)?([A-Za-zÁÉÍÓÚáéíóú]+)/i);
      if (af) { const j = Object.keys(JUECES).find(j => JUECES[j].test(af[1])); if (j) k = j; } // «−1 penalización por Vael»: la propia tirada dice a quién va
      if (!k) k = elegir(t.slice(Math.max(0, st - 1500), st), mt.met);
      return Object.assign(k ? { obj: k } : {}, mt, tr ? { tr } : {});
    });
  }

  // ---------------------------------------------------------------- qué trasfondo nombra (tipo, ámbito y específico)
  function trasfondo(v) {
    const W = 'A-Za-zÁÉÍÓÚáéíóúñ';
    const re1 = new RegExp(`(Biblioteca|Informantes|Influencia|Seguidores)\\s*(?:espec[ií]fic[ao])?\\s*[\\(\\[]?\\s*([${W} ]{3,30}?)\\s*[\\)\\]]?\\s*(?:>|›|->)\\s*([${W} ]{3,30})`, 'gi');
    const re2 = new RegExp(`(Biblioteca|Informantes|Influencia|Seguidores)\\s*(?:espec[ií]fic[ao])?\\s*[\\(\\[]?\\s*([${W}]{3,20}(?: [${W}]{3,20})?)`, 'gi');
    const last = re => { let m, x = null; while ((m = re.exec(v))) x = m; return x; };
    const re3 = new RegExp(`trasfondos?\\s*(?:espec[ií]fic[ao]s?)?\\s*[\\(\\[]?\\s*([${W} ]{3,30}?)\\s*[\\)\\]]?\\s*(?:>|›|->)\\s*([${W} ]{3,30})`, 'gi');
    const t3 = last(re3); if (!last(re1) && t3) return { tipo: null, amb: t3[1].trim(), sub: t3[2].trim().split(/\s+(?:para|de|II|III|IV|V|I)\b/)[0] };
    const m = last(re1) || last(re2);
    if (!m) return null;
    const cap = w => w ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : '';
    return { tipo: cap(m[1]), amb: (m[2] || '').trim(), sub: (m[3] || '').trim().split(/\s+(?:para|de|II|III|IV|V|I)\b/)[0] };
  }

  // ---------------------------------------------------------------- lazos, uniones y vínculos
  function lazo(texto, yo) {
    const t = String(texto || '').replace(/Última edición por[\s\S]*$/i, '');
    const g = /\b(v[ií]nculo|uni[oó]n|lazo)\b/gi; let m;
    while ((m = g.exec(t))) {
      const w = t.slice(m.index, m.index + 160);
      for (const [id, n] of Object.entries(PJS)) { if (id === yo) continue; const nom = n.split(' ')[0]; if (new RegExp('@?' + nom, 'i').test(w)) return id; }
    }
    return null;
  }
  // ---------------------------------------------------------------- recursos que se mencionan (para avisar)
  function alertas(texto) {
    const full = String(texto || '').replace(/Última edición por[\s\S]*$/i, '');
    const ini = full.search(/\bAyM\b|acci[oó]n\s*:|tiradas?\s*:/i); // solo la parte fuera de rol, no la narración
    const t = ini >= 0 ? full.slice(ini) : full.slice(-800);
    const out = [];
    const busca = (re, nombre, k) => { const m = t.match(re); if (m) out.push({ t: nombre, k, txt: t.slice(Math.max(0, m.index - 70), m.index + 110).trim() }); };
    busca(/(?<![A-Za-zÁÉÍÓÚáéíóú])P\.?\s?D\.?s?(?![A-Za-záéíóú])|puntos? de destino/i, 'Punto de Destino', 'pd');
    busca(/\brecursos\b/i, 'Recursos', 'rec');
    busca(/orden de merl[ií]n/i, 'Orden de Merlín', 'merlin');
    busca(/\bpatr[oó]n\b/i, 'Patrón', 'patron');
    busca(/(?<!>\s*)\bpoci[oó]n(es)?\b|puntos? de pociones/i, 'Poción', 'poc'); // «Herbología > Pociones» es un trasfondo, no una poción
    busca(/(?<!>\s*)\britual(es)?\b|puntos? de rituales/i, 'Ritual', 'rit');
    return out;
  }

  // ---------------------------------------------------------------- la Caja Misteriosa (BBCode de la página de la caja)
  function cajaPost(texto) {
    const t = String(texto || '').replace(/Última edición por[\s\S]*$/i, '');
    const m = t.match(/Caja Misteriosa n[º°o.]*\s*(\d{1,2})/i); if (!m) return null;
    const c = { n: +m[1] };
    const num = v => /^\d+$/.test(v) ? +v : null;
    const r = t.match(/Tirada:\s*1d10\s*\(\s*([\d?]+)\s*\)\s*\+\s*[^()]+\(\s*([\d?]+)\s*\)\s*\+\s*.+?\(\s*([\d?]+)\s*\)(?:\s*([+−-])\s*Otros\s*\(\s*(\d+)\s*\))?\s*=\s*([\d?]+)\s*vs\s*(\d+)/i);
    if (r) { c.d = num(r[1]); c.a = num(r[2]); c.h = num(r[3]); if (r[5]) c.o = (r[4] === '+' ? 1 : -1) * +r[5]; c.tot = num(r[6]); c.dif = +r[7]; }
    return c;
  }

  // ---------------------------------------------------------------- armar el turno
  function armar(posts, inicioPid, limite) {
    const ini = posts.find(p => p.pid === inicioPid);
    const desde = ini ? ini.fecha : null;
    const posteriores = posts.filter(p => p.pid > inicioPid);
    const fin = posteriores.find(p => p.autor === MASTER);
    const turno = fin ? posteriores.filter(p => p.pid < fin.pid) : posteriores;
    const r = { posts: {}, dados: {}, porCara: {}, cajas: {}, t1: {}, links: {}, detalle: [], edic: {} };
    const clase = f => { let st = 'nor'; if ((f - desde) / 36e5 <= 24) st = 'rap'; if (limite && (limite - f) / 36e5 <= 12) st = 'len'; return st; };
    const peso = { rap: 0, nor: 1, len: 2 };
    turno.forEach(p => {
      if (p.autor === DADOS) {
        const m = p.texto.match(/El miembro\s*'\s*([^']+?)\s*'[\s\S]*?'D\d+'\s*:\s*([\d,\s]+)/i);
        if (!m) return; const id = pjId(m[1]); if (!id) return;
        for (const c of p.texto.matchAll(/'D(\d+)'\s*:\s*([\d,\s]+)/gi)) { // un mismo mensaje puede traer d50 y d10
          const nums = c[2].split(/[,\s]+/).filter(Boolean).map(Number);
          r.dados[id] = (r.dados[id] || []).concat(nums);
          const pc = r.porCara[id] = r.porCara[id] || {}; pc[c[1]] = (pc[c[1]] || []).concat(nums);
        }
        return;
      }
      const id = pjId(p.autor); if (!id) return;
      if (!r.links[id]) r.links[id] = p.url;
      if (!r.pids) r.pids = {}; if (!r.pids[id]) r.pids[id] = p.pid;
      if (!r.posts[id] && p.fecha && desde) {
        const st = clase(p.fecha);
        r.posts[id] = st;
        if (p.ed && p.ed.fecha) { const stEd = clase(p.ed.fecha); if (peso[stEd] > peso[st]) r.edic[id] = { st, stEd, f: p.ed.fecha.toISOString(), txt: p.ed.txt, n: p.ed.n, url: p.url }; } // no cambia el estado: solo avisa
      }
      const cj = cajaPost(p.texto); if (cj) r.cajas[id] = cj; // el último post con la caja manda
      if (!r.t1[id]) {
        const ac = cj ? [] : acciones(p.texto); const lz = lazo(p.texto, id); if (lz) ac.forEach(a => { if (a.acc !== 'B') a.lazo = lz; });
        r.t1[id] = { acciones: ac, alertas: alertas(p.texto), conf: (t => /confesionario/i.test(t) && !/\bno\b[^.\n]{0,40}confesionario/i.test(t))(p.texto.replace(/Última edición por[\s\S]*$/i, '')) };
      }
      r.detalle.push({ id, p });
    });
    Object.entries(r.dados).forEach(([id, d]) => { (r.t1[id] = r.t1[id] || { acciones: [] }).dados = d; });
    Object.entries(r.cajas).forEach(([id, c]) => { const x = r.t1[id] = r.t1[id] || { acciones: [] }; x.caja = c; x.acciones = []; });
    Object.entries(r.porCara).forEach(([id, c]) => { const x = r.t1[id]; x.d50 = c['50'] || []; x.d10 = c['10'] || []; });
    return r;
  }

  // ---------------------------------------------------------------- enviar
  async function enviar(payload) {
    const url = `https://firestore.googleapis.com/v1/projects/${FB.projectId}/databases/(default)/documents/partidas/${DOC}?key=${FB.apiKey}`;
    try { const g = await fetch(url); if (g.ok) { const j = await g.json(); const prev = JSON.parse(j.fields.d.stringValue);
      if (prev && prev.turno === payload.turno) { const antes = prev.t1 || {}; Object.entries(payload.t1 || {}).forEach(([id, x]) => { const a = antes[id]; if (!a) return; if (!x.caja) x.caja = a.caja || null; if (!(x.d50 || []).length) x.d50 = a.d50 || []; if (!(x.d10 || []).length) x.d10 = a.d10 || []; }); // la caja y sus dados pueden venir en posts distintos
        ['posts', 'dados', 'links', 't1', 'pids', 'ediciones'].forEach(k => { payload[k] = Object.assign({}, prev[k] || {}, payload[k] || {}); }); payload.inicio = payload.inicio || prev.inicio; payload.limite = payload.limite || prev.limite; } } } catch (e) { /* si no hay nada guardado, se envía tal cual */ }
    const body = { fields: { d: { stringValue: JSON.stringify(payload) }, at: { integerValue: String(Date.now()) }, v: { integerValue: '1' } } };
    const r = await fetch(url, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!r.ok) throw new Error('Firebase ' + r.status);
  }

  // ---------------------------------------------------------------- fuera del tema de Magic Chef: enviar la ficha de un concursante
  if (!/^\/t37947(p\d+)?-/.test(location.pathname)) { fichaModo(); return; }
  function fichaModo() {
    const posts = [...document.querySelectorAll('div.post[id^="p"]')]; if (!posts.length) return;
    const au = el => ((el.querySelector('p.author strong') || {}).textContent || '').trim();
    const yo = au(posts[0]); const id = pjId(yo); if (!id) return; // solo temas abiertos por un concursante
    const tx = el => { const c = el.cloneNode(true); c.querySelectorAll('br').forEach(b => b.replaceWith('\n')); c.querySelectorAll('span,b,strong,i,em,a,td,th,font,u').forEach(e => e.append(' '));
      c.querySelectorAll('div,p,li,tr,h1,h2,h3,h4,h5,dd,dt,blockquote').forEach(b => b.append('\n')); return (c.textContent || '').replace(/[ \t\u00a0]+/g, ' ').replace(/ *\n\s*/g, '\n'); };
    const todo = posts.filter(p => au(p) === yo).map(p => { const c = p.querySelector('.content'); return c ? tx(c) : ''; }).join('\n');
    const low = todo.toLowerCase(); let a0 = -1; const ra = /atribut|\bstats\b/g; let m;
    while ((m = ra.exec(low))) { if (/vigor/.test(low.slice(m.index, m.index + 400))) { a0 = m.index; break; } }
    if (a0 < 0) return; // no parece una ficha
    const txt = todo.slice(a0, a0 + 16000);
    const stl = document.createElement('style'); stl.textContent = `#mcf-fi{position:fixed;right:18px;bottom:18px;z-index:99999;padding:10px 16px;border:0;border-radius:99px;background:#B05E3E;color:#FBF7EF;font:600 13px Georgia,serif;letter-spacing:.04em;box-shadow:0 4px 14px rgba(0,0,0,.3);cursor:pointer}#mcf-fi.ok{background:#657F59}#mcf-fi:disabled{opacity:.7;cursor:wait}`; document.head.appendChild(stl);
    const b = document.createElement('button'); b.id = 'mcf-fi'; b.type = 'button'; b.textContent = '📋 Ficha de ' + yo.split(' ')[0] + ' al tracker'; document.body.appendChild(b);
    b.addEventListener('click', async () => {
      b.disabled = true; b.textContent = 'Enviando…';
      const url = `https://firestore.googleapis.com/v1/projects/${FB.projectId}/databases/(default)/documents/partidas/MC-MAGICCHEF-FICHAS?key=${FB.apiKey}`;
      try {
        let prev = {}; try { const g = await fetch(url); if (g.ok) { const j = await g.json(); prev = JSON.parse(j.fields.d.stringValue) || {}; } } catch (e) {}
        prev[id] = { txt, url: location.href.split('#')[0], ts: Date.now(), autor: yo };
        const body = { fields: { d: { stringValue: JSON.stringify(prev) }, at: { integerValue: String(Date.now()) }, v: { integerValue: '1' } } };
        const r = await fetch(url, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        if (!r.ok) throw new Error('Firebase ' + r.status);
        b.textContent = '✓ Ficha enviada · en el tracker: Fichas → Traer fichas del foro'; b.classList.add('ok');
      } catch (e) { b.textContent = '⚠ No pude enviarla (' + e.message + '). Reintentar'; }
      b.disabled = false;
    });
  }

  // ---------------------------------------------------------------- panel
  const css = `#mcf-btn{position:fixed;right:18px;bottom:18px;z-index:99999;padding:10px 16px;border:0;border-radius:99px;background:#B05E3E;color:#FBF7EF;font:600 13px Georgia,serif;letter-spacing:.06em;box-shadow:0 4px 14px rgba(0,0,0,.3);cursor:pointer}
#mcf{position:fixed;right:18px;bottom:70px;z-index:99999;width:min(720px,calc(100vw - 36px));max-height:78vh;overflow:auto;background:#FBF7EF;color:#45372B;border:1px solid #C4A05A;border-radius:10px;box-shadow:0 14px 40px rgba(0,0,0,.35);font:14px/1.45 Georgia,serif;padding:16px 18px}
#mcf h3{margin:0 0 8px;font:700 18px Georgia,serif;color:#8E4A30}
#mcf label{display:block;margin:6px 0;font-size:13px}
#mcf select,#mcf input{font:14px Georgia,serif;padding:3px 6px;border:1px solid #C4A05A;border-radius:5px;background:#fff;color:#45372B}
#mcf table{width:100%;border-collapse:collapse;margin-top:10px;font-size:13px}
#mcf th{background:#2E2118;color:#E3C98E;text-align:left;padding:5px 6px;font-weight:600}
#mcf td{border-top:1px solid rgba(69,55,43,.15);padding:5px 6px;vertical-align:top}
#mcf .rap{color:#5E7752;font-weight:700}#mcf .len{color:#A9473A;font-weight:700}#mcf .nor{color:#8E6A2A;font-weight:700}
#mcf .rev{background:#FFF3C4}
#mcf .acts{display:flex;gap:8px;justify-content:flex-end;margin-top:12px}
#mcf button{padding:8px 14px;border:0;border-radius:99px;background:#B05E3E;color:#FBF7EF;font:600 13px Georgia,serif;cursor:pointer}
#mcf button.g{background:#657F59}
#mcf .msg{margin-top:8px;font-style:italic}`;
  const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
  const btn = document.createElement('button'); btn.id = 'mcf-btn'; btn.textContent = '🍳 Magic Chef'; document.body.appendChild(btn);
  let panel = null, POSTS = [];

  const guard = (k, v) => { try { if (v === undefined) return localStorage.getItem('mcf-' + k); localStorage.setItem('mcf-' + k, v); } catch (e) { return null; } };

  // ---------------------------------------------------------------- Turno 2: Empatía y, si falla, Frialdad
  function t2desc(x) {
    x = x || {}; const d = (x.d10 && x.d10.length) ? x.d10 : (x.dados || []);
    const partes = [`Empatía: <b>${d[0] ?? '—'}</b>`];
    if (d.length > 1) partes.push(`Frialdad: <b>${d[1]}</b> <small>(solo cuenta si falla Empatía)</small>`);
    if (x.conf) partes.push('Confesionario ✓');
    const av = d.length > 2 ? `<br><span style="color:#A9473A">⚠ Tiró ${d.length} d10 (${d.join(', ')}): revisa el orden en el tracker</span>` : '';
    return { html: partes.join(' · ') + av, revisar: !d.length || d.length > 2, txt: partes.join(' · ').replace(/<[^>]+>/g, '') };
  }

  btn.addEventListener('click', async () => {
    if (panel) { panel.remove(); panel = null; return; }
    panel = document.createElement('div'); panel.id = 'mcf'; panel.innerHTML = '<h3>Magic Chef · del foro al tracker</h3><div class="msg">Leyendo todas las páginas del tema…</div>'; document.body.appendChild(panel);
    POSTS = await leerTodo();
    const turnos = POSTS.filter(p => p.autor === MASTER);
    if (!turnos.length) { panel.innerHTML = '<h3>Magic Chef</h3><p>No encontré posts de Hana en este tema.</p>'; return; }
    const ult = turnos[turnos.length - 1];
    panel.innerHTML = `<h3>Magic Chef · del foro al tracker</h3>
      <label>Turno que empieza en el post de Hana:
        <select id="mcf-ini">${turnos.map(p => `<option value="${p.pid}" ${p.pid === ult.pid ? 'selected' : ''}>#${p.pid} · ${p.fechaTxt}</option>`).join('')}</select></label>
      <label>Número de turno en el tracker: <input id="mcf-turno" type="number" min="1" max="60" value="${guard('turno-' + ult.pid) || guard('turno') || 1}" style="width:60px"></label>
      <label>Fecha límite (para marcar los lentos): <input id="mcf-lim" type="datetime-local" value="${guard('lim') || ''}"></label>
      <div id="mcf-tab"></div>
      <div class="acts"><button class="g" id="mcf-cerrar">Cerrar</button><button id="mcf-env">Enviar al tracker</button></div>
      <div class="msg" id="mcf-msg"></div>`;
    const pintar = () => {
      const lim = panel.querySelector('#mcf-lim').value ? new Date(panel.querySelector('#mcf-lim').value) : null;
      const r = armar(POSTS, +panel.querySelector('#mcf-ini').value, lim);
      panel._r = r;
      const T = { rap: 'Rápido', nor: 'A tiempo', len: 'Lento' };
      const esT2 = +panel.querySelector('#mcf-turno').value === 2;
      const filas = Object.keys(PJS).map(id => {
        const x = r.t1[id]; const ac = (x && x.acciones) || []; const da = (x && x.dados) || [];
        const desc = ac.map(a => a.acc === 'C' ? 'C · ingrediente' : a.acc === 'B' ? `B · congeniar con ${JN[a.obj]}` : `A · ${a.met === 'bib' ? 'Biblioteca' : a.met === 'seg' ? 'Seguidores' : a.met === 'inf' ? 'Informantes' : 'Trasfondo (el tipo lo saca el tracker de la ficha)'} → ${JN[a.obj]}`).join('<br>');
        const hayCaja = x && (x.caja || (x.d50 || []).length);
        const revisar = r.posts[id] && (hayCaja ? (!x.caja || !(x.d50 || []).length || (x.d10 || []).length !== 1) : (!ac.length || ac.length !== da.length || ac.some(a => a.rev || (a.acc !== 'C' && !a.obj))));
        const lz = esT2 ? null : ac.find(a => a.lazo); const al = (x && x.alertas) || []; const edi = r.edic[id];
        const t2 = esT2 ? t2desc(x) : null;
        const extra = (lz ? `<br><b>Usa el trasfondo de ${PJS[lz.lazo].split(' ')[0]}</b>` : '') + (al.length ? `<br><span style="color:#A9473A">⚠ Menciona: ${al.map(a => a.t).join(', ')}</span>` : '') + (edi ? `<br><span style="color:#A9473A">⚠ Editado ${edi.txt}: esa fecha daría ${T[edi.stEd]}</span>` : '');
        const rv = esT2 ? (r.posts[id] && t2.revisar) : revisar;
        return `<tr class="${rv || al.length || edi ? 'rev' : ''}"><td>${PJS[id]}</td><td class="${r.posts[id] || ''}">${r.posts[id] ? T[r.posts[id]] : '—'}</td><td>${da.join(', ') || '—'}</td><td>${esT2 ? (r.posts[id] || da.length ? t2.html : '—') : hayCaja ? `Caja ${x.caja ? 'nº ' + x.caja.n : '<i>sin BBCode</i>'} · d50: ${(x.d50 || []).join(', ') || '—'} · d10: ${(x.d10 || []).join(', ') || '—'}` : (desc || (r.posts[id] ? '<i>no la entendí</i>' : '—'))}${extra}</td></tr>`;
      }).join('');
      panel.querySelector('#mcf-tab').innerHTML = `<table><thead><tr><th>Concursante</th><th>Posteo</th><th>Dados</th><th>${esT2 ? 'Tiradas del Turno 2' : 'Acción que entendí'}</th></tr></thead><tbody>${filas}</tbody></table>
        <div class="msg">${esT2 ? 'En amarillo: falta el dado, tiró más de dos d10 (revisa el orden), menciona un recurso o una edición cambiaría el posteo. El primer d10 va a Empatía; el segundo, a Frialdad solo si la Empatía falla.' : 'En amarillo: lo que conviene revisar en el tracker (no encontré la tirada escrita, falta el juez, no coinciden dados y acciones, o una edición cambiaría el posteo).'}</div>`;
    };
    panel.querySelector('#mcf-ini').addEventListener('change', e => { const g = guard('turno-' + e.target.value); if (g) panel.querySelector('#mcf-turno').value = g; pintar(); });
    panel.querySelector('#mcf-lim').addEventListener('change', e => { guard('lim', e.target.value); pintar(); });
    panel.querySelector('#mcf-turno').addEventListener('change', e => { guard('turno', e.target.value); guard('turno-' + panel.querySelector('#mcf-ini').value, e.target.value); pintar(); });
    panel.querySelector('#mcf-cerrar').addEventListener('click', () => { panel.remove(); panel = null; });
    panel.querySelector('#mcf-env').addEventListener('click', async () => {
      const r = panel._r; const msg = panel.querySelector('#mcf-msg');
      const ini = POSTS.find(p => p.pid === +panel.querySelector('#mcf-ini').value);
      const payload = { ts: Date.now(), turno: +panel.querySelector('#mcf-turno').value || 1, inicio: ini && ini.fecha ? ini.fecha.toISOString() : null,
        limite: panel.querySelector('#mcf-lim').value || null, posts: r.posts, dados: r.dados, links: r.links, pids: r.pids || {}, ediciones: r.edic || {},
        t1: Object.fromEntries(Object.entries(r.t1).map(([id, x]) => [id, { pid: (r.pids || {})[id] || null, acciones: x.acciones || [], dados: x.dados || [], alertas: x.alertas || [], conf: !!x.conf, caja: x.caja || null, d50: x.d50 || [], d10: x.d10 || [] }])) };
      msg.textContent = 'Enviando…';
      guard('turno-' + panel.querySelector('#mcf-ini').value, String(payload.turno)); Object.values(r.pids || {}).forEach(p => guard('env-' + p, '1'));
      try { await enviar(payload); msg.textContent = '¡Listo! Abre el tracker como máster y pulsa «Traer del foro».'; }
      catch (e) { msg.textContent = 'No pude enviarlo (' + e.message + '). Revisa las reglas de Firebase.'; }
    });
    pintar();
  });

  // ---------------------------------------------------------------- un botón por post: enviar solo esa tirada
  const css2 = `.mcf-uno{margin-left:8px;padding:2px 9px;border:0;border-radius:99px;background:#B05E3E;color:#FBF7EF;font:600 11px Georgia,serif;cursor:pointer;vertical-align:middle}
.mcf-uno.ok{background:#657F59}.mcf-uno:disabled{opacity:.6;cursor:wait}
#mcf-toast{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:99999;max-width:min(560px,calc(100vw - 32px));background:#FBF7EF;color:#45372B;border:1px solid #C4A05A;border-radius:10px;padding:10px 14px;font:14px/1.45 Georgia,serif;box-shadow:0 10px 30px rgba(0,0,0,.3)}`;
  const st2 = document.createElement('style'); st2.textContent = css2; document.head.appendChild(st2);
  const toast = html => { let t = document.getElementById('mcf-toast'); if (!t) { t = document.createElement('div'); t.id = 'mcf-toast'; document.body.appendChild(t); }
    t.innerHTML = html; clearTimeout(t._h); t._h = setTimeout(() => t.remove(), 9000); };
  function payloadDe(r, turno, inicio, limite) {
    return { ts: Date.now(), turno, inicio, limite, posts: r.posts, dados: r.dados, links: r.links, pids: r.pids || {}, ediciones: r.edic || {},
      t1: Object.fromEntries(Object.entries(r.t1).map(([id, x]) => [id, { pid: (r.pids || {})[id] || null, acciones: x.acciones || [], dados: x.dados || [], alertas: x.alertas || [], conf: !!x.conf, caja: x.caja || null, d50: x.d50 || [], d10: x.d10 || [] }])) };
  }
  async function enviarUno(pid, b) {
    b.disabled = true; b.textContent = 'Leyendo…';
    try {
      POSTS = await leerTodo(); // siempre fresco: así un dado recién tirado se ve sin recargar
      const yo = POSTS.find(p => p.pid === pid); const id = yo && pjId(yo.autor);
      if (!id) throw new Error('no es un post de concursante');
      const ini = POSTS.filter(p => p.autor === MASTER && p.pid < pid).pop();
      if (!ini) throw new Error('no encontré el turno de Hana anterior');
      // los dados de este post: los de «Dados Mágicos» de este PJ hasta su siguiente post o el siguiente turno
      const sig = POSTS.find(p => p.pid > pid && (p.autor === MASTER || p.autor === yo.autor));
      const dados = POSTS.filter(p => p.autor === DADOS && p.pid > pid && (!sig || p.pid < sig.pid) && pjId((p.texto.match(/El miembro\s*'\s*([^']+?)\s*'/i) || [])[1] || '') === id);
      const lim = guard('lim') ? new Date(guard('lim')) : null;
      const r = armar([ini, yo].concat(dados), ini.pid, lim);
      let turno = +guard('turno-' + ini.pid);
      if (!turno) { // post de Hana todavía sin turno asignado: mejor preguntar que mandarlo al turno equivocado
        const v = prompt(`¿Qué número de turno es el post de Hana #${ini.pid} (${ini.fechaTxt})?`, guard('turno') || '1');
        if (!v || !(+v >= 1)) throw new Error('falta el número de turno');
        turno = +v; guard('turno-' + ini.pid, String(turno));
      }
      await enviar(payloadDe(r, turno, ini.fecha ? ini.fecha.toISOString() : null, guard('lim') || null));
      guard('env-' + pid, '1');
      const x = r.t1[id] || {}; const ac = x.acciones || [];
      const desc = turno === 2 ? t2desc(x).html : (x.caja || (x.d50 || []).length) ? `Caja ${x.caja ? 'nº ' + x.caja.n : '(sin BBCode)'} · d50: ${(x.d50 || []).join(', ') || '—'} · d10: ${(x.d10 || []).join(', ') || '—'}` : ac.map(a => a.acc === 'C' ? 'C · ingrediente' : a.acc === 'B' ? 'B · congeniar con ' + JN[a.obj] : 'A · ' + (a.met === 'bib' ? 'Biblioteca' : a.met === 'seg' ? 'Seguidores' : a.met === 'inf' ? 'Informantes' : 'Trasfondo') + ' → ' + (JN[a.obj] || '¿juez?')).join(' · ') || '<i>no entendí la acción</i>';
      toast(`<b>${PJS[id]}</b> enviado al turno ${turno}.<br>${desc}<br>Dados: ${(x.dados || []).join(', ') || '—'}${r.edic[id] ? '<br>⚠ Tiene una edición para revisar en Asistencia.' : ''}<br><small>En el tracker pulsa «Traer del foro»: solo se suma lo que no estaba importado.</small>`);
      b.textContent = '✓ En el tracker'; b.classList.add('ok');
    } catch (e) { toast('No pude enviarlo: ' + e.message); b.textContent = '🍳 Al tracker'; }
    b.disabled = false;
  }
  document.querySelectorAll('div.post[id^="p"]').forEach(el => {
    const au = el.querySelector('p.author'); if (!au) return;
    const nombre = ((au.querySelector('strong') || {}).textContent || '').trim();
    if (!pjId(nombre)) return;
    const pid = +el.id.slice(1);
    const b = document.createElement('button'); b.type = 'button'; b.className = 'mcf-uno';
    b.textContent = guard('env-' + pid) ? '✓ En el tracker' : '🍳 Al tracker'; if (guard('env-' + pid)) b.classList.add('ok');
    b.title = 'Enviar solo esta tirada al tracker';
    b.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); enviarUno(pid, b); });
    au.appendChild(b);
  });

  // para pruebas fuera del foro
  window.__MCF = { leerPagina, armar, cajaPost, payloadDe, enviar, acciones, fecha, lazo, alertas, trasfondo, payloadDe };
})();
