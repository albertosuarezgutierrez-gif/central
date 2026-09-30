// ────────────────────────────────────────────────────────────────────────────
// Comprobaciones de coherencia de una cotización, AL RECIBIRLA (30/09/2026).
//
// Hasta hoy los precios que no cuadraban los cazaba Alberto mirando la pantalla
// (un todo riesgo «sin daños propios», tres «Mapfre · Autos» idénticos, una
// franquicia de 450€ que al emitir era la de 600€). Estas reglas los señalan en
// cuanto llega la respuesta del vendor: la fila sale marcada en la parrilla, el
// panel de emisión lo repite y queda anotado en la ficha (→ Telegram).
//
// PURO: sin BD ni red. Solo afirma lo que el propio dato contradice; lo que no
// se sabe (una franquicia que el vendor no declara) se dice como «no consta»,
// nunca como error de la compañía.
// ────────────────────────────────────────────────────────────────────────────

export type PrecioParaCoherencia = {
  /** `mainQuote.id` del vendor. `null`/ausente = no consta. */
  id?: string | null
  compania?: string | null
  categoria?: string | null
  modalidad?: string | null
  primaEur?: number | null
  franquiciaEur?: number | null
  /** Solo lo traen los precios que dejó un ReRate: no cuentan para la llave. */
  expiraEn?: string | null
}

export type TipoReparoCotizacion =
  | 'prima_invalida'
  | 'id_repetido'
  | 'sin_id'
  | 'llave_repetida'
  | 'franquicia_no_cuadra'
  | 'franquicia_no_declarada'

export type ReparoCotizacion = {
  tipo: TipoReparoCotizacion
  /** Posiciones en la lista recibida a las que afecta. */
  indices: number[]
  mensaje: string
}

/** Texto con el que se anota en la ficha una cotización con reparos. El muro de actividad lo
 *  reconoce por este prefijo (tipo `cotizacion_incoherente`) y de ahí sale el Telegram. */
export const PREFIJO_HISTORIAL_COTIZACION_INCOHERENTE = '⚠️ Cotización con precios que no cuadran'

const norm = (s: string | null | undefined) => (s ?? '').trim().replace(/\s+/g, ' ').toLowerCase()

/**
 * La franquicia en euros que DICE el texto («Franquicia 450€», «franquicia de 1.500 €»), o
 * `null` si no nombra ninguna. Un «Todo riesgo con franquicia» a secas no nombra importe.
 */
export function franquiciaDelTexto(texto: string | null | undefined): number | null {
  // Con o sin unidad: los nombres reales dicen «Franquicia 450€», «franquicia de 1200» y
  // «Franquicia 1200 Euros» (medido en `tarificacion_precios`, 30/09/2026).
  const m = /franquicia\D{0,20}?(\d{1,3}(?:\.\d{3})+|\d+)(?:,\d{1,2})?(?!\d)/i.exec(texto ?? '')
  if (!m) return null
  const n = Number(m[1].replace(/\./g, ''))
  // Por debajo de 50€ no es una franquicia de coche/hogar sino otro número («Franquicia 2»).
  return Number.isFinite(n) && n >= 50 ? n : null
}

function dice(p: PrecioParaCoherencia): string {
  return [p.compania, p.modalidad ?? p.categoria].filter((x) => x && x.trim() !== '').join(' · ') || 'Una opción'
}

export function revisarCoherenciaCotizacion(precios: readonly PrecioParaCoherencia[]): ReparoCotizacion[] {
  const reparos: ReparoCotizacion[] = []
  const conId = precios.filter((p) => norm(p.id) !== '').length

  precios.forEach((p, i) => {
    const prima = p.primaEur
    if (typeof prima !== 'number' || !Number.isFinite(prima) || prima <= 0) {
      reparos.push({
        tipo: 'prima_invalida',
        indices: [i],
        mensaje: `${dice(p)}: la compañía no da una prima válida (${prima ?? 'sin prima'}). No se puede ofrecer.`,
      })
    }
    // Solo si OTRAS sí lo traen: en una cotización anterior al 29/09/2026 no lo trae ninguna,
    // y avisar en todas sería ruido que acaba ignorándose.
    if (norm(p.id) === '' && conId > 0) {
      reparos.push({
        tipo: 'sin_id',
        indices: [i],
        mensaje: `${dice(p)}: llega sin identificador de la compañía; al emitir solo se reconocerá por su descripción.`,
      })
    }
    const textoFranquicia = franquiciaDelTexto(p.modalidad) ?? franquiciaDelTexto(p.categoria)
    const franquicia = p.franquiciaEur
    if (textoFranquicia !== null && typeof franquicia === 'number' && Number.isFinite(franquicia) && Math.abs(textoFranquicia - franquicia) > 0.5) {
      reparos.push({
        tipo: 'franquicia_no_cuadra',
        indices: [i],
        mensaje: `${dice(p)}: el nombre dice franquicia de ${textoFranquicia}€ y la compañía declara ${franquicia}€. Confírmalo antes de ofrecerla.`,
      })
    } else if (franquicia == null && /con franquicia/i.test(`${p.categoria ?? ''} ${p.modalidad ?? ''}`) && textoFranquicia === null) {
      reparos.push({
        tipo: 'franquicia_no_declarada',
        indices: [i],
        mensaje: `${dice(p)}: es «con franquicia» pero la compañía no dice de cuánto. Pregúntalo antes de ofrecerla.`,
      })
    }
  })

  const porId = new Map<string, number[]>()
  precios.forEach((p, i) => {
    const k = norm(p.id)
    if (k !== '') porId.set(k, [...(porId.get(k) ?? []), i])
  })
  for (const [, indices] of porId) {
    if (indices.length > 1) {
      reparos.push({
        tipo: 'id_repetido',
        indices,
        mensaje: `${dice(precios[indices[0]])}: ${indices.length} opciones con el mismo identificador de la compañía.`,
      })
    }
  }

  // La llave descriptiva (compañía + nivel + modalidad) solo importa si alguna del grupo no
  // trae id: con id, `encontrarPrecio` las distingue; sin él, al emitir daría 409.
  const porLlave = new Map<string, number[]>()
  precios.forEach((p, i) => {
    if (p.expiraEn != null) return
    const k = `${norm(p.compania)}|${norm(p.categoria)}|${norm(p.modalidad)}`
    porLlave.set(k, [...(porLlave.get(k) ?? []), i])
  })
  for (const [, indices] of porLlave) {
    if (indices.length > 1 && indices.some((i) => norm(precios[i].id) === '')) {
      reparos.push({
        tipo: 'llave_repetida',
        indices,
        mensaje: `${dice(precios[indices[0]])}: ${indices.length} opciones con la misma descripción y sin identificador para distinguirlas; al emitir no se sabrá cuál es.`,
      })
    }
  }
  return reparos
}

/** Los mensajes que tocan a cada fila, en el orden de la lista. `[]` = revisada y sin reparos. */
export function reparosPorFila(precios: readonly PrecioParaCoherencia[]): string[][] {
  const filas: string[][] = precios.map(() => [])
  for (const r of revisarCoherenciaCotizacion(precios)) for (const i of r.indices) filas[i].push(r.mensaje)
  return filas
}
