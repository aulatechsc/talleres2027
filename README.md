# Talleres 2027 — Inscripción y gestión

Sitio estático (HTML + JS, sin build) para Vercel, con datos en Supabase.
Sin Supabase configurado funciona en **modo demo** (los datos quedan en el navegador).

## Páginas
| URL | Qué es |
|---|---|
| `/` | Elegir nivel |
| `/inicial` · `/primaria` · `/secundaria` | Formularios de inscripción (mismo motor `js/form.js`) |
| `/panel` | Panel de gestión con pestañas Inicial / Primario / Secundario |

## Estructura
```
config/talleres.js     ← lo único a editar cada año: cursos + grilla por día
js/supabase-config.js  ← URL y anon key de Supabase (vacío = modo demo)
js/db.js               ← capa de datos (Supabase o demo, misma interfaz)
js/form.js             ← formulario
js/panel.js            ← panel
js/csv.js              ← importar/exportar CSV (Excel)
supabase/schema.sql    ← tablas + seguridad
data/*.csv             ← listas de prueba
```

## Flujo
1. **Panel → Alumnos → Importar lista**: CSV o pegado desde Sheets con columnas `curso, apellido, nombre`.
2. Las familias completan el formulario del nivel.
3. **Panel → Inscripciones → Vincular automáticamente**: une las que coinciden exacto con la lista y asigna los talleres. Las demás (nombre incompleto, alumno nuevo, otro curso) se vinculan a mano o con «Crear alumno».
4. **Alumnos**: asignar con el desplegable, clic en el taller para cambiarlo, × para quitarlo. El punto (•) marca lo que vino del formulario.
5. **Exportar** por alumno o por taller (CSV para Excel). **Resumen** = cantidad de chicos por taller y día. **Historial** = cada cambio.

## Probar localmente
```bash
npx serve .
```
Abrir `/panel` → «Datos de prueba» (carga la lista random + inscripciones simuladas).

## Publicar
1. **Supabase**: proyecto nuevo → SQL Editor → pegar `supabase/schema.sql` → Run.
2. **Login**: Authentication → Providers → Google (Client ID/Secret de Google Cloud). En URL Configuration agregar la URL de Vercel.
3. Completar `js/supabase-config.js` con Project URL y anon key (Settings → API). La anon key es pública por diseño: la seguridad la dan las políticas RLS (el público solo puede *insertar* inscripciones; el panel exige cuenta `@sancarlos.edu.ar`).
4. Subir a GitHub e importar el repo en Vercel (Framework: *Other*, sin build).

## Para 2028
Copiar el repo, cambiar `cicloLectivo`, cursos y grilla en `config/talleres.js`. Las tablas ya separan por `ciclo_lectivo`.
