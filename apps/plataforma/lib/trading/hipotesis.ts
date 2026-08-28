// Vigía de las hipótesis ABIERTAS del pre-registro de trading. Módulo PURO y testeado.
//
// Por qué existe: firmar una hipótesis es barato y recolectar también; lo que cuesta disciplina es
// RESOLVERLAS. A 28/08/2026 hay seis abiertas (H10…H15) y cada una dice «se evalúa cuando la tabla
// llegue a X», pero ese «cuando» no lo vigilaba nadie: dependía de que alguien se acordara, en un
// contenedor que se borra al acabar la sesión. Una hipótesis que se queda recolectando para siempre es
// PEOR que no haberla firmado, porque da la sensación de que se está midiendo algo.
//
// Esto NO resuelve ninguna hipótesis ni cablea nada: solo mira si YA hay muestra para resolverla y lo
// canta. El veredicto sigue siendo un PR con su criterio firmado delante.

export type EstadoHipotesis = 'lista' | 'recolectando' | 'sin_dato'

/** Lo que hace falta saber de una hipótesis para decir si le toca. `nota` explica el criterio. */
export type Hipotesis = {
  id: string
  titulo: string
  /** Criterio de muestra, en texto: lo que dice el pre-registro. */
  criterio: string
  /** Cuánta muestra hay y cuánta hace falta. `hay = null` = no se pudo consultar (≠ «no hay»). */
  hay: number | null
  falta: number
  /** Hipótesis cuya evaluación depende de otra (H14 y H15 se resuelven junto a H13). */
  dependeDe?: string
}

export type Veredicto = Hipotesis & { estado: EstadoHipotesis }

export function evaluar(h: Hipotesis): Veredicto {
  // 🚨 `hay = null` es «no se pudo mirar», y NO puede leerse como «todavía no hay muestra»: lo primero
  // exige arreglar la consulta, lo segundo exige esperar. Colapsarlos dejaría una hipótesis lista sin
  // avisar durante semanas mientras el parte dice, tan tranquilo, «recolectando».
  if (h.hay == null) return { ...h, estado: 'sin_dato' }
  return { ...h, estado: h.hay >= h.falta ? 'lista' : 'recolectando' }
}

/** Las que dependen de otra solo están listas si la otra lo está: se resuelven en la misma sesión. */
export function evaluarTodas(hs: Hipotesis[]): Veredicto[] {
  const primera = hs.map(evaluar)
  const porId = new Map(primera.map(v => [v.id, v]))
  return primera.map(v => {
    if (!v.dependeDe) return v
    const base = porId.get(v.dependeDe)
    if (!base) return v
    // Nunca al revés: una dependiente NO puede estar lista antes que su base, pero tampoco se degrada
    // un `sin_dato` propio a `recolectando` por mirar a la de al lado.
    if (v.estado === 'sin_dato') return v
    return { ...v, estado: base.estado === 'lista' ? v.estado : 'recolectando' }
  })
}

// El objetivo se enseña SIEMPRE, también cuando no se pudo leer la muestra: «?/5000» dice a la vez
// que no se sabe y cuánto haría falta; un «?» a secas escondería lo segundo.
const pct = (v: Veredicto) => `${v.hay == null ? '?' : v.hay}/${v.falta}`

/**
 * Parte para Telegram. Devuelve `null` cuando NO hay nada que hacer —ninguna lista y ninguna sin
 * dato—, porque un aviso semanal que solo dice «sigo esperando» entrena a ignorar el mensaje entero
 * (la lección del aviso ℹ️ de Kutxabank, 26/08/2026). El estado completo vive en el latido.
 */
export function parteHipotesis(vs: Veredicto[]): string | null {
  const listas = vs.filter(v => v.estado === 'lista')
  const ciegas = vs.filter(v => v.estado === 'sin_dato')
  if (!listas.length && !ciegas.length) return null
  const lineas: string[] = ['🔬 <b>Hipótesis de trading</b>']
  if (listas.length) {
    lineas.push('', '<b>Ya tienen muestra para resolverse:</b>')
    for (const v of listas) lineas.push(`• <b>${v.id}</b> — ${v.titulo} (${pct(v)}). ${v.criterio}`)
    lineas.push('', 'Resolver = PR con el criterio firmado delante. El cron no cablea nada.')
  }
  if (ciegas.length) {
    lineas.push('', '<b>Sin poder comprobar</b> (esto NO es «todavía no hay muestra»):')
    for (const v of ciegas) lineas.push(`• <b>${v.id}</b> — ${v.titulo}`)
  }
  return lineas.join('\n')
}

/** Línea del latido: el estado COMPLETO, incluidas las que siguen recolectando. */
export function detalleHipotesis(vs: Veredicto[]): string {
  return vs.map(v => `${v.id}:${v.estado === 'lista' ? '✅' : v.estado === 'sin_dato' ? '❔' : '⏳'}${pct(v)}`).join(' · ')
}
