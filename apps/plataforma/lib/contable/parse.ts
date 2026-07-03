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

export type AccionCruda = {
  tipo?: string; ref?: string; destino?: string; propiedad?: string | null; valor?: boolean
}

export function extraerAcciones(texto: string): { limpio: string; acciones: AccionCruda[] } {
  const re = /ACCION:\s*(\{[\s\S]*?\})/g
  const acciones: AccionCruda[] = []
  for (const m of texto.matchAll(re)) {
    try {
      const o = JSON.parse(m[1])
      if (o && typeof o.tipo === 'string') acciones.push(o)
    } catch { /* mal formada: ignorar */ }
  }
  const limpio = texto.replace(/^[ \t]*ACCION:.*$/gm, '').replace(/\n{3,}/g, '\n\n').trim()
  return { limpio, acciones }
}
