// PATRIMONIO (27/10/2026) — reglas PURAS de cómo se cruzan gastos e inmuebles (sin prisma ni React: se usan desde el
// cliente, el servidor y los tests). Solo `import type`.
//
//  · Al añadir un gasto fijo el inmueble es OBLIGATORIO: nunca «Sin inmueble» por defecto. Un único inmueble viene
//    preseleccionado; con varios hay que elegir; «gasto general del titular» solo si se elige a propósito (`GENERAL`).
//  · Los gastos se agrupan titular → inmueble; lo que no cuelga de un piso va al grupo «Generales del titular».
//  · Inicio: `null` = no se sabe (no se pinta 0), `0` = revisado y no hay nada.
import type { ComunidadFila, DerramaFila, FacturaPendiente, GastoFila, PlantillaFila, TitularGastos } from './gastos-api'

/** Valor del desplegable para «Gasto general del titular (no es de un piso)». Nunca es un id de inmueble. */
export const GENERAL = '__general__'
export const TEXTO_GENERAL = 'Gasto general del titular (no es de un piso)'

/**
 * Valor inicial del desplegable: con UN solo inmueble, ese; con varios, vacío (hay que elegir); sin ninguno, la única
 * opción posible (`GENERAL`). Con un `prefijado` válido, ese.
 */
export function inmuebleInicial(inmuebles: readonly { id: string }[], prefijado?: string | null): string {
  if (prefijado && inmuebles.some((i) => i.id === prefijado)) return prefijado
  if (inmuebles.length === 0) return GENERAL
  return inmuebles.length === 1 ? inmuebles[0]!.id : ''
}

export type EleccionInmueble = { ok: true; inmueble: string | null } | { ok: false }

/**
 * Qué inmueble se manda al servidor. `elegido` vacío NO vale (salvo que el titular no tenga ningún inmueble: entonces solo
 * cabe un gasto general). `GENERAL` → `null` explícito. Un id que no es de este titular no vale.
 */
export function eleccionDeInmueble(inmuebles: readonly { id: string }[], elegido: string): EleccionInmueble {
  if (elegido === GENERAL) return { ok: true, inmueble: null }
  if (elegido === '') return inmuebles.length === 0 ? { ok: true, inmueble: null } : { ok: false }
  return inmuebles.some((i) => i.id === elegido) ? { ok: true, inmueble: elegido } : { ok: false }
}

export type GrupoGastos = {
  /** `null` = grupo «Generales del titular». */
  inmuebleId: string | null
  alias: string
  plantillas: PlantillaFila[]
  comunidades: ComunidadFila[]
  derramas: DerramaFila[]
  gastos: GastoFila[]
  facturasPendientes: FacturaPendiente[]
}

export const ALIAS_GENERALES = 'Generales del titular'

const vacio = (inmuebleId: string | null, alias: string): GrupoGastos => ({
  inmuebleId, alias, plantillas: [], comunidades: [], derramas: [], gastos: [], facturasPendientes: [],
})

/**
 * Titular → un grupo por inmueble (en el orden de `t.inmuebles`) + «Generales» al final SOLO si tiene algo. Un gasto cuyo
 * inmueble ya no existe (archivado) o que nunca tuvo, es general: no se pierde. La comunidad sale en cada piso enlazado;
 * sin ningún piso enlazado, en generales.
 */
export function agruparPorInmueble(t: Pick<TitularGastos, 'inmuebles' | 'plantillas' | 'comunidades' | 'derramas' | 'gastos' | 'facturasPendientes'>): GrupoGastos[] {
  const grupos = new Map<string, GrupoGastos>(t.inmuebles.map((i) => [i.id, vacio(i.id, i.alias)]))
  const generales = vacio(null, ALIAS_GENERALES)
  const de = (id: string | null) => (id !== null && grupos.get(id)) || generales
  for (const p of t.plantillas) de(p.inmuebleId).plantillas.push(p)
  for (const d of t.derramas) de(d.inmuebleId).derramas.push(d)
  for (const g of t.gastos) de(g.inmuebleId).gastos.push(g)
  for (const f of t.facturasPendientes) de(f.inmuebleId).facturasPendientes.push(f)
  for (const c of t.comunidades) {
    const enlazados = c.inmuebles.filter((x) => grupos.has(x.inmuebleId))
    if (enlazados.length === 0) generales.comunidades.push(c)
    else for (const x of enlazados) grupos.get(x.inmuebleId)!.comunidades.push(c)
  }
  const hayGenerales = generales.plantillas.length + generales.comunidades.length + generales.derramas.length + generales.gastos.length + generales.facturasPendientes.length > 0
  return [...grupos.values(), ...(hayGenerales ? [generales] : [])]
}

/** Lo que cuelga de UN inmueble (ficha del piso). Id desconocido → grupo vacío con ese id. */
export function gruposDeInmueble(t: Parameters<typeof agruparPorInmueble>[0], inmuebleId: string): GrupoGastos {
  return agruparPorInmueble(t).find((g) => g.inmuebleId === inmuebleId) ?? vacio(inmuebleId, '')
}

/** Estado de los «por confirmar» en Inicio. Nunca se inventa un 0: `null` se dice como «no hemos podido comprobarlo». */
export type PendientesInicio = { tipo: 'sin_comprobar' } | { tipo: 'ninguno' } | { tipo: 'hay'; n: number }

export function pendientesDeInicio(n: number | null | undefined): PendientesInicio {
  if (n === null || n === undefined || !Number.isFinite(n) || n < 0) return { tipo: 'sin_comprobar' }
  return n === 0 ? { tipo: 'ninguno' } : { tipo: 'hay', n }
}

export function textoPendientesInicio(n: number | null | undefined): string {
  const p = pendientesDeInicio(n)
  // Rotulado como lo que se cuenta (27/10/2026): TODO lo «por confirmar» de la lista de gastos, que mezcla las facturas por
  // revisar (`origen='factura'`) y los gastos propuestos (cron, derramas): el contador y la lista cuentan lo mismo.
  if (p.tipo === 'sin_comprobar') return 'Ahora no hemos podido comprobar si tienes facturas o gastos por confirmar.'
  if (p.tipo === 'ninguno') return 'No tienes facturas ni gastos por confirmar.'
  return p.n === 1 ? '1 factura o gasto por confirmar.' : `${p.n} facturas y gastos por confirmar.`
}

/** Nº de inmuebles en Inicio: `null` = no se sabe (no se pinta 0). */
export function textoInmueblesInicio(n: number | null | undefined): string | null {
  if (n === null || n === undefined || !Number.isFinite(n) || n < 0) return null
  return n === 1 ? '1 inmueble' : `${n} inmuebles`
}

/**
 * El titular reducido a UN inmueble (para mandar al navegador solo lo de esa ficha). Conserva sus datos y permisos; los
 * gastos generales (sin piso) se quedan fuera: no son de este piso.
 */
export function titularDeInmueble(t: TitularGastos, inmuebleId: string): TitularGastos {
  const g = gruposDeInmueble(t, inmuebleId)
  return {
    ...t,
    inmuebles: t.inmuebles.filter((i) => i.id === inmuebleId),
    plantillas: g.plantillas, comunidades: g.comunidades, derramas: g.derramas, gastos: g.gastos, facturasPendientes: g.facturasPendientes,
  }
}
