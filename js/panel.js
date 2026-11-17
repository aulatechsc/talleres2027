// ============================================================
//  Panel de gestión de talleres — Inicial / Primaria / Secundaria
// ============================================================
(function () {
  const CFG = window.TALLERES_CONFIG;
  const DIAS = CFG.dias;
  const $ = (s, el = document) => el.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const norm = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

  const S = {
    nivel: localStorage.getItem('talleres_nivel') || 'primaria',
    vista: 'alumnos',
    alumnos: [], asig: {}, inscripciones: [], historial: [],
    q: '', fCurso: '', fEstado: '', fInscr: 'pendiente'
  };
  const N = () => CFG.niveles[S.nivel];
  const alumnoById = id => S.alumnos.find(a => a.id === id);
  const nombreAl = a => `${a.apellido}, ${a.nombre}`;
  const cursoIdx = c => { const i = N().cursos.indexOf(c); return i < 0 ? 999 : i; };

  // ---------- UI helpers ----------
  function toast(msg, tipo = '') {
    const el = $('#toast'); el.textContent = msg; el.className = 'show ' + tipo;
    clearTimeout(toast.t); toast.t = setTimeout(() => el.className = '', 3000);
  }
  const spin = (v, txt) => { $('#spinner').classList.toggle('hidden', !v); if (txt) $('#spin-text').textContent = txt; };

  function modal(html, onMount) {
    $('#modal-box').innerHTML = html;
    $('#modal').classList.add('open');
    const close = () => $('#modal').classList.remove('open');
    $('#modal-box').querySelectorAll('[data-close]').forEach(b => b.onclick = close);
    onMount && onMount($('#modal-box'), close);
    return close;
  }
  $('#modal').addEventListener('mousedown', e => { if (e.target.id === 'modal') $('#modal').classList.remove('open'); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') $('#modal').classList.remove('open'); });

  function confirmar(titulo, texto, ok = 'Confirmar') {
    return new Promise(res => {
      modal(`<h2>${esc(titulo)}</h2><p class="modal-sub">${texto}</p>
        <div class="modal-actions"><button class="btn" data-close>Cancelar</button>
        <button class="btn btn-red" id="m-ok">${esc(ok)}</button></div>`, (box, close) => {
        $('#m-ok', box).onclick = () => { close(); res(true); };
        box.querySelector('[data-close]').addEventListener('click', () => res(false));
      });
    });
  }

  // ---------- Carga de datos ----------
  async function cargar() {
    spin(true, 'Cargando ' + N().nombre + '…');
    try {
      const [al, as, ins] = await Promise.all([
        DB.listAlumnos(S.nivel), DB.listAsignaciones(S.nivel), DB.listInscripciones(S.nivel)
      ]);
      S.alumnos = al.sort((a, b) => cursoIdx(a.curso) - cursoIdx(b.curso) || norm(nombreAl(a)).localeCompare(norm(nombreAl(b))));
      S.asig = {};
      as.forEach(x => { (S.asig[x.alumno_id] ||= {})[x.dia] = x; });
      S.inscripciones = ins;
      if (S.vista === 'historial') S.historial = await DB.listHistorial(S.nivel);
    } catch (e) { toast('Error al cargar: ' + e.message, 'error'); }
    spin(false);
    render();
  }

  // ---------- Header: niveles + vistas ----------
  function renderNav() {
    $('#niveles').innerHTML = Object.entries(CFG.niveles).map(([k, n]) =>
      `<button data-n="${k}" class="${k === S.nivel ? 'on' : ''}">${esc(n.nombre.replace('Nivel ', ''))}</button>`).join('');
    $('#niveles').querySelectorAll('button').forEach(b => b.onclick = () => {
      S.nivel = b.dataset.n; S.fCurso = ''; S.q = '';
      localStorage.setItem('talleres_nivel', S.nivel);
      renderNav(); cargar();
    });
    $('#vistas').querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.v === S.vista));
  }
  $('#vistas').querySelectorAll('button').forEach(b => b.onclick = async () => {
    S.vista = b.dataset.v;
    renderNav();
    if (S.vista === 'historial') { spin(true, 'Cargando historial…'); S.historial = await DB.listHistorial(S.nivel); spin(false); }
    render();
  });

  function renderContadores() {
    $('#c-alumnos').textContent = S.alumnos.length || '';
    const p = S.inscripciones.filter(i => i.estado === 'pendiente').length;
    $('#c-pend').textContent = p || '';
  }

  function renderAcciones() {
    const demo = DB.modo === 'demo';
    const a = $('#acciones');
    if (S.vista === 'alumnos') {
      a.innerHTML = `
        <button class="btn btn-sm" id="a-import">⬆ Importar lista</button>
        <button class="btn btn-sm" id="a-add">＋ Alumno</button>
        <button class="btn btn-sm" id="a-exp1">⬇ Por alumno</button>
        <button class="btn btn-sm" id="a-exp2">⬇ Por taller</button>
        ${demo ? `<button class="btn btn-sm demo" id="a-demo">🎲 Datos de prueba</button><button class="btn btn-sm demo" id="a-reset">Reiniciar</button>` : ''}`;
      $('#a-import').onclick = modalImportar;
      $('#a-add').onclick = () => modalAlumno();
      $('#a-exp1').onclick = exportarPorAlumno;
      $('#a-exp2').onclick = exportarPorTaller;
      if (demo) { $('#a-demo').onclick = cargarDemo; $('#a-reset').onclick = resetDemo; }
    } else if (S.vista === 'inscripciones') {
      a.innerHTML = `<button class="btn btn-sm btn-primary" id="a-proc">Vincular automáticamente</button>
        <button class="btn btn-sm" id="a-expi">⬇ Exportar</button>`;
      $('#a-proc').onclick = procesarTodas;
      $('#a-expi').onclick = exportarInscripciones;
    } else a.innerHTML = '';
  }

  function render() {
    renderContadores(); renderAcciones();
    ({ alumnos: vistaAlumnos, inscripciones: vistaInscripciones, resumen: vistaResumen, historial: vistaHistorial })[S.vista]();
  }

  // ============================================================
  //  VISTA ALUMNOS
  // ============================================================
  function filtrosHTML(extra = '') {
    return `<div class="filtros">
      <div class="search"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input id="f-q" placeholder="Buscar por nombre o apellido…" value="${esc(S.q)}" autocomplete="off"></div>
      <select class="input" id="f-curso"><option value="">Todos los cursos</option>
        ${N().cursos.map(c => `<option ${c === S.fCurso ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>
      ${extra}<span class="count" id="f-count"></span></div>`;
  }

  function vistaAlumnos() {
    const main = $('#main');
    if (!S.alumnos.length) {
      main.innerHTML = `<div class="empty"><div class="icon">📋</div><h3>Todavía no hay alumnos cargados en ${esc(N().nombre)}</h3>
        <p>Importá la lista ${CFG.cicloLectivo} (CSV o pegado desde Excel con columnas <b>curso, apellido, nombre</b>).</p>
        <button class="btn btn-primary" id="e-imp">Importar lista</button></div>`;
      $('#e-imp').onclick = modalImportar;
      return;
    }
    main.innerHTML = filtrosHTML(`<select class="input" id="f-estado">
        <option value="">Todos</option>
        <option value="con" ${S.fEstado === 'con' ? 'selected' : ''}>Con talleres</option>
        <option value="sin" ${S.fEstado === 'sin' ? 'selected' : ''}>Sin talleres</option></select>`) +
      `<div class="grid-wrap"><div class="grid-head"><div></div>${DIAS.map((d, i) => `<div class="dh d${i}">${d}</div>`).join('')}</div><div id="lista"></div></div>`;
    $('#f-q').oninput = e => { S.q = e.target.value; pintarLista(); };
    $('#f-curso').onchange = e => { S.fCurso = e.target.value; pintarLista(); };
    $('#f-estado').onchange = e => { S.fEstado = e.target.value; pintarLista(); };
    pintarLista();
  }

  function filtrarAlumnos() {
    const q = norm(S.q);
    return S.alumnos.filter(a => {
      if (S.fCurso && a.curso !== S.fCurso) return false;
      if (q && !norm(a.nombre + ' ' + a.apellido + ' ' + a.apellido + ' ' + a.nombre).includes(q)) return false;
      const n = Object.keys(S.asig[a.id] || {}).length;
      if (S.fEstado === 'con' && !n) return false;
      if (S.fEstado === 'sin' && n) return false;
      return true;
    });
  }

  function pintarLista() {
    const lista = $('#lista'); if (!lista) return;
    const fil = filtrarAlumnos();
    $('#f-count').textContent = `${fil.length} de ${S.alumnos.length}`;
    if (!fil.length) { lista.innerHTML = `<div class="empty small">No hay alumnos con ese filtro.</div>`; return; }
    const frag = document.createDocumentFragment();
    let curso = null;
    fil.forEach(a => {
      if (a.curso !== curso) {
        curso = a.curso;
        const total = fil.filter(x => x.curso === curso).length;
        const sep = document.createElement('div');
        sep.className = 'curso-sep';
        sep.innerHTML = `${esc(curso)} <span>${total} alumno${total !== 1 ? 's' : ''} · ${esc(N().grupos[N().grupoDeCurso(curso)] || '')}</span>`;
        frag.appendChild(sep);
      }
      frag.appendChild(filaAlumno(a));
    });
    lista.innerHTML = ''; lista.appendChild(frag);
  }

  function filaAlumno(a) {
    const row = document.createElement('div');
    row.className = 'al-row'; row.dataset.id = a.id;
    const n = Object.keys(S.asig[a.id] || {}).length;
    row.innerHTML = `<div class="al-info"><div class="al-nom" title="${esc(nombreAl(a))}">${esc(nombreAl(a))}</div>
      <div class="al-meta"><span class="tag">${esc(a.curso)}</span><span class="n ${n ? '' : 'cero'}">${n} taller${n !== 1 ? 'es' : ''}</span>
      <button class="al-del" title="Quitar alumno de la lista">🗑</button></div></div>`;
    row.querySelector('.al-del').onclick = () => borrarAlumno(a);
    DIAS.forEach((_, d) => { const c = document.createElement('div'); c.className = 'cell'; row.appendChild(c); pintarCelda(c, a, d); });
    return row;
  }

  function pintarCelda(cell, a, d) {
    cell.innerHTML = '';
    const actual = (S.asig[a.id] || {})[d];
    const opts = window.talleresPosibles(S.nivel, a.curso, d);
    if (actual) {
      const fuera = !opts.includes(actual.taller);
      const pill = document.createElement('div');
      pill.className = `pill d${d}` + (fuera ? ' fuera' : '');
      pill.innerHTML = `<span class="pn" title="${fuera ? 'No figura en la grilla de este curso · ' : ''}${actual.origen === 'formulario' ? 'Desde formulario' : 'Asignado en panel'} · clic para cambiar">${actual.origen === 'formulario' ? '<i class="dot"></i>' : ''}${esc(actual.taller)}</span><button class="x" title="Quitar taller">×</button>`;
      pill.querySelector('.pn').onclick = () => cambiarEnCelda(cell, a, d, actual.taller, opts);
      pill.querySelector('.x').onclick = () => quitar(cell, a, d);
      cell.appendChild(pill);
    } else if (opts.length) {
      const sel = document.createElement('select');
      sel.className = `asig d${d}`;
      sel.innerHTML = `<option value="">+ Asignar</option>` + opts.map(t => `<option>${esc(t)}</option>`).join('');
      sel.onchange = () => sel.value && asignar(cell, a, d, sel.value, null);
      cell.appendChild(sel);
    } else {
      cell.innerHTML = `<div class="none" title="Sin talleres este día">—</div>`;
    }
  }

  function cambiarEnCelda(cell, a, d, actual, opts) {
    const sel = document.createElement('select');
    sel.className = `asig d${d} editing`;
    const lista = opts.includes(actual) ? opts : [actual, ...opts];
    sel.innerHTML = lista.map(t => `<option ${t === actual ? 'selected' : ''}>${esc(t)}</option>`).join('');
    cell.innerHTML = ''; cell.appendChild(sel); sel.focus();
    let done = false;
    sel.onchange = () => { done = true; if (sel.value !== actual) asignar(cell, a, d, sel.value, actual); else pintarCelda(cell, a, d); };
    sel.onblur = () => setTimeout(() => { if (!done) pintarCelda(cell, a, d); }, 150);
  }

  async function asignar(cell, a, d, taller, anterior) {
    cell.classList.add('loading');
    try {
      await DB.setAsignacion(a.id, d, taller, 'panel');
      (S.asig[a.id] ||= {})[d] = { alumno_id: a.id, dia: d, taller, origen: 'panel' };
      await DB.log({ nivel: S.nivel, alumno_id: a.id, alumno: nombreAl(a), accion: anterior ? 'cambiar' : 'asignar', dia: d, taller_anterior: anterior, taller_nuevo: taller });
      toast(anterior ? `${DIAS[d]}: ${anterior} → ${taller}` : `${taller} asignado ✓`, 'ok');
    } catch (e) { toast('Error: ' + e.message, 'error'); }
    cell.classList.remove('loading');
    refrescarFila(a);
  }

  async function quitar(cell, a, d) {
    const prev = S.asig[a.id][d].taller;
    cell.classList.add('loading');
    try {
      await DB.deleteAsignacion(a.id, d);
      delete S.asig[a.id][d];
      await DB.log({ nivel: S.nivel, alumno_id: a.id, alumno: nombreAl(a), accion: 'eliminar', dia: d, taller_anterior: prev });
      toast(`${prev} quitado`, 'ok');
    } catch (e) { toast('Error: ' + e.message, 'error'); }
    cell.classList.remove('loading');
    refrescarFila(a);
  }

  function refrescarFila(a) {
    const old = document.querySelector(`.al-row[data-id="${a.id}"]`);
    if (old) old.replaceWith(filaAlumno(a));
    renderContadores();
  }

  async function borrarAlumno(a) {
    const n = Object.keys(S.asig[a.id] || {}).length;
    if (!await confirmar('Quitar alumno', `¿Quitar a <b>${esc(nombreAl(a))}</b> (${esc(a.curso)}) de la lista?${n ? ` Se borran también sus ${n} talleres.` : ''}`, 'Quitar')) return;
    try {
      await DB.deleteAlumno(a.id);
      await DB.log({ nivel: S.nivel, alumno: nombreAl(a), accion: 'baja_alumno' });
      toast('Alumno quitado', 'ok');
      cargar();
    } catch (e) { toast('Error: ' + e.message, 'error'); }
  }

  function modalAlumno(pre = {}, onCreado) {
    modal(`<h2>Agregar alumno</h2><p class="modal-sub">${esc(N().nombre)} · ${CFG.cicloLectivo}</p>
      <div class="field"><label>Apellido</label><input id="m-ape" value="${esc(pre.apellido || '')}"></div>
      <div class="field"><label>Nombre</label><input id="m-nom" value="${esc(pre.nombre || '')}"></div>
      <div class="field"><label>${esc(N().etiquetaCurso)}</label><select id="m-cur"><option value="">—</option>
        ${N().cursos.map(c => `<option ${c === pre.curso ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></div>
      <p class="modal-err" id="m-err"></p>
      <div class="modal-actions"><button class="btn" data-close>Cancelar</button><button class="btn btn-primary" id="m-ok">Agregar</button></div>`,
      (box, close) => {
        $('#m-ape', box).focus();
        $('#m-ok', box).onclick = async () => {
          const r = { apellido: $('#m-ape', box).value.trim(), nombre: $('#m-nom', box).value.trim(), curso: $('#m-cur', box).value };
          if (!r.apellido || !r.nombre || !r.curso) { $('#m-err', box).textContent = 'Completá todos los campos.'; return; }
          try {
            const al = await DB.addAlumno(S.nivel, r);
            await DB.log({ nivel: S.nivel, alumno_id: al.id, alumno: nombreAl(al), accion: 'alta_alumno' });
            close(); toast('Alumno agregado ✓', 'ok');
            if (onCreado) await onCreado(al); else await cargar();
          } catch (e) { $('#m-err', box).textContent = e.message; }
        };
      });
  }

  // ---------- Importar lista ----------
  function modalImportar() {
    modal(`<h2>Importar lista ${CFG.cicloLectivo} · ${esc(N().nombre)}</h2>
      <p class="modal-sub">Columnas: <b>curso, apellido, nombre</b> (en cualquier orden, con encabezado). Los alumnos que ya estén cargados no se duplican.</p>
      <div class="field"><label>Archivo CSV</label><input type="file" id="m-file" accept=".csv,.txt,.tsv"></div>
      <div class="field"><label>…o pegá desde Excel / Sheets</label><textarea id="m-txt" rows="6" placeholder="curso	apellido	nombre&#10;${esc(N().cursos[0])}	García	Valentina"></textarea></div>
      <div id="m-prev" class="prev"></div>
      <div class="modal-actions"><button class="btn" data-close>Cancelar</button><button class="btn btn-primary" id="m-ok" disabled>Importar</button></div>`,
      (box, close) => {
        let filas = [];
        const analizar = (text) => {
          const res = interpretarLista(text);
          filas = res.ok;
          $('#m-prev', box).innerHTML = res.error ? `<p class="modal-err">${esc(res.error)}</p>` :
            `<p><b>${res.ok.length}</b> alumnos válidos${res.malos.length ? ` · <span class="modal-err">${res.malos.length} con ${esc(N().etiquetaCurso.toLowerCase())} desconocido/a: ${esc([...new Set(res.malos.map(m => m.curso))].slice(0, 6).join(', '))}</span>` : ''}</p>` +
            (res.ok.length ? `<p class="mini">${Object.entries(res.ok.reduce((m, r) => (m[r.curso] = (m[r.curso] || 0) + 1, m), {})).map(([c, n]) => `${esc(c)}: ${n}`).join(' · ')}</p>` : '');
          $('#m-ok', box).disabled = !filas.length;
        };
        $('#m-file', box).onchange = async e => { const f = e.target.files[0]; if (f) analizar(await f.text()); };
        $('#m-txt', box).oninput = e => analizar(e.target.value);
        $('#m-ok', box).onclick = async () => {
          $('#m-ok', box).disabled = true; $('#m-ok', box).textContent = 'Importando…';
          try {
            const n = await DB.importAlumnos(S.nivel, filas);
            await DB.log({ nivel: S.nivel, accion: 'importar_lista', taller_nuevo: `${n} alumnos` });
            close(); toast(`${n} alumnos nuevos importados (${filas.length - n} ya estaban)`, 'ok');
            cargar();
          } catch (e) { toast('Error: ' + e.message, 'error'); $('#m-ok', box).disabled = false; $('#m-ok', box).textContent = 'Importar'; }
        };
      });
  }

  function interpretarLista(text) {
    const rows = CSV.parse(text);
    if (rows.length < 2) return { error: 'Necesito un encabezado y al menos una fila.', ok: [], malos: [] };
    const h = rows[0].map(norm);
    const iC = h.findIndex(x => /curso|sala|grado|ano|division/.test(x));
    const iA = h.findIndex(x => x.includes('apellido'));
    const iN = h.findIndex(x => x.includes('nombre') && !x.includes('apellido'));
    if (iC < 0 || iA < 0 || iN < 0) return { error: 'No encuentro las columnas curso, apellido y nombre en el encabezado.', ok: [], malos: [] };
    const porNorm = Object.fromEntries(N().cursos.map(c => [norm(c).replace(/[°º]/g, ''), c]));
    const ok = [], malos = [];
    rows.slice(1).forEach(r => {
      const raw = r[iC] || '';
      const curso = porNorm[norm(raw).replace(/[°º]/g, '')];
      const item = { curso: curso || raw, apellido: (r[iA] || '').trim(), nombre: (r[iN] || '').trim() };
      if (!item.apellido || !item.nombre) return;
      (curso ? ok : malos).push(item);
    });
    return { ok, malos };
  }

  // ---------- Exportar ----------
  const stamp = () => new Date().toISOString().slice(0, 10);
  function exportarPorAlumno() {
    const rows = [['Curso', 'Apellido', 'Nombre', ...DIAS]];
    S.alumnos.forEach(a => rows.push([a.curso, a.apellido, a.nombre, ...DIAS.map((_, d) => ((S.asig[a.id] || {})[d] || {}).taller || '')]));
    CSV.download(`talleres_${S.nivel}_${CFG.cicloLectivo}_por_alumno_${stamp()}.csv`, rows);
  }
  function exportarPorTaller() {
    const rows = [['Día', 'Taller', 'Curso', 'Apellido', 'Nombre']];
    const out = [];
    S.alumnos.forEach(a => Object.values(S.asig[a.id] || {}).forEach(x => out.push([x.dia, x.taller, a])));
    out.sort((p, q) => p[0] - q[0] || p[1].localeCompare(q[1]) || cursoIdx(p[2].curso) - cursoIdx(q[2].curso) || norm(p[2].apellido).localeCompare(norm(q[2].apellido)));
    out.forEach(([d, t, a]) => rows.push([DIAS[d], t, a.curso, a.apellido, a.nombre]));
    CSV.download(`talleres_${S.nivel}_${CFG.cicloLectivo}_por_taller_${stamp()}.csv`, rows);
  }
  function exportarInscripciones() {
    const rows = [['Fecha', 'Estado', 'Curso', 'Apellido', 'Nombre', ...DIAS, 'Responsable', 'Email', 'Teléfono', 'Observaciones']];
    S.inscripciones.forEach(i => rows.push([i.created_at.slice(0, 16).replace('T', ' '), i.estado, i.curso, i.apellido, i.nombre,
      ...DIAS.map((_, d) => (i.talleres || {})[d] || ''), i.responsable, i.email, i.telefono, i.observaciones]));
    CSV.download(`inscripciones_${S.nivel}_${CFG.cicloLectivo}_${stamp()}.csv`, rows);
  }

  // ============================================================
  //  VISTA INSCRIPCIONES (lo que llega del formulario)
  // ============================================================
  function buscarAlumno(ins) {
    const ape = norm(ins.apellido), nom = norm(ins.nombre), first = nom.split(' ')[0];
    const exact = S.alumnos.filter(a => norm(a.apellido) === ape && norm(a.nombre) === nom);
    const enCurso = exact.filter(a => a.curso === ins.curso);
    if (enCurso.length === 1) return { alumno: enCurso[0], tipo: 'exacto' };
    if (exact.length === 1) return { alumno: exact[0], tipo: 'otro_curso' };
    const aprox = S.alumnos.filter(a => a.curso === ins.curso && norm(a.apellido) === ape &&
      (norm(a.nombre).split(' ')[0] === first || norm(a.nombre).includes(nom) || nom.includes(norm(a.nombre))));
    if (aprox.length === 1) return { alumno: aprox[0], tipo: 'aproximado' };
    return null;
  }

  function vistaInscripciones() {
    const main = $('#main');
    const cuenta = e => S.inscripciones.filter(i => !e || i.estado === e).length;
    main.innerHTML = filtrosHTML(`<select class="input" id="f-ins">
        ${[['pendiente', 'Pendientes'], ['vinculada', 'Vinculadas'], ['descartada', 'Descartadas'], ['', 'Todas']].map(([v, l]) =>
          `<option value="${v}" ${S.fInscr === v ? 'selected' : ''}>${l} (${cuenta(v)})</option>`).join('')}</select>`) +
      `<div class="links-form">Formulario de ${esc(N().nombre)}: <a href="/${S.nivel}" target="_blank">/${S.nivel}</a></div><div id="ins-lista"></div>`;
    $('#f-q').oninput = e => { S.q = e.target.value; pintarInscripciones(); };
    $('#f-curso').onchange = e => { S.fCurso = e.target.value; pintarInscripciones(); };
    $('#f-ins').onchange = e => { S.fInscr = e.target.value; pintarInscripciones(); };
    pintarInscripciones();
  }

  function pintarInscripciones() {
    const q = norm(S.q);
    const fil = S.inscripciones.filter(i => (!S.fInscr || i.estado === S.fInscr) && (!S.fCurso || i.curso === S.fCurso) &&
      (!q || norm(i.nombre + ' ' + i.apellido + ' ' + i.apellido + ' ' + i.responsable).includes(q)));
    $('#f-count').textContent = `${fil.length} inscripción${fil.length !== 1 ? 'es' : ''}`;
    const box = $('#ins-lista');
    if (!fil.length) { box.innerHTML = `<div class="empty small">${S.inscripciones.length ? 'No hay inscripciones con ese filtro.' : 'Todavía no llegó ninguna inscripción del formulario.'}</div>`; return; }
    box.innerHTML = '';
    fil.forEach(i => box.appendChild(tarjetaInscripcion(i)));
  }

  function tarjetaInscripcion(i) {
    const el = document.createElement('div');
    el.className = 'ins ' + i.estado;
    const m = i.estado === 'pendiente' ? buscarAlumno(i) : null;
    const vinc = i.alumno_id && alumnoById(i.alumno_id);
    const pills = DIAS.map((dia, d) => (i.talleres || {})[d]
      ? `<span class="pill sm d${d}"><b>${dia.slice(0, 3)}</b> ${esc(i.talleres[d])}</span>` : '').join('');
    let accion = '';
    if (i.estado === 'pendiente') {
      const candidatos = S.alumnos.filter(a => a.curso === i.curso);
      if (m && !candidatos.includes(m.alumno)) candidatos.unshift(m.alumno);
      const badge = m ? { exacto: '<span class="b ok">Coincide con la lista</span>', aproximado: '<span class="b warn">Coincidencia parcial</span>', otro_curso: `<span class="b warn">Está en ${esc(m.alumno.curso)}</span>` }[m.tipo]
        : '<span class="b bad">No está en la lista</span>';
      accion = `<div class="ins-acc">${badge}
        <select class="input sel-al"><option value="">— Elegir alumno de la lista —</option>
          ${candidatos.map(a => `<option value="${a.id}" ${m && m.alumno.id === a.id ? 'selected' : ''}>${esc(nombreAl(a))} · ${esc(a.curso)}</option>`).join('')}</select>
        <button class="btn btn-sm btn-primary b-vinc">Vincular y asignar</button>
        ${m ? '' : '<button class="btn btn-sm b-crear">Crear alumno</button>'}
        <button class="btn btn-sm b-desc" title="Descartar">Descartar</button></div>`;
    } else if (i.estado === 'vinculada') {
      accion = `<div class="ins-acc"><span class="b ok">Vinculada${vinc ? ' a ' + esc(nombreAl(vinc)) + ' · ' + esc(vinc.curso) : ''}</span></div>`;
    } else {
      accion = `<div class="ins-acc"><span class="b">Descartada</span><button class="btn btn-sm b-rest">Restaurar</button></div>`;
    }
    el.innerHTML = `<div class="ins-top"><div><div class="ins-nom">${esc(i.apellido)}, ${esc(i.nombre)} <span class="tag">${esc(i.curso)}</span></div>
      <div class="ins-meta">${esc(new Date(i.created_at).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' }))} · ${esc(i.responsable || '')} ${i.email ? '· ' + esc(i.email) : ''} ${i.telefono ? '· ' + esc(i.telefono) : ''}</div>
      ${i.observaciones ? `<div class="ins-obs">“${esc(i.observaciones)}”</div>` : ''}</div>
      <div class="ins-pills">${pills}</div></div>${accion}`;
    const sel = el.querySelector('.sel-al');
    el.querySelector('.b-vinc')?.addEventListener('click', async () => {
      const a = alumnoById(sel.value);
      if (!a) { toast('Elegí un alumno de la lista', 'error'); return; }
      const r = await aplicarInscripcion(i, a);
      toast(`Vinculada · ${r.ok} taller${r.ok !== 1 ? 'es' : ''} asignado${r.ok !== 1 ? 's' : ''}${r.fuera.length ? ` · ${r.fuera.length} fuera de grilla` : ''}`, r.fuera.length ? '' : 'ok');
      await cargar();
    });
    el.querySelector('.b-crear')?.addEventListener('click', () =>
      modalAlumno({ apellido: i.apellido, nombre: i.nombre, curso: i.curso }, async (al) => {
        S.alumnos.push(al); await aplicarInscripcion(i, al); await cargar();
      }));
    el.querySelector('.b-desc')?.addEventListener('click', async () => {
      await DB.updateInscripcion(i.id, { estado: 'descartada' }); i.estado = 'descartada';
      renderContadores(); pintarInscripciones();
    });
    el.querySelector('.b-rest')?.addEventListener('click', async () => {
      await DB.updateInscripcion(i.id, { estado: 'pendiente' }); i.estado = 'pendiente';
      renderContadores(); pintarInscripciones();
    });
    return el;
  }

  // Escribe los talleres de una inscripción sobre el alumno de la lista.
  // Se valida contra la grilla del curso REAL del alumno.
  async function aplicarInscripcion(ins, a) {
    let ok = 0; const fuera = [];
    for (const [dk, taller] of Object.entries(ins.talleres || {})) {
      const d = +dk;
      if (!window.talleresPosibles(S.nivel, a.curso, d).includes(taller)) { fuera.push(`${DIAS[d]}: ${taller}`); continue; }
      const prev = ((S.asig[a.id] || {})[d] || {}).taller || null;
      await DB.setAsignacion(a.id, d, taller, 'formulario', ins.id);
      (S.asig[a.id] ||= {})[d] = { alumno_id: a.id, dia: d, taller, origen: 'formulario' };
      if (prev !== taller) await DB.log({ nivel: S.nivel, alumno_id: a.id, alumno: nombreAl(a), accion: prev ? 'cambiar' : 'asignar', dia: d, taller_anterior: prev, taller_nuevo: taller + ' (formulario)' });
      ok++;
    }
    await DB.updateInscripcion(ins.id, { estado: 'vinculada', alumno_id: a.id });
    await DB.log({ nivel: S.nivel, alumno_id: a.id, alumno: nombreAl(a), accion: 'vincular', taller_nuevo: fuera.length ? 'Fuera de grilla: ' + fuera.join(', ') : null });
    ins.estado = 'vinculada'; ins.alumno_id = a.id;
    return { ok, fuera };
  }

  async function procesarTodas() {
    const pend = S.inscripciones.filter(i => i.estado === 'pendiente')
      .sort((a, b) => a.created_at.localeCompare(b.created_at)); // la más nueva queda última y manda
    const auto = pend.map(i => [i, buscarAlumno(i)]).filter(([, m]) => m && m.tipo === 'exacto');
    if (!auto.length) { toast('No hay inscripciones pendientes que coincidan exacto con la lista', ''); return; }
    if (!await confirmar('Vincular automáticamente', `Se van a vincular <b>${auto.length}</b> inscripciones que coinciden exacto (apellido, nombre y curso) con la lista y se asignan sus talleres. Las otras <b>${pend.length - auto.length}</b> quedan pendientes para revisar a mano.`, 'Vincular')) return;
    spin(true, 'Vinculando inscripciones…');
    let n = 0, fuera = 0;
    for (const [i, m] of auto) { const r = await aplicarInscripcion(i, m.alumno); n++; fuera += r.fuera.length; }
    spin(false);
    toast(`${n} inscripciones vinculadas${fuera ? ` · ${fuera} talleres fuera de grilla (ver historial)` : ''}`, 'ok');
    await cargar();
  }

  // ============================================================
  //  VISTA RESUMEN (cantidad de inscriptos por taller y día)
  // ============================================================
  function vistaResumen() {
    const N0 = N();
    const html = Object.entries(N0.grupos).map(([g, label]) => {
      const cursos = N0.cursos.filter(c => N0.grupoDeCurso(c) === g);
      const als = S.alumnos.filter(a => cursos.includes(a.curso));
      const talleres = [...new Set(N0.grilla[g].flat())].sort((a, b) => a.localeCompare(b));
      const cnt = {}; let fuera = 0;
      als.forEach(a => Object.values(S.asig[a.id] || {}).forEach(x => {
        if (!N0.grilla[g][x.dia].includes(x.taller)) { fuera++; return; }
        cnt[x.taller + '|' + x.dia] = (cnt[x.taller + '|' + x.dia] || 0) + 1;
      }));
      const sin = als.filter(a => !Object.keys(S.asig[a.id] || {}).length).length;
      return `<div class="res-card"><h3>${esc(label)} <span>${als.length} alumnos · ${sin} sin talleres${fuera ? ` · ${fuera} fuera de grilla` : ''}</span></h3>
        <table class="res"><thead><tr><th>Taller</th>${DIAS.map((d, i) => `<th class="d${i}">${d}</th>`).join('')}<th>Total</th></tr></thead><tbody>
        ${talleres.map(t => {
          let tot = 0;
          const tds = DIAS.map((_, d) => {
            if (!N0.grilla[g][d].includes(t)) return '<td class="na">·</td>';
            const v = cnt[t + '|' + d] || 0; tot += v;
            return `<td class="${v ? '' : 'z'}">${v}</td>`;
          }).join('');
          return `<tr><td class="tn">${esc(t)}</td>${tds}<td class="tot">${tot}</td></tr>`;
        }).join('')}</tbody></table></div>`;
    }).join('');
    $('#main').innerHTML = `<div class="res-wrap">${html}</div>`;
  }

  // ============================================================
  //  VISTA HISTORIAL
  // ============================================================
  function vistaHistorial() {
    const lbl = { asignar: 'Asignó', cambiar: 'Cambió', eliminar: 'Quitó', vincular: 'Vinculó inscripción', alta_alumno: 'Agregó alumno', baja_alumno: 'Quitó alumno', importar_lista: 'Importó lista' };
    $('#main').innerHTML = !S.historial.length ? `<div class="empty small">Sin movimientos todavía.</div>` :
      `<div class="hist"><table><thead><tr><th>Fecha</th><th>Acción</th><th>Alumno</th><th>Día</th><th>Detalle</th><th>Usuario</th></tr></thead><tbody>
      ${S.historial.map(h => `<tr><td class="mono">${esc(new Date(h.created_at).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' }))}</td>
        <td><span class="act ${h.accion}">${esc(lbl[h.accion] || h.accion)}</span></td><td>${esc(h.alumno || '')}</td>
        <td>${h.dia != null ? DIAS[h.dia] : ''}</td>
        <td>${h.taller_anterior ? `<s>${esc(h.taller_anterior)}</s> ` : ''}${h.taller_anterior && h.taller_nuevo ? '→ ' : ''}${esc(h.taller_nuevo || '')}</td>
        <td class="mono">${esc(h.usuario || '')}</td></tr>`).join('')}</tbody></table></div>`;
  }

  // ============================================================
  //  MODO DEMO: datos de prueba
  // ============================================================
  async function cargarDemo() {
    spin(true, 'Cargando lista de prueba…');
    try {
      const txt = await (await fetch(`/data/alumnos_${S.nivel}_${CFG.cicloLectivo}.csv`)).text();
      const { ok } = interpretarLista(txt);
      await DB.importAlumnos(S.nivel, ok);
      // Simula que ~40% de las familias completó el formulario
      const pick = arr => arr[Math.floor(Math.random() * arr.length)];
      const muestra = ok.filter(() => Math.random() < 0.4);
      for (const [k, r] of muestra.entries()) {
        const talleres = {};
        DIAS.forEach((_, d) => { const o = window.talleresPosibles(S.nivel, r.curso, d); if (o.length && Math.random() < 0.45) talleres[d] = pick(o); });
        if (!Object.keys(talleres).length) { const d = DIAS.findIndex((_, d) => window.talleresPosibles(S.nivel, r.curso, d).length); talleres[d] = window.talleresPosibles(S.nivel, r.curso, d)[0]; }
        let { apellido, nombre } = r;
        if (k % 17 === 3) nombre = nombre.split(' ')[0];              // escribió un solo nombre
        if (k % 23 === 5) apellido = apellido.toUpperCase();          // en mayúsculas
        if (k % 29 === 7) nombre = nombre.normalize('NFD').replace(/[̀-ͯ]/g, ''); // sin tildes
        await DB.insertInscripcion({ nivel: S.nivel, curso: r.curso, apellido, nombre, talleres,
          responsable: 'Familia ' + r.apellido, email: norm(r.apellido).replace(/ /g, '') + '@mail.com', telefono: '11 ' + (40000000 + k * 7919 % 9999999), observaciones: k % 13 === 0 ? 'Retira la abuela los martes.' : null });
      }
      // Dos inscripciones de chicos que NO están en la lista
      for (const x of [['Lombardi', 'Ciro'], ['Etchegaray', 'Uma']])
        await DB.insertInscripcion({ nivel: S.nivel, curso: N().cursos[1], apellido: x[0], nombre: x[1], talleres: { 4: window.talleresPosibles(S.nivel, N().cursos[1], 4)[0] }, responsable: 'Familia ' + x[0], email: x[0].toLowerCase() + '@mail.com', telefono: '11 5555-0000', observaciones: 'Alumno/a nuevo/a 2027' });
      toast(`Lista de prueba (${ok.length}) + ${muestra.length + 2} inscripciones simuladas`, 'ok');
    } catch (e) { toast('Error: ' + e.message, 'error'); }
    spin(false);
    await cargar();
  }

  async function resetDemo() {
    if (!await confirmar('Reiniciar demo', `Se borran alumnos, inscripciones e historial de <b>${esc(N().nombre)}</b> guardados en este navegador.`, 'Reiniciar')) return;
    await DB.resetNivel(S.nivel); toast('Demo reiniciada', 'ok'); cargar();
  }

  // ============================================================
  //  ARRANQUE
  // ============================================================
  (async function start() {
    $('#t-anio').textContent = CFG.cicloLectivo; $('#l-anio').textContent = CFG.cicloLectivo;
    if (!CFG.niveles[S.nivel]) S.nivel = 'primaria';
    try { await DB.init(); } catch (e) { spin(false); toast(e.message, 'error'); return; }
    if (DB.modo === 'demo') $('#demo').hidden = false;
    const u = await DB.getUser();
    if (!u) {
      spin(false); $('#login').hidden = false;
      $('#btn-login').onclick = () => DB.signIn();
      return;
    }
    if (DB.modo !== 'demo') {
      if (!/@sancarlos\.edu\.ar$/i.test(u.email || '')) {
        spin(false); $('#login').hidden = false;
        $('#login-err').textContent = `La cuenta ${u.email} no tiene acceso.`;
        $('#btn-login').textContent = 'Usar otra cuenta'; $('#btn-login').onclick = () => DB.signOut();
        return;
      }
      $('#user').textContent = u.email; $('#salir').hidden = false; $('#salir').onclick = () => DB.signOut();
    }
    renderNav(); cargar();
  })();
})();
