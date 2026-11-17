// ============================================================
//  Formulario de inscripción — un motor para los 3 niveles
//  El nivel sale de <body data-nivel="...">
// ============================================================
(function () {
  const CFG = window.TALLERES_CONFIG;
  const NIVEL = document.body.dataset.nivel;
  const N = CFG.niveles[NIVEL];
  const DIAS = CFG.dias;
  const $ = (s, el = document) => el.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  document.title = `Inscripción Talleres ${CFG.cicloLectivo} — ${N.nombre}`;
  $('#t-nivel').textContent = N.nombre;
  $('#t-anio').textContent = CFG.cicloLectivo;
  if (DB.modo === 'demo') $('#demo').hidden = false;

  const selCurso = $('#curso');
  $('#lbl-curso').textContent = N.etiquetaCurso;
  selCurso.innerHTML = `<option value="">— Elegí ${N.etiquetaCurso.toLowerCase()} —</option>` +
    N.cursos.map(c => `<option>${esc(c)}</option>`).join('');

  const eleccion = {}; // diaIdx -> taller

  function renderDias() {
    const curso = selCurso.value;
    const box = $('#dias');
    if (!curso) {
      box.innerHTML = `<div class="hint">Elegí primero ${N.etiquetaCurso.toLowerCase()} para ver los talleres disponibles.</div>`;
      return;
    }
    box.innerHTML = '';
    DIAS.forEach((dia, d) => {
      const opts = window.talleresPosibles(NIVEL, curso, d);
      if (eleccion[d] && !opts.includes(eleccion[d])) delete eleccion[d];
      const card = document.createElement('div');
      card.className = `dia-card d${d}` + (opts.length ? '' : ' vacio');
      card.innerHTML = `<div class="dia-nombre">${dia}</div>` + (opts.length
        ? `<div class="opts">
             <label class="opt ninguno"><input type="radio" name="d${d}" value="" ${!eleccion[d] ? 'checked' : ''}><span>Ninguno</span></label>
             ${opts.map(t => `<label class="opt"><input type="radio" name="d${d}" value="${esc(t)}" ${eleccion[d] === t ? 'checked' : ''}><span>${esc(t)}</span></label>`).join('')}
           </div>`
        : `<div class="sin">Sin talleres este día</div>`);
      card.querySelectorAll('input').forEach(inp => inp.addEventListener('change', () => {
        if (inp.value) eleccion[d] = inp.value; else delete eleccion[d];
        resumen();
      }));
      box.appendChild(card);
    });
    resumen();
  }

  function resumen() {
    const n = Object.keys(eleccion).length;
    $('#resumen').textContent = n ? `${n} taller${n > 1 ? 'es' : ''} elegido${n > 1 ? 's' : ''}` : 'Ningún taller elegido todavía';
  }

  selCurso.addEventListener('change', renderDias);
  renderDias();

  function toast(msg, tipo = '') {
    const el = $('#toast'); el.textContent = msg; el.className = 'show ' + tipo;
    clearTimeout(toast.t); toast.t = setTimeout(() => el.className = '', 3000);
  }

  $('#form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const val = id => $('#' + id).value.trim();
    const data = {
      nivel: NIVEL,
      curso: selCurso.value,
      apellido: val('apellido'),
      nombre: val('nombre'),
      talleres: { ...eleccion },
      responsable: val('responsable'),
      email: val('email'),
      telefono: val('telefono'),
      observaciones: val('observaciones') || null
    };
    const err = [];
    if (!data.apellido || !data.nombre) err.push('Completá nombre y apellido del alumno/a.');
    if (!data.curso) err.push(`Elegí ${N.etiquetaCurso.toLowerCase()}.`);
    if (!Object.keys(data.talleres).length) err.push('Elegí al menos un taller.');
    if (!data.responsable || !data.email) err.push('Completá los datos del adulto responsable.');
    if (err.length) { toast(err[0], 'error'); return; }

    const btn = $('#enviar'); btn.disabled = true; btn.textContent = 'Enviando…';
    try {
      await DB.insertInscripcion(data);
      $('#form').hidden = true;
      $('#ok-detalle').innerHTML =
        `<strong>${esc(data.nombre)} ${esc(data.apellido)}</strong> · ${esc(data.curso)}<ul>` +
        Object.entries(data.talleres).sort().map(([d, t]) => `<li><b>${DIAS[d]}:</b> ${esc(t)}</li>`).join('') +
        `</ul>`;
      $('#ok').hidden = false;
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (ex) {
      toast('No se pudo enviar: ' + ex.message, 'error');
    } finally {
      btn.disabled = false; btn.textContent = 'Enviar inscripción';
    }
  });

  // Inscribir a otro hermano/a: conserva los datos del responsable
  $('#otra').addEventListener('click', () => {
    ['apellido', 'nombre', 'observaciones'].forEach(id => $('#' + id).value = '');
    selCurso.value = '';
    Object.keys(eleccion).forEach(k => delete eleccion[k]);
    renderDias();
    $('#ok').hidden = true; $('#form').hidden = false;
  });

  DB.init().catch(e => toast(e.message, 'error'));
})();
