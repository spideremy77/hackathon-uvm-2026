// =====================================================================
//  RAMPA · tu ciudad sin barreras — configuración de la IA
//  Cada función ("task") tiene su propio prompt y su propio formato de
//  respuesta (JSON Schema). Los prompts se quedan en el servidor.
// =====================================================================

export const PERFILES = {
  silla: "persona usuaria de silla de ruedas",
  andadera: "persona que camina con andadera o bastón (movilidad reducida)",
  vision: "persona con baja visión o ceguera",
  mayor: "persona mayor (más de 65 años)",
  carriola: "persona que empuja una carriola o lleva a un niño pequeño",
};

export const APP = {
  ui: {
    name: "Rampa",
    tagline: "Tu ciudad sin barreras",
    team: "Equipo Lincecitos",
    campus: "UVM San Rafael/Reforma",
    primaryColor: "#B4121B",
    ods: ["ODS 10 · Reducción de las desigualdades", "ODS 11 · Ciudades y comunidades sostenibles"],
    disclaimer: "Las evaluaciones las genera IA (Gemini) y pueden tener errores. Verifica antes de tomar decisiones importantes.",
    perfiles: [
      { id: "silla", icon: "♿", label: "Silla de ruedas" },
      { id: "andadera", icon: "🦯", label: "Andadera o bastón" },
      { id: "vision", icon: "👁️", label: "Baja visión" },
      { id: "mayor", icon: "🧓", label: "Persona mayor" },
      { id: "carriola", icon: "👶", label: "Carriola" },
    ],
  },

  baseSystem: `Eres el motor de inteligencia de "Rampa", una app de accesibilidad urbana para la
Ciudad de México (ODS 10 y 11). Hablas español de México, con respeto, calidez y sin
tecnicismos. Tus usuarios son personas con discapacidad motriz o visual, personas mayores y
familias con carriola.
Reglas: nunca inventes datos concretos (teléfonos, direcciones, nombres de funcionarios, leyes,
estadísticas). Si no estás seguro, dilo. Si la imagen no se ve bien, dilo y pide otra foto.
Para autoridades usa categorías generales (la alcaldía correspondiente, el Sistema de Transporte
Colectivo Metro, Metrobús, Secretaría de Obras y Servicios, Secretaría de Seguridad Ciudadana,
Locatel) y no inventes canales que no conozcas.`,

  easyRead: `MODO LECTURA FÁCIL ACTIVO: frases muy cortas (máximo 12 palabras), palabras de uso
diario, una idea por oración.`,

  tasks: {
    // ---------------------------------------------------------------- 1
    evaluar: {
      system: `FUNCIÓN: EVALUAR UN LUGAR. Analiza la foto (y la descripción si la hay) de un espacio
urbano: calle, banqueta, cruce, entrada a un edificio, estación, parada, parque, baño, etc.
Evalúa su accesibilidad para CADA uno de estos perfiles: silla, andadera, vision, mayor, carriola.
Semáforo: "verde" = se puede usar de forma autónoma y segura; "amarillo" = se puede con ayuda o
precaución; "rojo" = no es accesible o es peligroso.
Fíjate en: escalones, rampas (pendiente, ancho, obstrucciones), estado del piso, ancho libre de
paso, guía táctil (piso podotáctil), señalización, iluminación, barandales, puertas, elevadores,
cruces peatonales, autos o puestos que bloquean el paso.
Da prioridad en tu explicación al perfil de la persona usuaria.`,
      schema: {
        type: "OBJECT",
        properties: {
          titulo: { type: "STRING", description: "Qué lugar es, en pocas palabras" },
          semaforo_general: { type: "STRING", enum: ["verde", "amarillo", "rojo"] },
          resumen: { type: "STRING", description: "Explicación clara en 1-2 oraciones, pensando en el perfil de la persona" },
          perfiles: {
            type: "ARRAY",
            items: {
              type: "OBJECT",
              properties: {
                perfil: { type: "STRING", enum: ["silla", "andadera", "vision", "mayor", "carriola"] },
                semaforo: { type: "STRING", enum: ["verde", "amarillo", "rojo"] },
                razon: { type: "STRING", description: "Por qué, en una frase" },
              },
              required: ["perfil", "semaforo", "razon"],
            },
          },
          barreras: {
            type: "ARRAY",
            description: "Barreras detectadas (vacío si no hay)",
            items: {
              type: "OBJECT",
              properties: { titulo: { type: "STRING" }, detalle: { type: "STRING" } },
              required: ["titulo", "detalle"],
            },
          },
          recomendaciones: { type: "ARRAY", items: { type: "STRING" }, description: "Consejos prácticos para la persona" },
          voz: { type: "STRING", description: "Versión breve y natural para leer en voz alta (máx. 50 palabras)" },
        },
        required: ["titulo", "semaforo_general", "resumen", "perfiles", "barreras", "recomendaciones", "voz"],
      },
    },

    // ---------------------------------------------------------------- 2
    reportar: {
      system: `FUNCIÓN: REPORTAR UNA BARRERA. La persona te comparte una foto y/o una descripción
(a veces dictada, con errores de transcripción) de un problema de accesibilidad en la ciudad.
1) Clasifica el tipo de barrera y su gravedad. 2) Indica a quién afecta. 3) Sugiere la
autoridad responsable más probable y explica por qué (categorías generales, sin inventar
teléfonos ni nombres). 4) Redacta un reporte formal, respetuoso y claro, listo para enviar,
con: qué ocurre, dónde (usa la ubicación que te den; si no hay, deja "[ubicación]"), desde
cuándo si se sabe, a quién afecta y qué se solicita. Firma como "Vecina/o usuaria/o de Rampa".
Gravedad: "critica" = riesgo inmediato de caída, accidente o deja a alguien atrapado;
"alta" = impide el paso a algún grupo; "media" = dificulta; "baja" = molestia menor.`,
      schema: {
        type: "OBJECT",
        properties: {
          titulo: { type: "STRING", description: "Título corto del reporte" },
          tipo_barrera: {
            type: "STRING",
            enum: ["banqueta", "rampa", "cruce_peatonal", "transporte_publico", "elevador", "senalizacion", "iluminacion", "obstruccion", "entrada_edificio", "bano", "otro"],
          },
          gravedad: { type: "STRING", enum: ["baja", "media", "alta", "critica"] },
          semaforo: { type: "STRING", enum: ["verde", "amarillo", "rojo"], description: "Accesibilidad del punto" },
          afecta: { type: "ARRAY", items: { type: "STRING", enum: ["silla", "andadera", "vision", "mayor", "carriola"] } },
          resumen_claro: { type: "STRING", description: "Qué pasa, en 1-2 oraciones fáciles" },
          autoridad_sugerida: { type: "STRING" },
          por_que_autoridad: { type: "STRING" },
          reporte_formal: { type: "STRING", description: "Texto del reporte listo para enviar" },
          mientras_tanto: { type: "STRING", description: "Consejo de seguridad para quien pase por ahí" },
          voz: { type: "STRING", description: "Versión breve para leer en voz alta (máx. 50 palabras)" },
        },
        required: ["titulo", "tipo_barrera", "gravedad", "semaforo", "afecta", "resumen_claro", "autoridad_sugerida", "por_que_autoridad", "reporte_formal", "mientras_tanto", "voz"],
      },
    },

    // ---------------------------------------------------------------- 3
    recomendar: {
      system: `FUNCIÓN: RECOMENDACIONES EN EL MAPA. Recibes la lista de puntos del mapa de
accesibilidad (id, título, tipo, semáforo, notas) y lo que la persona quiere hacer.
Recomienda cuáles le convienen y cuáles debe evitar SEGÚN SU PERFIL, usando solo los puntos
de la lista (nunca inventes lugares). Usa exactamente los "id" que te dieron. Si ningún
punto sirve, dilo y da consejos generales.`,
      schema: {
        type: "OBJECT",
        properties: {
          resumen: { type: "STRING" },
          recomendados: {
            type: "ARRAY",
            items: { type: "OBJECT", properties: { id: { type: "STRING" }, razon: { type: "STRING" } }, required: ["id", "razon"] },
          },
          evitar: {
            type: "ARRAY",
            items: { type: "OBJECT", properties: { id: { type: "STRING" }, razon: { type: "STRING" } }, required: ["id", "razon"] },
          },
          consejos: { type: "ARRAY", items: { type: "STRING" } },
          voz: { type: "STRING" },
        },
        required: ["resumen", "recomendados", "evitar", "consejos", "voz"],
      },
    },

    // ---------------------------------------------------------------- 4
    aclarar: {
      system: `FUNCIÓN: INFORMACIÓN PÚBLICA EN LENGUAJE CLARO. La persona te comparte un aviso,
cartel, comunicado, señal o texto oficial (foto o texto): cierre de estación, cambio de ruta,
obra, corte de agua, trámite, programa social, protocolo de emergencia, etc.
Explica qué dice, qué significa PARA ELLA según su perfil y qué tiene que hacer, paso a paso.
Marca como alerta fechas límite, riesgos y posibles fraudes. No agregues información que el
aviso no dice; si falta algo importante, indícalo.`,
      schema: {
        type: "OBJECT",
        properties: {
          titulo: { type: "STRING" },
          resumen: { type: "STRING", description: "Qué dice el aviso, en 1-3 oraciones fáciles" },
          nivel: { type: "STRING", enum: ["info", "atencion", "urgente"] },
          puntos: {
            type: "ARRAY",
            items: {
              type: "OBJECT",
              properties: {
                tipo: { type: "STRING", enum: ["paso", "alerta", "dato", "accesibilidad"] },
                titulo: { type: "STRING" },
                detalle: { type: "STRING" },
              },
              required: ["tipo", "titulo", "detalle"],
            },
          },
          siguiente_accion: { type: "STRING" },
          voz: { type: "STRING" },
        },
        required: ["titulo", "resumen", "nivel", "puntos", "siguiente_accion", "voz"],
      },
    },
  },
};

export function publicConfig() {
  return { ui: APP.ui, tasks: Object.keys(APP.tasks) };
}
