// apps/plataforma/lib/sivra/atribucion-canal.ts
//
// De dónde vino REALMENTE una reserva de SIVRA.
//
// El problema que resuelve (12/08/2026): el cuadro de mando decía «canal directo = 0 €» en 2026
// mientras la landing de housesevillana YA cerraba reservas directas por su motor, su WhatsApp de
// grupos y su teléfono. Esas reservas estaban en `incomes` con `portal='OTRO'`, y ese `'OTRO'` es
// justo el patrón que el CLAUDE.md llama «el "no lo sé" DISFRAZADO DE VALOR»: un cajón de sastre
// que se cuela por toda guarda basada en NULL (`COALESCE`, `IS NULL`, `??`) porque no ES null.
// El 0 € medía la etiqueta, no el negocio — y sobre ese 0 se llegó a construir un plan entero.
//
// Regla de la casa, aplicada aquí sin excepciones: TRES estados, no dos.
//   'DIRECTO' → hay evidencia positiva de que no hubo intermediario.
//   'OTA'     → vino por un portal conocido y sabemos cuál.
//   null      → NO SE SABE. Es un resultado legítimo y hay que pintarlo como «sin clasificar»,
//               nunca colapsarlo a 0 € ni contarlo como directo para que el número quede bonito.
//
// La evidencia de «directo» es la comisión: si el bruto que pagó el huésped y el neto que llegó
// coinciden, nadie se llevó una tajada por el medio. Booking se lleva ~19,72%, Airbnb y Expedia lo
// suyo; un 0,00% clavado no lo produce una OTA. Pero eso solo vale cuando el bruto EXISTE y es
// real: si `amount_gross` viene a null, lo que tenemos es un hueco, y un hueco nunca es una prueba.

/** Portales que son intermediarios conocidos. Comparación en mayúsculas, sin acentos. */
const OTAS_CONOCIDAS = ['BOOKING', 'AIRBNB', 'EXPEDIA', 'AGODA', 'VRBO', 'HOMEAWAY', 'TRIPADVISOR']

/**
 * Valores centinela: parecen un dato pero significan «no se supo clasificar». Se tratan
 * EXACTAMENTE igual que un null en toda guarda de este módulo — ese es el punto del ejercicio.
 */
const CENTINELAS = ['OTRO', 'OTROS', 'DESCONOCIDO', 'N/A', 'NA', 'SIN CLASIFICAR', '-', '']

/**
 * Importe por debajo del cual una fila no es una venta: bloqueos de calendario, pruebas y
 * correcciones manuales entran como 0 € o 1 €. Clasificar eso como «directo» inflaría el canal
 * con ruido — que es la misma mentira, solo que en la dirección contraria.
 */
const IMPORTE_MINIMO_VENTA = 5

export type Canal = 'DIRECTO' | 'OTA' | null

export type FilaIngreso = {
  portal: string | null | undefined
  /** Neto que llegó a la cuenta. */
  amount: number | null | undefined
  /** Bruto que pagó el huésped. NULL = la ingesta no lo trajo; NO es «no hubo comisión». */
  amount_gross: number | null | undefined
}

export type Atribucion = {
  canal: Canal
  /** Por qué se decidió así. Va a la UI: el usuario merece saber de dónde sale la etiqueta. */
  motivo: string
  /** Comisión efectiva en %, o null si no se puede calcular. */
  comisionPct: number | null
  /** true cuando el canal NO se pudo determinar y la fila necesita una mirada humana. */
  requiereRevision: boolean
}

/** ¿Este valor de `portal` es un cajón de sastre en vez de un dato? */
export function esCentinela(portal: string | null | undefined): boolean {
  if (portal == null) return true
  return CENTINELAS.includes(portal.trim().toUpperCase())
}

/** Normaliza a la OTA conocida, o null si no lo es. */
function otaDe(portal: string | null | undefined): string | null {
  if (portal == null) return null
  const p = portal.trim().toUpperCase()
  return OTAS_CONOCIDAS.find((o) => p === o || p.startsWith(o)) ?? null
}

/**
 * Comisión efectiva de la fila, o null si no se puede saber.
 *
 * Devuelve null —y no 0— cuando falta el bruto o cuando no es positivo. Un `?? 0` aquí sería
 * precisamente el bug que este módulo existe para impedir: convertiría «no tengo el bruto» en
 * «no hubo comisión», y de ahí en «esto fue una reserva directa».
 */
export function comisionPct(fila: FilaIngreso): number | null {
  const neto = fila.amount
  const bruto = fila.amount_gross
  if (neto == null || bruto == null) return null
  if (!Number.isFinite(neto) || !Number.isFinite(bruto)) return null
  if (bruto <= 0) return null
  return ((bruto - neto) / bruto) * 100
}

/**
 * Decide el canal de una fila de `incomes`.
 *
 * Nunca devuelve 'DIRECTO' por descarte: hace falta una comisión calculable y esencialmente nula
 * sobre un importe que sea una venta de verdad. Ante cualquier duda devuelve null, que la UI debe
 * mostrar como «sin clasificar» y no como cero.
 */
export function atribuirCanal(fila: FilaIngreso): Atribucion {
  const pct = comisionPct(fila)

  // 1. Portal conocido: no hay nada que deducir, la fila ya lo dice.
  const ota = otaDe(fila.portal)
  if (ota) {
    return { canal: 'OTA', motivo: `Portal declarado: ${ota}`, comisionPct: pct, requiereRevision: false }
  }

  // 2. Un portal que no reconocemos y que tampoco es un centinela: es información, no un hueco.
  //    No lo inventamos, pero tampoco lo mandamos a revisión como si faltara.
  if (!esCentinela(fila.portal)) {
    return {
      canal: null,
      motivo: `Portal no reconocido: «${String(fila.portal).trim()}»`,
      comisionPct: pct,
      requiereRevision: true,
    }
  }

  // 3. A partir de aquí el portal es un «no lo sé».
  //
  //    El ruido se descarta ANTES que nada: si la fila no llega a ser una venta, su canal da
  //    igual y no hay ninguna duda que un humano pueda resolver. Preguntar por la comisión
  //    primero mandaba los bloqueos de 0 € a la cola de revisión, que es ruido disfrazado de
  //    trabajo pendiente — y una cola llena de nada es una cola que nadie mira.
  const neto = fila.amount ?? 0
  if (neto < IMPORTE_MINIMO_VENTA) {
    return {
      canal: null,
      motivo: `Importe de ${neto} € demasiado bajo para ser una venta (bloqueo, prueba o ajuste)`,
      comisionPct: pct,
      requiereRevision: false,
    }
  }

  // 4. Es una venta de verdad y no sabemos el portal: solo la comisión puede sacarnos de la duda.
  if (pct == null) {
    return {
      canal: null,
      motivo: 'Sin portal y sin importe bruto: no hay con qué determinar el canal',
      comisionPct: null,
      requiereRevision: true,
    }
  }

  // Margen de un céntimo por los redondeos de la ingesta: 0,01 % sobre 1.400 € son 14 céntimos.
  if (Math.abs(pct) < 0.01) {
    return {
      canal: 'DIRECTO',
      motivo: 'Comisión 0,00 %: el bruto que pagó el huésped llegó íntegro, sin intermediario',
      comisionPct: pct,
      requiereRevision: false,
    }
  }

  // Hubo comisión, luego hubo intermediario — pero no sabemos cuál, y eso hay que decirlo.
  return {
    canal: 'OTA',
    motivo: `Comisión del ${pct.toFixed(2)} % sin portal declarado: hubo intermediario, sin identificar`,
    comisionPct: pct,
    requiereRevision: true,
  }
}

export type ResumenCanales = {
  directo: number
  ota: number
  sinClasificar: number
  /** Importe que NO se puede atribuir. Se muestra aparte; jamás se reparte ni se da por 0. */
  importeSinClasificar: number
  filasARevisar: number
}

/**
 * Reparte importes por canal para el cuadro de mando.
 *
 * `sinClasificar` sale como una categoría propia y visible a propósito: si se sumara al directo
 * inflaría el logro, y si se sumara a las OTA inflaría la comisión. Las dos serían mentira, y la
 * segunda encima parecería prudente.
 */
export function resumirCanales(filas: FilaIngreso[]): ResumenCanales {
  const r: ResumenCanales = { directo: 0, ota: 0, sinClasificar: 0, importeSinClasificar: 0, filasARevisar: 0 }
  for (const fila of filas) {
    const a = atribuirCanal(fila)
    const importe = fila.amount ?? 0
    if (a.requiereRevision) r.filasARevisar++
    if (a.canal === 'DIRECTO') r.directo += importe
    else if (a.canal === 'OTA') r.ota += importe
    else {
      r.sinClasificar++
      r.importeSinClasificar += importe
    }
  }
  return r
}
