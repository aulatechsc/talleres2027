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

  // ----------------------------------------------------------
  //  MODO DEMO (localStorage)
  // ----------------------------------------------------------
  function demoAdapter() {
    const KEY = 'talleres_demo_' + CICLO;
    const load = () => {
      try { return JSON.parse(localStorage.getItem(KEY)) || null; } catch { return null; }
    };
    let st = load() || { alumnos: [], inscripciones: [], asignaciones: [], historial: [] };
    const save = () => { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch {} };
    const refresh = () => { st = load() || st; };
    const keyAl = a => [a.nivel, a.curso, a.apellido, a.nombre].join('|').toLowerCase();

    return {
      modo: 'demo',
      async init() {},
      async getUser() { return { email: 'demo@sancarlos.edu.ar' }; },
      async signIn() {}, async signOut() {},

      async listAlumnos(nivel) { refresh(); return st.alumnos.filter(a => a.nivel === nivel); },
      async listAsignaciones(nivel) {
        refresh();
        const ids = new Set(st.alumnos.filter(a => a.nivel === nivel).map(a => a.id));
        return st.asignaciones.filter(x => ids.has(x.alumno_id));
      },
      async listInscripciones(nivel) {
        refresh();
        return st.inscripciones.filter(i => i.nivel === nivel)
          .sort((a, b) => b.created_at.localeCompare(a.created_at));
      },
      async listHistorial(nivel) {
        refresh();
        return st.historial.filter(h => h.nivel === nivel)
          .sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 500);
      },
      async importAlumnos(nivel, rows) {
        refresh();
        const existing = new Set(st.alumnos.map(keyAl));
        let n = 0;
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
      async insertInscripcion(data) {
        refresh();
        st.inscripciones.push({ id: uuid(), ciclo_lectivo: CICLO, estado: 'pendiente', alumno_id: null, created_at: now(), ...data });
        save();
      },
      async updateInscripcion(id, patch) {
        refresh();
        const i = st.inscripciones.find(x => x.id === id);
        if (i) Object.assign(i, patch);
        save();
      },
      async log(e) {
        refresh();
        st.historial.push({ id: uuid(), created_at: now(), usuario: 'demo', ...e });
        save();
      },
      async resetNivel(nivel) {
        refresh();
        const ids = new Set(st.alumnos.filter(a => a.nivel === nivel).map(a => a.id));
        st.alumnos = st.alumnos.filter(a => a.nivel !== nivel);
        st.asignaciones = st.asignaciones.filter(x => !ids.has(x.alumno_id));
        st.inscripciones = st.inscripciones.filter(i => i.nivel !== nivel);
        st.historial = st.historial.filter(h => h.nivel !== nivel);
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
      async signIn() {
        await sb.auth.signInWithOAuth({
          provider: 'google',
          options: { redirectTo: location.href.split('#')[0], queryParams: { hd: 'sancarlos.edu.ar' } }
        });
      },
      async signOut() { await sb.auth.signOut(); location.reload(); },

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
      async insertInscripcion(data) {
        chk(await sb.from('inscripciones').insert({ ciclo_lectivo: CICLO, ...data }));
      },
      async updateInscripcion(id, patch) {
        chk(await sb.from('inscripciones').update(patch).eq('id', id));
      },
      async log(e) {
        await sb.from('historial').insert({ usuario: user ? user.email : null, ...e });
      },
      async resetNivel() { throw new Error('Solo disponible en modo demo'); }
    };
  }

  window.DB = hasSupabase ? supabaseAdapter() : demoAdapter();
})();
