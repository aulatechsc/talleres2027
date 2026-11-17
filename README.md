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

## Formularios
La familia elige el curso y busca al alumno/a por apellido (mínimo 3 letras, hasta 10 resultados: no se puede bajar la lista completa). Si no aparece, puede cargarlo a mano y queda para revisar.

## Facturación mensual
- Precios por nivel: 1 taller / 2 talleres / 3 o más. Un taller que va 2 días cuenta 1.
- Talleres que se cobran aparte (Primaria: Fútbol) por 1 o 2 veces por semana (`facturacion.aparte` en `config/talleres.js`).
- El mes abierto es un **borrador** que se actualiza solo. **Cerrar mes** guarda la foto (no cambia más), descarga el CSV para Administración y aplica los cambios programados.

## Cambios a fin de mes
En **Alumnos**, cada fila tiene «Programar desde …»: abre la semana del alumno con «Ahora» y «Desde el mes siguiente» lado a lado. Lo que cambies queda en borrador (recuadro rojo punteado en la grilla) sin tocar la facturación del mes en curso. Se aplican al cerrar el mes; se pueden cancelar desde la grilla o desde Facturación.

## Acceso al panel
Link por email, solo para los emails cargados en la tabla `staff`:
```sql
insert into public.staff (email) values ('alguien@sancarlos.edu.ar');
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
2. **Login**: Authentication → URL Configuration → Site URL y Redirect URLs = `https://talleres2027.vercel.app/panel`. Cargar los emails del equipo en `staff`.
3. Completar `js/supabase-config.js` con Project URL y anon key (Settings → API). La anon key es pública por diseño: la seguridad la dan las políticas RLS (el público solo puede *insertar* inscripciones; el panel exige un email de la tabla `staff`).
4. Subir a GitHub e importar el repo en Vercel (Framework: *Other*, sin build).

## Para 2028
Copiar el repo, cambiar `cicloLectivo`, cursos y grilla en `config/talleres.js`. Las tablas ya separan por `ciclo_lectivo`.
