// ────────────────────────────────────────────────────────────────────────────
// LA MISMA FINCA QUE VUELVE MÁS BARATA. PURO.
//
// Muchas subastas quedan desiertas y el juzgado las reconvoca con el tipo
// rebajado. Ahí está una de las mejores oportunidades del canal: un inmueble que
// ya se estudió (con sus cargas leídas y su semáforo) reapareciendo un 30% más
// abajo. Pero el radar no lo veía porque CADA convocatoria trae un identificador
// `SUB-JA-…` distinto: para el sistema eran dos subastas sin relación.
//
// La clave de identidad es la REFERENCIA CATASTRAL, no el identificador del
// portal. Si no la hay, se cae a finca registral + registro, que también
// identifica de forma única. Nunca se empareja por dirección o descripción: dos
// pisos del mismo bloque comparten texto y un falso positivo aquí haría creer
// que un inmueble ha bajado de precio cuando es otro distinto.
// ────────────────────────────────────────────────────────────────────────────

/** Convocatoria de una finca, tal como sale de la BD. */
export interface Convocatoria {
  dedupeKey: string
  identificador: string | null
  refCatastral: string | null
  fincaRegistral: string | null
  registroPropiedad: string | null
  valorSubasta: number | null
  fechaFin: string | null
  /** `desierta`, `adjudicada`, `cancelada`… `null` si sigue viva. */
  resultado: string | null
  municipio: string | null
  descripcion: string | null
}

export interface Reaparicion {
  /** La convocatoria VIVA (la que interesa pujar). */
  actual: Convocatoria
  /** La anterior de la misma finca, ya concluida. */
  anterior: Convocatoria
  /** Cuánto ha bajado el tipo, en tanto por uno (0.3 = 30% más barata). */
  bajada: number
  /** Diferencia en euros. */
  bajadaEur: number
  /** Cómo se emparejaron: útil para auditar un falso positivo. */
  clave: 'catastro' | 'finca_registral'
}

/** Bajada mínima para que merezca un aviso: por debajo es ruido/reajuste. */
export const BAJADA_MINIMA = 0.1

/**
 * Clave de identidad de una finca. `null` si no hay dato fiable — y entonces la
 * convocatoria NO entra en el emparejamiento, a propósito: es mejor perderse una
 * reaparición que inventarla.
 */
export function claveFinca(c: Convocatoria): { clave: string; tipo: 'catastro' | 'finca_registral' } | null {
  const rc = (c.refCatastral ?? '').replace(/\s+/g, '').toUpperCase()
  // Una referencia catastral española tiene 20 caracteres; menos es un dato a medias.
  if (rc.length >= 14) return { clave: `rc:${rc}`, tipo: 'catastro' }

  const finca = (c.fincaRegistral ?? '').replace(/\s+/g, '').toUpperCase()
  const registro = (c.registroPropiedad ?? '').replace(/\s+/g, '').toUpperCase()
  if (finca && registro) return { clave: `fr:${registro}:${finca}`, tipo: 'finca_registral' }

  return null
}

/**
 * Empareja convocatorias VIVAS con convocatorias anteriores de la misma finca y
 * devuelve las que han bajado de tipo al menos `bajadaMinima`.
 *
 * Ordena por bajada descendente: lo que más ha caído, primero.
 */
export function detectarReapariciones(
  convocatorias: Convocatoria[],
  bajadaMinima = BAJADA_MINIMA,
): Reaparicion[] {
  const porClave = new Map<string, { tipo: 'catastro' | 'finca_registral'; lista: Convocatoria[] }>()

  for (const c of convocatorias) {
    const k = claveFinca(c)
    if (!k) continue
    const entrada = porClave.get(k.clave) ?? { tipo: k.tipo, lista: [] }
    entrada.lista.push(c)
    porClave.set(k.clave, entrada)
  }

  const out: Reaparicion[] = []

  for (const [, { tipo, lista }] of porClave) {
    if (lista.length < 2) continue

    const vivas = lista.filter((c) => !c.resultado)
    const concluidas = lista.filter((c) => c.resultado)
    if (!vivas.length || !concluidas.length) continue

    // La viva más reciente contra la concluida con el tipo MÁS ALTO: así la
    // bajada refleja el recorrido completo, no solo el último escalón.
    const actual = vivas.reduce((a, b) =>
      (new Date(b.fechaFin ?? 0).getTime() > new Date(a.fechaFin ?? 0).getTime() ? b : a))
    const anterior = concluidas.reduce((a, b) => ((b.valorSubasta ?? 0) > (a.valorSubasta ?? 0) ? b : a))

    const va = actual.valorSubasta
    const vb = anterior.valorSubasta
    if (va == null || vb == null || vb <= 0 || va >= vb) continue

    const bajada = (vb - va) / vb
    if (bajada < bajadaMinima) continue

    out.push({ actual, anterior, bajada, bajadaEur: vb - va, clave: tipo })
  }

  return out.sort((a, b) => b.bajada - a.bajada)
}

/** Línea para el aviso de Telegram. */
export function textoReaparicion(r: Reaparicion): string {
  const eur = (n: number) =>
    `${n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: 'always' })}€`
  const antes = r.anterior.valorSubasta ?? 0
  const ahora = r.actual.valorSubasta ?? 0
  const suerte = r.anterior.resultado === 'desierta' ? 'quedó desierta' : `terminó ${r.anterior.resultado}`
  return (
    `🔁 Vuelve a salir un ${Math.round(r.bajada * 100)}% más barata: ${eur(antes)} → ${eur(ahora)} ` +
    `(la anterior ${suerte}${r.anterior.identificador ? `, ${r.anterior.identificador}` : ''}).`
  )
}
