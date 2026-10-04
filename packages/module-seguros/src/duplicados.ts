// Pólizas DUPLICADAS: dos fichas sin fusionar con el mismo número en la misma
// compañía. Es el guardián de la conciliación Codeoscopic↔CIMA
// (docs/CORREDURIA-CRM-VISION.md §5) y de las gemelas que deja la ingesta.
//
// 🚨 UN SOLO CRITERIO (04/10/2026): `agruparDuplicadas`. Lo usan la pantalla
// «Duplicadas» de plataforma (`polizasDuplicadas`) y el vigía de la ingesta
// (`gruposVivosDuplicados`); cada uno solo PROYECTA el grupo a lo que puede
// enseñar. Antes eran dos criterios y la pantalla daba 0 grupos mientras el
// vigía contaba 8: un aviso que no se puede abrir en ninguna pantalla no sirve.

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



// ── El criterio único ───────────────────────────────────────────────────────
//
// Entra TODA ficha no fusionada con DGS de un cliente no descartado (esos dos
// filtros los pone la consulta de quien llama, `leerFichasCandidatasDuplicadas`):
// también las del volcado y las canceladas — es justo donde quedan las gemelas
// que nadie ha fusionado. Lo que NO entra es
// el número comodín: «pendiente» seis veces en Mapfre no es una póliza seis veces.

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

/** Lo mínimo para agrupar: de qué correduría, qué número y qué compañía. */
export type FichaClaveDuplicado = {
  id: string
  correduriaId: string
  numeroPoliza: string | null
  codigoEntidadDgs: string | null
}

export type GrupoFichas<T extends FichaClaveDuplicado> = {
  correduriaId: string
  /** Código DGS en mayúsculas (`C0109`…). */
  entidad: string
  /** `numeroPolizaComparable` del grupo. */
  numero: string
  /** Una por id (una ficha repetida no fabrica un duplicado), ordenadas por id. */
  fichas: T[]
}

/**
 * EL criterio: agrupa por correduría + DGS + `numeroPolizaComparable` y devuelve
 * los grupos de ≥ 2 fichas distintas. Una ficha sin DGS no entra (no se puede
 * distinguir de otra compañía); un grupo cuyos pares están TODOS marcados «no
 * duplicado», tampoco. Dos corredurías no se funden jamás. Orden estable:
 * entidad, luego el id más bajo.
 */
export function agruparDuplicadas<T extends FichaClaveDuplicado>(
  fichas: readonly T[],
  noDuplicados?: ReadonlySet<string> | null,
): GrupoFichas<T>[] {
  const grupos = new Map<string, GrupoFichas<T>>()
  for (const f of fichas) {
    const entidad = (f.codigoEntidadDgs ?? '').trim().toUpperCase()
    const numero = numeroPolizaComparable(f.numeroPoliza)
    if (!entidad || !numero || !f.id || !f.correduriaId) continue
    const clave = `${f.correduriaId}|${entidad}|${numero}`
    const g = grupos.get(clave)
    if (!g) grupos.set(clave, { correduriaId: f.correduriaId, entidad, numero, fichas: [f] })
    else if (!g.fichas.some((x) => x.id === f.id)) g.fichas.push(f)
  }
  const out: GrupoFichas<T>[] = []
  for (const g of grupos.values()) {
    if (g.fichas.length < 2) continue
    g.fichas.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    if (grupoResueltoNoDuplicado(g.fichas.map((x) => x.id), noDuplicados)) continue
    out.push(g)
  }
  return out.sort((a, b) => a.entidad.localeCompare(b.entidad) || (a.fichas[0].id < b.fichas[0].id ? -1 : 1))
}

// ── De dónde viene cada ficha (para decidir en la pantalla) ─────────────────

/**
 * `cima` = la mantiene CIMA (trae `eiac_xml_hash` o `id_poliza_entidad`) ·
 * `volcado` = histórico del CRM anterior (`import_ref`, sin CIMA) ·
 * `emitida` = la emitimos por Codeoscopic y CIMA aún no la ha traído ·
 * `declarada` = la declaró el cliente · `manual` = alta a mano en el CRM.
 */
export type OrigenFicha = 'cima' | 'volcado' | 'emitida' | 'declarada' | 'manual'
export const ORIGENES_FICHA: readonly OrigenFicha[] = ['cima', 'volcado', 'emitida', 'declarada', 'manual']

export type EntradaOrigenFicha = {
  eiacXmlHash: string | null | undefined
  idPolizaEntidad: string | null | undefined
  importRef: string | null | undefined
  /** Enum `poliza_origen`. `null` = no se sabe. */
  origen: string | null | undefined
}

const informado = (v: string | null | undefined) => typeof v === 'string' && v.trim() !== ''

/** Origen de una ficha. CIMA manda sobre todo lo demás (una gemela del volcado que CIMA ya mantiene es CIMA). */
export function origenFicha(p: EntradaOrigenFicha): OrigenFicha {
  if (informado(p.eiacXmlHash) || informado(p.idPolizaEntidad)) return 'cima'
  if (informado(p.importRef)) return 'volcado'
  if (p.origen === 'emitida_codeoscopic') return 'emitida'
  if (p.origen === 'declarada_usuario') return 'declarada'
  return 'manual'
}

// ── Proyección para la PANTALLA ─────────────────────────────────────────────

export type PolizaParaDuplicados = FichaClaveDuplicado & {
  clienteId: string
  aseguradora: string | null
  origen: OrigenFicha
  estado: string
  /** `false` = ficha del cliente descartada (`clientes.activo`); `null` = no se sabe. */
  clienteActivo: boolean | null
}

export type FichaDuplicada = {
  id: string
  clienteId: string
  origen: OrigenFicha
  estado: string
  clienteActivo: boolean | null
  /** Atajo de `origen === 'cima'`, por compatibilidad con lectores viejos. */
  confirmadaCima: boolean
}

export type GrupoDuplicado = {
  /** Número comparable (sin separadores ni ceros a la izquierda). */
  numero: string
  /** Código DGS. */
  compania: string
  /** Nombre de la compañía tal como figura en alguna ficha, si lo hay. */
  aseguradora: string | null
  polizas: FichaDuplicada[]
  /** `true` si mezcla una emitida por nosotros con una de CIMA: la que hay que casar. */
  emitidaYCima: boolean
}

/**
 * Los grupos para la pantalla «Duplicadas»: `agruparDuplicadas` con el detalle
 * que hace falta para decidir (origen, estado, cliente activo). Primero los que
 * mezclan emisión y CIMA, luego por compañía y número.
 */
export function polizasDuplicadas(
  polizas: readonly PolizaParaDuplicados[],
  noDuplicados?: ReadonlySet<string> | null,
): GrupoDuplicado[] {
  return agruparDuplicadas(polizas, noDuplicados)
    .map((g): GrupoDuplicado => {
      const fichas = g.fichas.map((p) => ({
        id: p.id,
        clienteId: p.clienteId,
        origen: p.origen,
        estado: p.estado,
        clienteActivo: p.clienteActivo,
        confirmadaCima: p.origen === 'cima',
      }))
      return {
        numero: g.numero,
        compania: g.entidad,
        aseguradora: g.fichas.map((p) => p.aseguradora?.trim() ?? '').find((a) => a !== '' && a !== '(legacy)') ?? null,
        polizas: fichas,
        emitidaYCima: fichas.some((x) => x.origen === 'cima') && fichas.some((x) => x.origen === 'emitida'),
      }
    })
    .sort((a, b) => Number(b.emitidaYCima) - Number(a.emitidaYCima) || a.compania.localeCompare(b.compania) || a.numero.localeCompare(b.numero))
}

// ── Proyección para el VIGÍA ────────────────────────────────────────────────

export type PolizaParaVigiaDuplicadas = FichaClaveDuplicado

/**
 * Un grupo de fichas con el mismo número y la misma compañía. SIN el número de
 * póliza a propósito: viaja por el puerto del vigía, que no saca
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

/** `agruparDuplicadas` sin números de póliza, para el vigía. */
export function gruposVivosDuplicados(
  polizas: readonly PolizaParaVigiaDuplicadas[],
  noDuplicados?: ReadonlySet<string> | null,
): GrupoVivoDuplicado[] {
  return agruparDuplicadas(polizas, noDuplicados).map((g) => ({ entidad: g.entidad, ref: g.fichas[0].id, fichas: g.fichas.length }))
}

// ── «No es duplicado»: qué pares se marcan ──────────────────────────────────

export const MOTIVO_NO_DUPLICADO_MAX = 500

/** Motivo obligatorio: recortado, sin saltos de línea. `null` = vacío o no es texto. */
export function limpiarMotivoNoDuplicado(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const t = v.replace(/\s+/g, ' ').trim().slice(0, MOTIVO_NO_DUPLICADO_MAX)
  return t === '' ? null : t
}

export type MarcaNoDuplicado =
  | { ok: true; correduriaId: string; pares: [string, string][] }
  | { ok: false; motivo: 'pocas_polizas' | 'demasiadas_polizas' | 'poliza_desconocida' | 'no_es_un_grupo' }

export const MAX_POLIZAS_MARCA = 20

/**
 * Los pares a guardar en `poliza_no_duplicado` para marcar un grupo entero.
 * `fichas` = lo leído de la BD para esos ids (sin fusionar, de la correduría).
 * Exige que TODOS los ids pedidos estén leídos y que, con EL MISMO criterio de
 * la pantalla, caigan en un único grupo: así no se puede marcar un par que la
 * pantalla nunca enseñó (otra compañía, otro número, una ficha fusionada). Cada
 * par va ordenado (a < b), como el CHECK de la tabla.
 */
export function paresNoDuplicado(ids: readonly string[], fichas: readonly FichaClaveDuplicado[]): MarcaNoDuplicado {
  const unicos = [...new Set(ids.filter((x) => typeof x === 'string' && x !== ''))].sort()
  if (unicos.length < 2) return { ok: false, motivo: 'pocas_polizas' }
  if (unicos.length > MAX_POLIZAS_MARCA) return { ok: false, motivo: 'demasiadas_polizas' }
  const porId = new Map(fichas.map((f) => [f.id, f]))
  if (unicos.some((id) => !porId.has(id))) return { ok: false, motivo: 'poliza_desconocida' }
  const grupos = agruparDuplicadas(unicos.map((id) => porId.get(id)!))
  if (grupos.length !== 1 || grupos[0].fichas.length !== unicos.length) return { ok: false, motivo: 'no_es_un_grupo' }
  const pares: [string, string][] = []
  for (let i = 0; i < unicos.length; i++) {
    for (let j = i + 1; j < unicos.length; j++) pares.push([unicos[i], unicos[j]])
  }
  return { ok: true, correduriaId: grupos[0].correduriaId, pares }
}
