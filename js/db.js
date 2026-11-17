// ============================================================
//  Capa de datos — misma interfaz para Supabase y Modo Demo
// ============================================================
(function () {
  const CICLO = window.TALLERES_CONFIG.cicloLectivo;
  const hasSupabase = !!(window.SUPABASE_URL && window.SUPABASE_ANON_KEY);

  const uuid = () =>
    (crypto.randomUUID ? crypto.randomUUID() :
      'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16);
      }));
  const now = () => new Date().toISOString();
  const norm = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

  // ----------------------------------------------------------
  //  MODO DEMO (localStorage)
  // ----------------------------------------------------------
  function demoAdapter() {
    const KEY = 'talleres_demo_' + CICLO;
    const vacio = () => ({ alumnos: [], inscripciones: [], asignaciones: [], historial: [], cambios: [], liquidaciones: [], precios: {} });
    const load = () => { try { return Object.assign(vacio(), JSON.parse(localStorage.getItem(KEY)) || {}); } catch { return vacio(); } };
    let st = load();
    const save = () => { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch {} };
    const refresh = () => { st = load(); };
    const keyAl = a => [a.nivel, a.curso, a.apellido, a.nombre].join('|').toLowerCase();
    const idsNivel = nivel => new Set(st.alumnos.filter(a => a.nivel === nivel).map(a => a.id));

    return {
      modo: 'demo',
      async init() {},
      async getUser() { return { email: 'demo@sancarlos.edu.ar' }; },
      async esStaff() { return true; },
      async signIn() {}, async signOut() {},

      // ---- público (formulario) ----
      async buscarAlumnos(nivel, curso, texto) {
        refresh();
        const t = norm(texto);
        if (t.length < 3) return [];
        return st.alumnos.filter(a => a.nivel === nivel && a.curso === curso &&
          (norm(a.apellido).includes(t) || norm(a.nombre + ' ' + a.apellido).includes(t)))
          .slice(0, 10).map(({ id, apellido, nombre }) => ({ id, apellido, nombre }));
      },
      async insertInscripcion(data) {
        refresh();
        st.inscripciones.push({ id: uuid(), ciclo_lectivo: CICLO, estado: 'pendiente', alumno_id: null, created_at: now(), ...data });
        save();
      },

      // ---- panel ----
      async listAlumnos(nivel) { refresh(); return st.alumnos.filter(a => a.nivel === nivel); },
      async listAsignaciones(nivel) { refresh(); const ids = idsNivel(nivel); return st.asignaciones.filter(x => ids.has(x.alumno_id)); },
      async listInscripciones(nivel) {
        refresh();
        return st.inscripciones.filter(i => i.nivel === nivel).sort((a, b) => b.created_at.localeCompare(a.created_at));
      },
      async listHistorial(nivel) {
        refresh();
        return st.historial.filter(h => h.nivel === nivel).sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 500);
      },
      async importAlumnos(nivel, rows) {
        refresh();
        const existing = new Set(st.alumnos.map(keyAl)); let n = 0;
        rows.forEach(r => {
          const a = { id: uuid(), ciclo_lectivo: CICLO, nivel, ...r, created_at: now() };
          if (!existing.has(keyAl(a))) { st.alumnos.push(a); existing.add(keyAl(a)); n++; }
        });
        save(); return n;
      },
      async addAlumno(nivel, r) {
        refresh();
        const a = { id: uuid(), ciclo_lectivo: CICLO, nivel, ...r, created_at: now() };
        if (st.alumnos.some(x => keyAl(x) === keyAl(a))) throw new Error('Ese alumno ya existe en ese curso.');
        st.alumnos.push(a); save(); return a;
      },
      async deleteAlumno(id) {
        refresh();
        st.alumnos = st.alumnos.filter(a => a.id !== id);
        st.asignaciones = st.asignaciones.filter(x => x.alumno_id !== id);
        st.cambios = st.cambios.filter(c => c.alumno_id !== id);
        st.inscripciones.forEach(i => { if (i.alumno_id === id) { i.alumno_id = null; i.estado = 'pendiente'; } });
        save();
      },
      async setAsignacion(alumno_id, dia, taller, origen = 'panel', inscripcion_id = null) {
        refresh();
        const ex = st.asignaciones.find(x => x.alumno_id === alumno_id && x.dia === dia);
        if (ex) Object.assign(ex, { taller, origen, inscripcion_id, updated_at: now() });
        else st.asignaciones.push({ id: uuid(), alumno_id, dia, taller, origen, inscripcion_id, updated_at: now() });
        save();
      },
      async deleteAsignacion(alumno_id, dia) {
        refresh();
        st.asignaciones = st.asignaciones.filter(x => !(x.alumno_id === alumno_id && x.dia === dia));
        save();
      },
      async updateInscripcion(id, patch) {
        refresh(); const i = st.inscripciones.find(x => x.id === id); if (i) Object.assign(i, patch); save();
      },
      async log(e) { refresh(); st.historial.push({ id: uuid(), created_at: now(), usuario: 'demo', ...e }); save(); },

      // ---- cambios programados ----
      async listCambios(nivel) { refresh(); return st.cambios.filter(c => c.nivel === nivel && c.estado === 'pendiente'); },
      async addCambio(c) {
        refresh();
        // un solo cambio pendiente por alumno/día/mes: el nuevo reemplaza al anterior
        st.cambios = st.cambios.filter(x => !(x.estado === 'pendiente' && x.alumno_id === c.alumno_id && x.dia === c.dia && x.mes_aplica === c.mes_aplica));
        const row = { id: uuid(), estado: 'pendiente', created_at: now(), usuario: 'demo', ...c };
        st.cambios.push(row); save(); return row;
      },
      async updateCambio(id, patch) { refresh(); const c = st.cambios.find(x => x.id === id); if (c) Object.assign(c, patch); save(); },

      // ---- facturación ----
      async getPrecios(nivel) { refresh(); return st.precios[nivel] || null; },
      async setPrecios(nivel, p) { refresh(); st.precios[nivel] = p; save(); },
      async listLiquidaciones(nivel) { refresh(); return st.liquidaciones.filter(l => l.nivel === nivel); },
      async saveLiquidacion(l) {
        refresh();
        if (st.liquidaciones.some(x => x.nivel === l.nivel && x.mes === l.mes)) throw new Error('Ese mes ya está cerrado.');
        st.liquidaciones.push({ id: uuid(), cerrada_at: now(), usuario: 'demo', ...l }); save();
      },
      async deleteLiquidacion(nivel, mes) {
        refresh(); st.liquidaciones = st.liquidaciones.filter(x => !(x.nivel === nivel && x.mes === mes)); save();
      },

      async resetNivel(nivel) {
        refresh();
        const ids = idsNivel(nivel);
        st.alumnos = st.alumnos.filter(a => a.nivel !== nivel);
        st.asignaciones = st.asignaciones.filter(x => !ids.has(x.alumno_id));
        st.inscripciones = st.inscripciones.filter(i => i.nivel !== nivel);
        st.historial = st.historial.filter(h => h.nivel !== nivel);
        st.cambios = st.cambios.filter(c => c.nivel !== nivel);
        st.liquidaciones = st.liquidaciones.filter(l => l.nivel !== nivel);
        delete st.precios[nivel];
        save();
      }
    };
  }

  // ----------------------------------------------------------
  //  SUPABASE
  // ----------------------------------------------------------
  function supabaseAdapter() {
    let sb = null, user = null;

    const loadLib = () => new Promise((res, rej) => {
      if (window.supabase) return res();
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
      s.onload = res; s.onerror = () => rej(new Error('No se pudo cargar Supabase'));
      document.head.appendChild(s);
    });
    const chk = ({ data, error }) => { if (error) throw new Error(error.message); return data; };

    // Supabase devuelve como máximo 1000 filas por consulta → paginamos
    async function fetchAll(build) {
      const out = []; const step = 1000;
      for (let from = 0; ; from += step) {
        const rows = chk(await build().range(from, from + step - 1));
        out.push(...rows);
        if (rows.length < step) break;
      }
      return out;
    }

    return {
      modo: 'supabase',
      async init() {
        await loadLib();
        sb = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
        const { data } = await sb.auth.getSession();
        user = data.session ? data.session.user : null;
      },
      async getUser() { return user; },
      async esStaff() { const { data } = await sb.rpc('es_staff'); return !!data; },
      // Acceso al panel con link mágico por email (solo emails cargados en la tabla staff)
      async signIn(email) {
        chk(await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: location.href.split('#')[0], shouldCreateUser: true } }));
      },
      async signOut() { await sb.auth.signOut(); location.reload(); },

      // ---- público (formulario) ----
      async buscarAlumnos(nivel, curso, texto) {
        if (String(texto).trim().length < 3) return [];
        return chk(await sb.rpc('buscar_alumnos', { p_nivel: nivel, p_curso: curso, p_texto: texto }));
      },
      async insertInscripcion(data) { chk(await sb.from('inscripciones').insert({ ciclo_lectivo: CICLO, ...data })); },

      // ---- panel ----
      listAlumnos: (nivel) => fetchAll(() =>
        sb.from('alumnos').select('*').eq('ciclo_lectivo', CICLO).eq('nivel', nivel).order('id')),
      listAsignaciones: async (nivel) => {
        const rows = await fetchAll(() =>
          sb.from('asignaciones').select('*, alumnos!inner(nivel, ciclo_lectivo)')
            .eq('alumnos.nivel', nivel).eq('alumnos.ciclo_lectivo', CICLO).order('id'));
        return rows.map(({ alumnos, ...r }) => r);
      },
      listInscripciones: (nivel) => fetchAll(() =>
        sb.from('inscripciones').select('*').eq('ciclo_lectivo', CICLO).eq('nivel', nivel)
          .order('created_at', { ascending: false })),
      async listHistorial(nivel) {
        return chk(await sb.from('historial').select('*').eq('nivel', nivel)
          .order('created_at', { ascending: false }).limit(500));
      },
      async importAlumnos(nivel, rows) {
        let n = 0;
        for (let i = 0; i < rows.length; i += 500) {
          const chunk = rows.slice(i, i + 500).map(r => ({ ciclo_lectivo: CICLO, nivel, ...r }));
          const data = chk(await sb.from('alumnos')
            .upsert(chunk, { onConflict: 'ciclo_lectivo,nivel,curso,apellido,nombre', ignoreDuplicates: true })
            .select('id'));
          n += data.length;
        }
        return n;
      },
      async addAlumno(nivel, r) {
        const { data, error } = await sb.from('alumnos').insert({ ciclo_lectivo: CICLO, nivel, ...r }).select().single();
        if (error) throw new Error(error.code === '23505' ? 'Ese alumno ya existe en ese curso.' : error.message);
        return data;
      },
      async deleteAlumno(id) {
        chk(await sb.from('inscripciones').update({ alumno_id: null, estado: 'pendiente' }).eq('alumno_id', id));
        chk(await sb.from('alumnos').delete().eq('id', id));
      },
      async setAsignacion(alumno_id, dia, taller, origen = 'panel', inscripcion_id = null) {
        chk(await sb.from('asignaciones').upsert(
          { alumno_id, dia, taller, origen, inscripcion_id, updated_at: now() },
          { onConflict: 'alumno_id,dia' }));
      },
      async deleteAsignacion(alumno_id, dia) {
        chk(await sb.from('asignaciones').delete().eq('alumno_id', alumno_id).eq('dia', dia));
      },
      async updateInscripcion(id, patch) { chk(await sb.from('inscripciones').update(patch).eq('id', id)); },
      async log(e) { await sb.from('historial').insert({ usuario: user ? user.email : null, ...e }); },

      // ---- cambios programados ----
      listCambios: (nivel) => fetchAll(() =>
        sb.from('cambios_programados').select('*').eq('nivel', nivel).eq('estado', 'pendiente').order('created_at')),
      async addCambio(c) {
        chk(await sb.from('cambios_programados').delete()
          .eq('estado', 'pendiente').eq('alumno_id', c.alumno_id).eq('dia', c.dia).eq('mes_aplica', c.mes_aplica));
        return chk(await sb.from('cambios_programados').insert({ usuario: user ? user.email : null, ...c }).select().single());
      },
      async updateCambio(id, patch) { chk(await sb.from('cambios_programados').update(patch).eq('id', id)); },

      // ---- facturación ----
      async getPrecios(nivel) {
        const r = chk(await sb.from('precios').select('precios').eq('ciclo_lectivo', CICLO).eq('nivel', nivel).maybeSingle());
        return r ? r.precios : null;
      },
      async setPrecios(nivel, p) {
        chk(await sb.from('precios').upsert({ ciclo_lectivo: CICLO, nivel, precios: p, updated_at: now() }, { onConflict: 'ciclo_lectivo,nivel' }));
      },
      async listLiquidaciones(nivel) {
        return chk(await sb.from('liquidaciones').select('*').eq('ciclo_lectivo', CICLO).eq('nivel', nivel).order('mes'));
      },
      async saveLiquidacion(l) {
        const { error } = await sb.from('liquidaciones').insert({ ciclo_lectivo: CICLO, usuario: user ? user.email : null, ...l });
        if (error) throw new Error(error.code === '23505' ? 'Ese mes ya está cerrado.' : error.message);
      },
      async deleteLiquidacion(nivel, mes) {
        chk(await sb.from('liquidaciones').delete().eq('ciclo_lectivo', CICLO).eq('nivel', nivel).eq('mes', mes));
      },
      async resetNivel() { throw new Error('Solo disponible en modo demo'); }
    };
  }

  window.DB = hasSupabase ? supabaseAdapter() : demoAdapter();
})();
