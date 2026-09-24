// Pólizas DUPLICADAS en la cartera viva: dos filas vivas con el mismo número
// en la misma compañía. Es el guardián de la conciliación Codeoscopic↔CIMA
// (docs/CORREDURIA-CRM-VISION.md §5): cuando emitamos por Codeoscopic y CIMA
// traiga la misma póliza sin casarla, aquí se ve antes de que la ficha pinte
// dos pólizas y el cliente cobre dos avisos.

export type PolizaParaDuplicados = {
  id: string
  clienteId: string
  numeroPoliza: string | null
  /** Código DGS de la compañía (`C0058`…). Preferido al nombre. */
  codigoEntidadDgs: string | null
  aseguradora: string
  /** `import_ref` a NULL = cara viva (CIMA o emitida por nosotros). */
  viva: boolean
  /** `id_poliza_entidad` informado = confirmada por CIMA. */
  confirmadaCima: boolean
  estado: string
}

export type GrupoDuplicado = {
  numero: string
  compania: string
  polizas: { id: string; clienteId: string; confirmadaCima: boolean; estado: string }[]
  /** `true` si el grupo mezcla una emitida por nosotros con una de CIMA: la que hay que casar. */
  emitidaYCima: boolean
}

/** Número de póliza sin espacios, guiones ni ceros a la izquierda, en mayúsculas. */
export function normalizarNumeroPoliza(n: string | null | undefined): string | null {
  if (typeof n !== 'string') return null
  const s = n.toUpperCase().replace(/[\s\-./]/g, '').replace(/^0+(?=\d)/, '')
  return s === '' ? null : s
}

/**
 * Agrupa las VIVAS y NO canceladas por número + compañía. Las históricas del
 * volcado no cuentan: su «copia gemela» es un dato útil (trae la dirección del
 * riesgo), no un duplicado.
 */
export function polizasDuplicadas(polizas: readonly PolizaParaDuplicados[]): GrupoDuplicado[] {
  const grupos = new Map<string, GrupoDuplicado>()
  for (const p of polizas) {
    if (!p.viva || p.estado === 'cancelada') continue
    const numero = normalizarNumeroPoliza(p.numeroPoliza)
    if (!numero) continue
    const compania = (p.codigoEntidadDgs ?? p.aseguradora).trim().toUpperCase()
    const clave = `${numero}|${compania}`
    let g = grupos.get(clave)
    if (!g) {
      g = { numero, compania, polizas: [], emitidaYCima: false }
      grupos.set(clave, g)
    }
    g.polizas.push({ id: p.id, clienteId: p.clienteId, confirmadaCima: p.confirmadaCima, estado: p.estado })
  }
  const out: GrupoDuplicado[] = []
  for (const g of grupos.values()) {
    if (g.polizas.length < 2) continue
    g.emitidaYCima = g.polizas.some((x) => x.confirmadaCima) && g.polizas.some((x) => !x.confirmadaCima)
    out.push(g)
  }
  return out.sort((a, b) => Number(b.emitidaYCima) - Number(a.emitidaYCima) || a.numero.localeCompare(b.numero))
}
