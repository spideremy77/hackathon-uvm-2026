// =====================================================================
//  CONFIGURACIÓN DE LA APP — este es el archivo que se adapta al reto.
//  - "ui": lo que ve el usuario (nombre, textos, colores, ejemplos).
//  - "tasks": cada función de la app. Cada una tiene su propio prompt de
//    Gemini (se queda en el servidor, nunca llega al navegador).
// =====================================================================

export const APP = {
  ui: {
    name: "Ilumina",
    tagline: "Tu asistente para entender y moverte por la ciudad, sin barreras.",
    team: "Equipo [NOMBRE]",
    campus: "UVM [CAMPUS]",
    primaryColor: "#B4121B", // rojo UVM; cambiar si se quiere otra identidad
    ods: ["ODS 10 · Reducción de las desigualdades", "ODS 11 · Ciudades y comunidades sostenibles"],
    disclaimer:
      "Las respuestas las genera IA (Gemini) y pueden tener errores. Verifica la información importante.",
  },

  // Instrucciones comunes para TODAS las funciones.
  baseSystem: `Eres el motor de inteligencia de una app de inclusión social en México.
Hablas español de México, con respeto y calidez, sin tecnicismos.
Tu usuario puede ser una persona mayor, con discapacidad visual o auditiva, con baja
escolaridad, hablante de lengua indígena o en situación de vulnerabilidad.
Nunca inventes datos concretos (teléfonos, direcciones, montos, leyes). Si no lo sabes,
dilo y sugiere dónde confirmarlo (por ejemplo, Locatel 55 5658 1111 en CDMX, o la
dependencia oficial correspondiente).`,

  // Instrucción extra cuando el usuario activa "Lectura fácil".
  easyRead: `MODO LECTURA FÁCIL ACTIVO: usa frases muy cortas (máximo 12 palabras),
palabras de uso diario, un solo tema por oración y ejemplos concretos.`,

  tasks: [
    {
      id: "documento",
      icon: "📄",
      title: "Entender un documento",
      description: "Toma foto a un recibo, trámite, receta o letrero y te lo explico fácil.",
      placeholder: "Ej. ¿Qué tengo que hacer con este papel? ¿Cuándo vence?",
      acceptsImage: true,
      examples: ["¿Qué me están pidiendo en este oficio?", "¿Cuánto tengo que pagar y para cuándo?"],
      system: `Analiza el documento o la imagen que te comparten (si la hay) y la pregunta.
Explica qué es, qué significa para la persona y qué tiene que hacer, paso a paso.
Señala fechas límite, montos y riesgos (multas, cortes, fraudes) como alertas.
Si la imagen no se lee bien, dilo y pide otra foto con más luz.`,
    },
    {
      id: "entorno",
      icon: "🧭",
      title: "Describir mi entorno",
      description: "Para personas con baja visión: describo lo que hay frente a ti y los obstáculos.",
      placeholder: "Ej. ¿Puedo cruzar por aquí? ¿Dónde está la entrada?",
      acceptsImage: true,
      examples: ["¿Qué hay frente a mí?", "¿Hay escalones o rampas?"],
      system: `Eres los ojos de una persona con discapacidad visual. Describe la escena de la
imagen en orden de importancia para su seguridad: primero obstáculos y peligros
(escalones, coches, hoyos, postes), luego orientación (puertas, rampas, señales, texto
visible) y al final detalles. Usa referencias de reloj y distancia ("a tu derecha, a las
2, como a 3 pasos"). Sé breve: se va a leer en voz alta.`,
    },
    {
      id: "pregunta",
      icon: "💬",
      title: "Pregúntame",
      description: "Dudas sobre trámites, apoyos sociales, transporte o servicios en tu ciudad.",
      placeholder: "Ej. ¿Cómo saco mi credencial del INAPAM?",
      acceptsImage: false,
      examples: ["¿Qué apoyos hay para personas con discapacidad?", "¿Cómo llego en transporte accesible al hospital?"],
      system: `Responde la duda con pasos claros y accionables. Indica requisitos típicos,
a dónde acudir y qué llevar. Marca como alerta cualquier riesgo de fraude o cobro indebido
(los trámites de apoyos sociales son gratuitos).`,
    },
  ],

  // Forma de la respuesta que Gemini debe devolver (JSON estructurado).
  // El frontend sabe dibujar esta forma como tarjetas.
  responseSchema: {
    type: "OBJECT",
    properties: {
      titulo: { type: "STRING", description: "Título corto de la respuesta" },
      resumen: { type: "STRING", description: "Explicación clara en 1 a 3 oraciones" },
      nivel: { type: "STRING", enum: ["info", "atencion", "urgente"], description: "Qué tan urgente es" },
      puntos: {
        type: "ARRAY",
        items: {
          type: "OBJECT",
          properties: {
            tipo: { type: "STRING", enum: ["paso", "alerta", "dato", "recurso"] },
            titulo: { type: "STRING" },
            detalle: { type: "STRING" },
          },
          required: ["tipo", "titulo", "detalle"],
        },
      },
      siguiente_accion: { type: "STRING", description: "Lo único que la persona debe hacer ahora" },
      voz: { type: "STRING", description: "Versión corta y natural para leer en voz alta (máx. 60 palabras)" },
    },
    required: ["titulo", "resumen", "nivel", "puntos", "siguiente_accion", "voz"],
  },
};

// Lo que se puede mandar al navegador (sin prompts).
export function publicConfig() {
  return {
    ui: APP.ui,
    tasks: APP.tasks.map(({ system, ...t }) => t),
  };
}
