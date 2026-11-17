// ============================================================
//  TALLERES — CONFIGURACIÓN DEL CICLO LECTIVO
//  Único archivo que hay que tocar cada año:
//  cursos, grupos (sala / ciclo) y grilla de talleres por día.
// ============================================================
window.TALLERES_CONFIG = {
  cicloLectivo: 2027,
  colegio: "Colegio San Carlos",

  dias: ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes"],

  // Meses que se facturan (1 = enero)
  mesesFacturables: [3, 4, 5, 6, 7, 8, 9, 10, 11, 12],

  niveles: {
    // ----------------------------------------------------------
    inicial: {
      nombre: "Nivel Inicial",
      etiquetaCurso: "Sala",
      // ⚠ Colores de sala 2027 a definir: reemplazar cuando estén.
      cursos: ["(3) Sala Roja", "(4) Sala Azul", "(5) Sala Verde"],
      // Cómo se deduce el grupo de grilla a partir del curso
      grupoDeCurso: (curso) => {
        const m = String(curso).match(/\((\d)\)/);
        return m ? m[1] : null;
      },
      // Talleres que se cobran aparte (por veces por semana), fuera de la escala
      facturacion: { aparte: [] },
      grupos: { "3": "Sala de 3", "4": "Sala de 4", "5": "Sala de 5" },
      // Grilla 2026 (0=Lunes … 4=Viernes). [] = ese día no hay taller.
      grilla: {
        "3": [
          [],
          ["Gimnasia Artística"],
          [],
          ["Gimnasia Artística", "Deportes Kids"],
          ["Comedia Musical"]
        ],
        "4": [
          ["Cocineritos", "Futbolito"],
          ["Gimnasia Artística", "Taekwondo"],
          ["Arte"],
          ["Gimnasia Artística", "Taekwondo", "Deportes Kids"],
          ["Comedia Musical"]
        ],
        "5": [
          ["Cocineritos", "Futbolito"],
          ["Gimnasia Artística", "Taekwondo"],
          ["Arte"],
          ["Gimnasia Artística", "Taekwondo", "Deportes Kids"],
          ["Comedia Musical"]
        ]
      }
    },

    // ----------------------------------------------------------
    primaria: {
      nombre: "Nivel Primario",
      etiquetaCurso: "Grado",
      // 2027: 1° y 2° pasan a 2 cursos (Arrayán, Jacarandá)
      cursos: [
        "1° Arrayán", "1° Jacarandá",
        "2° Arrayán", "2° Jacarandá",
        "3° Arrayán", "3° Ceibo", "3° Jacarandá",
        "4° Arrayán", "4° Ceibo", "4° Jacarandá",
        "5° Arrayán", "5° Ceibo", "5° Jacarandá",
        "6° Arrayán", "6° Ceibo", "6° Jacarandá"
      ],
      grupoDeCurso: (curso) => {
        const n = parseInt(String(curso), 10);
        if (n >= 1 && n <= 3) return "1";
        if (n >= 4 && n <= 6) return "2";
        return null;
      },
      facturacion: { aparte: ["Fútbol"] },
      grupos: { "1": "1er Ciclo (1°, 2° y 3°)", "2": "2do Ciclo (4°, 5° y 6°)" },
      // Grilla 2026 (sin Natación, que se gestiona aparte)
      grilla: {
        "1": [
          ["Gimnasia Artística (Nivel 1)", "Taekwondo", "Comedia Musical", "Ajedrez", "Flex"],
          ["Acrobacia", "Cocina", "Arte", "Fútbol", "Flex"],
          ["Gimnasia Artística (Nivel 2)", "Cocina", "Dibujo Humorístico", "Mini Deportes", "Flex"],
          ["Acrobacia", "Full Dance", "Fútbol", "Flex"],
          ["Gimnasia Artística (Nivel 1)", "Taekwondo", "Dibujo Humorístico", "Flex"]
        ],
        "2": [
          ["Taekwondo", "Comedia Musical", "Ajedrez", "Flex"],
          ["Acrobacia", "Cocina", "Arte", "Fútbol", "Flex"],
          ["Gimnasia Artística (Nivel 2)", "Cocina", "Tecnología", "Flex"],
          ["Acrobacia", "Full Dance", "Tecnología", "Fútbol", "Flex"],
          ["Gimnasia Artística (Nivel 1)", "Taekwondo", "Dibujo Humorístico", "Flex"]
        ]
      }
    },

    // ----------------------------------------------------------
    secundaria: {
      nombre: "Nivel Secundario",
      etiquetaCurso: "Año",
      cursos: [
        "1° A", "1° B", "2° A", "2° B", "3° A", "3° B",
        "4° A", "4° B", "5° A", "5° B", "6° A", "6° B"
      ],
      grupoDeCurso: (curso) => {
        const n = parseInt(String(curso), 10);
        if (n >= 1 && n <= 3) return "basico";
        if (n >= 4 && n <= 6) return "superior";
        return null;
      },
      facturacion: { aparte: [] },
      grupos: { basico: "Ciclo Básico (1° a 3°)", superior: "Ciclo Superior (4° a 6°)" },
      // ⚠ GRILLA DE EJEMPLO — reemplazar por la real
      grilla: {
        basico: [
          ["Fútbol", "Vóley"],
          ["Robótica", "Teatro"],
          ["Básquet", "Arte Digital"],
          ["Fútbol", "Banda"],
          ["Ajedrez", "Programación"]
        ],
        superior: [
          ["Fútbol", "Vóley"],
          ["Robótica", "Teatro"],
          ["Básquet", "Fotografía"],
          ["Fútbol", "Banda"],
          ["Ajedrez", "Programación"]
        ]
      }
    }
  }
};

// Helper: talleres posibles para un curso en un día (0..4)
window.talleresPosibles = function (nivel, curso, diaIdx) {
  const n = window.TALLERES_CONFIG.niveles[nivel];
  if (!n) return [];
  const g = n.grupoDeCurso(curso);
  return (g && n.grilla[g] && n.grilla[g][diaIdx]) || [];
};
