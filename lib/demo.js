// Respuesta de ejemplo cuando no hay API key (solo para probar la interfaz).
export function demoResponse(task, prompt) {
  return {
    titulo: `Modo demo · ${task.title}`,
    resumen:
      "Esta es una respuesta de ejemplo. Configura GEMINI_API_KEY para obtener respuestas reales de Gemini.",
    nivel: "atencion",
    puntos: [
      { tipo: "paso", titulo: "Lo que preguntaste", detalle: prompt || "(solo imagen)" },
      { tipo: "alerta", titulo: "Sin conexión a Gemini", detalle: "Falta la variable de entorno GEMINI_API_KEY." },
      { tipo: "recurso", titulo: "Dónde sacar la key", detalle: "Google AI Studio → Get API key." },
    ],
    siguiente_accion: "Agrega la API key en Vercel → Settings → Environment Variables.",
    voz: "Esta es una respuesta de ejemplo. Falta configurar la llave de Gemini.",
  };
}
