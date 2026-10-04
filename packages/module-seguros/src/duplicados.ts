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

// ── «No es duplicado»: la decisión humana que la heurística no puede tomar ──
//
// Dos fichas vivas con el mismo número y la misma compañía suelen ser la misma
// póliza dos veces (13 pares de Allianz fusionados el 04/10/2026), pero NO
// siempre: Allianz 32742526 y 35374290 tienen gemela con OTRO cliente y son
// pólizas distintas de verdad. Sin forma de decirlo, el par sale para siempre en
// la pantalla y en el vigía, y un aviso que no se puede apagar se acaba
// ignorando. La decisión vive en `seguros.poliza_no_duplicado` (mig 0108 del
// repo asegura), un par ORDENADO por fila: esta clave es su espejo.

/**
 * Clave canónica de un par marcado «no duplicado»: los dos ids ordenados, así
 * (a,b) y (b,a) son la misma decisión. `null` si falta uno o son el mismo.
 */
export function claveParNoDuplicado(a: string | null | undefined, b: string | null | undefined): string | null {
  if (typeof a !== 'string' || typeof b !== 'string' || a === '' || b === '' || a === b) return null
  return a < b ? `${a}|${b}` : `${b}|${a}`
}

/**
 * ¿Está el grupo ENTERO resuelto como «no duplicado»? Solo si TODOS sus pares
 * están marcados: en un trío con A–B marcado, C sigue sin decidir frente a los
 * dos y el grupo se sigue enseñando (ante la duda, el estado conservador).
 */
export function grupoResueltoNoDuplicado(ids: readonly string[], noDuplicados: ReadonlySet<string> | null | undefined): boolean {
  if (!noDuplicados || noDuplicados.size === 0 || ids.length < 2) return false
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const k = claveParNoDuplicado(ids[i], ids[j])
      if (k === null || !noDuplicados.has(k)) return false
    }
  }
  return true
}

/**
 * Agrupa las VIVAS y NO canceladas por número + compañía. Las históricas del
 * volcado no cuentan: su «copia gemela» es un dato útil (trae la dirección del
 * riesgo), no un duplicado. Los grupos cuyos pares están TODOS marcados como
 * «no duplicado» (`claveParNoDuplicado`) no se devuelven.
 */
export function polizasDuplicadas(
  polizas: readonly PolizaParaDuplicados[],
  noDuplicados?: ReadonlySet<string> | null,
): GrupoDuplicado[] {
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
    if (grupoResueltoNoDuplicado(g.polizas.map((x) => x.id), noDuplicados)) continue
    g.emitidaYCima = g.polizas.some((x) => x.confirmadaCima) && g.polizas.some((x) => !x.confirmadaCima)
    out.push(g)
  }
  return out.sort((a, b) => Number(b.emitidaYCima) - Number(a.emitidaYCima) || a.numero.localeCompare(b.numero))
}

// ── Pólizas vivas duplicadas, para el VIGÍA de la ingesta ───────────────────
//
// Criterio más ancho que `polizasDuplicadas` (la pantalla), a propósito: entra
// TODA ficha no fusionada (`merged_into_poliza_id IS NULL`) con DGS, también las
// del volcado y las de clientes inactivos — es justo donde quedan las gemelas
// que nadie ha fusionado (medido el 04/10/2026: la pantalla daba 0 grupos y había
// 8). Lo que NO entra es el número comodín: «pendiente» seis veces en Mapfre no
// es una póliza seis veces.

/** Números que no identifican nada (espejo de `COMODIN_POLIZA_NUMBERS`, repo asegura). */
const COMODINES_NUMERO = new Set(['PENDIENTE', 'NOSE', 'NOLOSE', 'NOSABE', 'SN', 'SINNUMERO', '12345'])

/**
 * Número comparable entre fichas: solo [0-9A-Z], en mayúsculas y sin ceros a la
 * izquierda. `null` si no sirve para casar: comodín, menos de 5 caracteres tras
 * quitar los ceros, sin ningún dígito o un solo carácter repetido.
 */
export function numeroPolizaComparable(n: string | null | undefined): string | null {
  if (typeof n !== 'string') return null
  const alnum = n.toUpperCase().replace(/[^0-9A-Z]/g, '')
  if (COMODINES_NUMERO.has(alnum)) return null
  const s = alnum.replace(/^0+/, '')
  if (s.length < 5 || !/[0-9]/.test(s) || /^(.)\1+$/.test(s)) return null
  return s
}

export type PolizaParaVigiaDuplicadas = {
  id: string
  correduriaId: string
  numeroPoliza: string | null
  codigoEntidadDgs: string | null
}

/**
 * Un grupo de fichas vivas con el mismo número y la misma compañía. SIN el
 * número de póliza a propósito: viaja por el puerto del vigía, que no saca
 * identificadores contractuales (cabecera de `apps/asegura/lib/ingesta.ts`).
 * `ref` = el id más bajo del grupo: estable mientras el grupo no cambie, y es
 * lo que mete la firma del aviso para que suene cuando entra o sale un grupo.
 */
export type GrupoVivoDuplicado = {
  /** Código DGS de la compañía (`C0109`…). */
  entidad: string
  /** Id (uuid) más bajo del grupo. No es PII. */
  ref: string
  /** Fichas en el grupo (≥ 2). */
  fichas: number
}

/**
 * Agrupa por correduría + DGS + `numeroPolizaComparable`. Quien llama ya ha
 * filtrado las fusionadas. Una ficha sin DGS no entra (no se puede distinguir de
 * otra compañía); un grupo cuyos pares están todos marcados «no duplicado», tampoco.
 * Orden estable: entidad, luego `ref`.
 */
export function gruposVivosDuplicados(
  polizas: readonly PolizaParaVigiaDuplicadas[],
  noDuplicados?: ReadonlySet<string> | null,
): GrupoVivoDuplicado[] {
  const grupos = new Map<string, { entidad: string; ids: string[] }>()
  for (const p of polizas) {
    const entidad = (p.codigoEntidadDgs ?? '').trim().toUpperCase()
    const numero = numeroPolizaComparable(p.numeroPoliza)
    if (!entidad || !numero || !p.id || !p.correduriaId) continue
    const clave = `${p.correduriaId}|${entidad}|${numero}`
    const g = grupos.get(clave)
    if (g) g.ids.push(p.id)
    else grupos.set(clave, { entidad, ids: [p.id] })
  }
  const out: GrupoVivoDuplicado[] = []
  for (const g of grupos.values()) {
    const ids = [...new Set(g.ids)].sort()
    if (ids.length < 2 || grupoResueltoNoDuplicado(ids, noDuplicados)) continue
    out.push({ entidad: g.entidad, ref: ids[0], fichas: ids.length })
  }
  return out.sort((a, b) => a.entidad.localeCompare(b.entidad) || a.ref.localeCompare(b.ref))
}
