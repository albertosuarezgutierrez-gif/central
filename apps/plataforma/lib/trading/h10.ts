// Evaluador de las reglas de SALIDA contra el criterio FIRMADO en el pre-registro (H9 · H10).
// Módulo PURO y testeado — sin `@/`, sin Prisma, sin red. La política vive aquí, en un solo sitio,
// para que el cron no pueda "mover la portería" por su cuenta al leer los resultados.
//
// Por qué existe: H9 se resolvió a mano leyendo la tabla. Con H10 recolectando cuatro variantes más,
// esa lectura manual es justo donde se cuela el autoengaño (mirar, no cumplir el umbral, y decidir
// que "por poco" vale). El criterio se aplica en código y el cron solo transporta el veredicto.

/** Una observación = la MISMA entrada medida por dos salidas: la de tiempo y la variante. */
export type ObsSalida = { tiempo: number; variante: number }

export type VeredictoVariante = {
  variante: string
  n: number
  medianaTiempo: number      // en tanto por uno (0,0312 = +3,12%)
  medianaVariante: number
  batacazosTiempo: number    // proporción de resultados ≤ −15%
  batacazosVariante: number
  deltaMediana: number       // variante − tiempo, en PUNTOS PORCENTUALES
  deltaBatacazos: number
  // `sin_muestra` NO es «la regla no sirve»: es «todavía no se puede saber». Nunca se colapsa con
  // `rechazada` — es la diferencia entre una regla medida y una regla no medida.
  veredicto: 'cablear_freno' | 'cablear_retorno' | 'rechazada' | 'sin_muestra'
  motivo: string
}

/** Umbrales FIRMADOS en H9 y heredados por H10. Cambiarlos exige una enmienda al pre-registro. */
export const MIN_OBSERVACIONES = 5_000
export const BATACAZO = -0.15          // qué cuenta como batacazo
export const FRENO_RECORTE_PP = 5      // perfil freno: recorte mínimo de batacazos
export const FRENO_CEDE_MAX_PP = 1     // perfil freno: mediana que como mucho se puede ceder
export const RETORNO_MEJORA_PP = 2     // perfil retorno: mejora mínima de mediana

export function mediana(xs: number[]): number {
  if (!xs.length) return NaN
  const s = [...xs].sort((a, b) => a - b)
  const m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

const tasaBatacazos = (xs: number[]) => xs.filter(x => x <= BATACAZO).length / xs.length

/** Estadísticos ya calculados (los agrega SQL cuando el corpus es grande). Proporciones, no %. */
export type AgregadoSalida = {
  variante: string
  n: number
  medianaTiempo: number
  medianaVariante: number
  batacazosTiempo: number
  batacazosVariante: number
}

// El CRITERIO vive aquí y solo aquí. `evaluarVariante` (desde observaciones sueltas) y el cron
// (desde agregados de SQL) entran los dos por esta puerta, así que no puede haber dos umbrales.
export function decidir(a: AgregadoSalida): VeredictoVariante {
  const { variante, n, medianaTiempo, medianaVariante, batacazosTiempo, batacazosVariante } = a
  const base = {
    variante, n,
    medianaTiempo: NaN, medianaVariante: NaN,
    batacazosTiempo: NaN, batacazosVariante: NaN,
    deltaMediana: NaN, deltaBatacazos: NaN,
  }
  if (n < MIN_OBSERVACIONES) {
    return {
      ...base,
      veredicto: 'sin_muestra',
      motivo: `${n} de ${MIN_OBSERVACIONES} observaciones — todavía no se puede juzgar`,
    }
  }
  // En PUNTOS PORCENTUALES, que es la unidad en la que están escritos los umbrales del pre-registro.
  const deltaMediana = (medianaVariante - medianaTiempo) * 100
  const deltaBatacazos = (batacazosVariante - batacazosTiempo) * 100
  const datos = {
    ...base, medianaTiempo, medianaVariante, batacazosTiempo, batacazosVariante,
    deltaMediana, deltaBatacazos,
  }
  const pp = (x: number) => `${x >= 0 ? '+' : ''}${x.toFixed(2)} pp`

  // Perfil FRENO: recorta batacazos ≥5 pp sin ceder más de 1 pp de mediana.
  if (-deltaBatacazos >= FRENO_RECORTE_PP && deltaMediana >= -FRENO_CEDE_MAX_PP) {
    return { ...datos, veredicto: 'cablear_freno',
      motivo: `recorta batacazos ${pp(deltaBatacazos)} cediendo solo ${pp(deltaMediana)} de mediana` }
  }
  // Perfil RETORNO: mejora la mediana ≥2 pp sin subir los batacazos.
  if (deltaMediana >= RETORNO_MEJORA_PP && deltaBatacazos <= 0) {
    return { ...datos, veredicto: 'cablear_retorno',
      motivo: `mejora la mediana ${pp(deltaMediana)} sin subir batacazos (${pp(deltaBatacazos)})` }
  }
  // Rechazada: se dice POR QUÉ y por cuánto. «Por poco» sigue siendo rechazada — es exactamente lo
  // que el pre-registro prohíbe redondear a favor (cláusula anti-portería-móvil de H10).
  const faltaFreno = -deltaBatacazos < FRENO_RECORTE_PP
    ? `no recorta batacazos lo bastante (${pp(deltaBatacazos)}, hace falta −${FRENO_RECORTE_PP} pp)`
    : `cede ${pp(deltaMediana)} de mediana (el freno solo permite −${FRENO_CEDE_MAX_PP} pp)`
  return { ...datos, veredicto: 'rechazada', motivo: `${faltaFreno}; mediana ${pp(deltaMediana)}` }
}

/** Desde observaciones sueltas: calcula los estadísticos y aplica EL MISMO criterio. */
export function evaluarVariante(variante: string, obs: ObsSalida[]): VeredictoVariante {
  const t = obs.map(o => o.tiempo), v = obs.map(o => o.variante)
  return decidir({
    variante,
    n: obs.length,
    medianaTiempo: mediana(t),
    medianaVariante: mediana(v),
    batacazosTiempo: obs.length ? tasaBatacazos(t) : NaN,
    batacazosVariante: obs.length ? tasaBatacazos(v) : NaN,
  })
}

/** Parte para Telegram. `null` = nada que contar todavía (ninguna variante llegó a muestra). */
export function parteH10(vs: VeredictoVariante[]): string | null {
  const juzgadas = vs.filter(v => v.veredicto !== 'sin_muestra')
  if (!juzgadas.length) {
    const mejor = vs.reduce((a, b) => (b.n > a.n ? b : a), vs[0])
    return mejor && mejor.n > 0
      ? `🔬 H10 (salidas): recolectando — ${mejor.n}/${MIN_OBSERVACIONES} obs. en la variante más avanzada.`
      : null
  }
  const cableables = juzgadas.filter(v => v.veredicto.startsWith('cablear'))
  const cab = cableables.length
    ? `\n\n✅ CUMPLE el criterio firmado:\n${cableables.map(v => `• ${v.variante} — ${v.motivo}`).join('\n')}\n→ Entra como política de salida del PAPER vía PR (nunca automático).`
    : '\n\n❌ Ninguna cumple el criterio firmado. La salida por TIEMPO queda validada otra vez.'
  const filas = juzgadas
    .map(v => `• ${v.variante} (n=${v.n}): mediana ${(v.medianaVariante * 100).toFixed(2)}% · batacazos ${(v.batacazosVariante * 100).toFixed(2)}%`)
    .join('\n')
  const t = juzgadas[0]
  return `🔬 H10 — reglas de salida\n\nReferencia (salida por tiempo): mediana ${(t.medianaTiempo * 100).toFixed(2)}% · batacazos ${(t.batacazosTiempo * 100).toFixed(2)}%\n\n${filas}${cab}`
}
