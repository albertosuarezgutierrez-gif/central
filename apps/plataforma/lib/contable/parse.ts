// apps/plataforma/lib/contable/parse.ts
// Extrae las líneas técnicas `APRENDER: {json}` de la respuesta del modelo y devuelve el texto
// limpio (sin esas líneas) + los aprendizajes parseados. Puro y testeable (node --test).

export type Aprendizaje = { clave: string; insight: string }

export function extraerAprendizajes(texto: string): { limpio: string; aprendizajes: Aprendizaje[] } {
  const re = /APRENDER:\s*(\{[\s\S]*?\})/g
  const aprendizajes: Aprendizaje[] = []
  for (const m of texto.matchAll(re)) {
    try {
      const obj = JSON.parse(m[1])
      const clave = typeof obj?.clave === 'string' ? obj.clave.trim().slice(0, 60) : ''
      const insight = typeof obj?.insight === 'string' ? obj.insight.trim().slice(0, 500) : ''
      if (clave && insight) aprendizajes.push({ clave, insight })
    } catch { /* línea mal formada: ignorar */ }
  }
  // Borra cualquier línea que empiece por APRENDER: (válida o mal formada) del texto visible.
  const limpio = texto.replace(/^[ \t]*APRENDER:.*$/gm, '').replace(/\n{3,}/g, '\n\n').trim()
  return { limpio, aprendizajes }
}
