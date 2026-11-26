// Respuestas de ejemplo cuando no hay API key (solo para probar la interfaz sin Gemini).
export function demoResponse(task, prompt, puntos = []) {
  const aviso = "Modo demo: falta GEMINI_API_KEY.";
  if (task === "evaluar") {
    return {
      titulo: "Entrada con escalón (demo)",
      semaforo_general: "amarillo",
      resumen: `${aviso} Ejemplo: la entrada tiene un escalón de unos 15 cm y no hay rampa.`,
      perfiles: [
        { perfil: "silla", semaforo: "rojo", razon: "El escalón impide entrar sin ayuda." },
        { perfil: "andadera", semaforo: "amarillo", razon: "Se puede subir con cuidado; no hay barandal." },
        { perfil: "vision", semaforo: "amarillo", razon: "El escalón no tiene contraste de color." },
        { perfil: "mayor", semaforo: "amarillo", razon: "Riesgo de tropiezo." },
        { perfil: "carriola", semaforo: "amarillo", razon: "Hay que levantar la carriola." },
      ],
      barreras: [{ titulo: "Escalón sin rampa", detalle: "Aproximadamente 15 cm de alto." }],
      recomendaciones: ["Pide apoyo para subir.", "Reporta la falta de rampa al establecimiento."],
      voz: "Ejemplo de evaluación. La entrada tiene un escalón sin rampa.",
    };
  }
  if (task === "reportar") {
    return {
      titulo: "Rampa bloqueada (demo)",
      tipo_barrera: "rampa",
      gravedad: "alta",
      semaforo: "rojo",
      afecta: ["silla", "andadera", "carriola"],
      resumen_claro: `${aviso} Ejemplo: un auto estacionado bloquea la rampa de la esquina.`,
      autoridad_sugerida: "Secretaría de Seguridad Ciudadana (tránsito)",
      por_que_autoridad: "Un vehículo mal estacionado es una falta de tránsito.",
      reporte_formal: `A quien corresponda:\n\n${prompt || "Reporto una rampa bloqueada."}\n\nSolicito su intervención.\n\nVecina/o usuaria/o de Rampa`,
      mientras_tanto: "Cruza en la siguiente esquina si tiene rampa libre.",
      voz: "Ejemplo de reporte. La rampa está bloqueada por un auto.",
    };
  }
  if (task === "recomendar") {
    const verdes = puntos.filter((p) => p.semaforo === "verde");
    const rojos = puntos.filter((p) => p.semaforo === "rojo");
    return {
      resumen: `${aviso} Recomendación de ejemplo con base en los colores del mapa.`,
      recomendados: verdes.slice(0, 3).map((p) => ({ id: String(p.id), razon: "Marcado en verde." })),
      evitar: rojos.slice(0, 3).map((p) => ({ id: String(p.id), razon: "Marcado en rojo." })),
      consejos: ["Configura la API key para recomendaciones reales."],
      voz: "Esta es una recomendación de ejemplo.",
    };
  }
  return {
    titulo: "Aviso explicado (demo)",
    resumen: `${aviso} Aquí verías el aviso explicado en lenguaje claro.`,
    nivel: "atencion",
    puntos: [{ tipo: "paso", titulo: "Lo que enviaste", detalle: prompt || "(solo imagen)" }],
    siguiente_accion: "Configura GEMINI_API_KEY en Vercel.",
    voz: "Esta es una respuesta de ejemplo.",
  };
}
