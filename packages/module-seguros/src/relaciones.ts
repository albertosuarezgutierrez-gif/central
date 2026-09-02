// Relaciones entre clientes de la correduría (`seguros.cliente_relaciones`):
// quién es marido de quién, quién es la empresa de quién — y la AUTORIZACIÓN
// para ver los seguros del otro. Reglas puras, sin BD.
//
// La tabla viene del CRM de Manuel (1.708 filas el 02/09/2026) y guarda cada
// vínculo humano como DOS filas, una por sentido, con tipos recíprocos
// (A→B «Hijo/a» y B→A «Padre/Madre»). Aquí se mantiene esa forma y se fija lo
// que el CRM dejó ambiguo:
//
// - `tipo` de una fila A→B describe a B RESPECTO DE A: «B es <tipo> de A».
//   Desde la ficha de A se lee «<nombre de B> · <tipo>».
// - `puedeVerPolizas` de una fila A→B significa **A autoriza a B a ver las
//   pólizas de A**. Es direccional a propósito: que María Antonia autorice a
//   José no dice nada de lo que José autoriza a María Antonia. (El CRM lo
//   colapsaba con un OR de los dos sentidos: eso no sirve para un portal.)
// - Una autorización es un dato de consentimiento: quién la dio y cuándo van
//   a `historial_interno`; aquí solo se decide qué significa.

export const TIPOS_RELACION = [
  'Cónyuge/Pareja de Hecho',
  'Hijo/a',
  'Padre/Madre',
  'Hermano/a',
  'Suegro/a',
  'Nuero/a',
  'Cuñado/a',
  'Tio/a',
  'Sobrino/a',
  'Novio/a',
  'Amigo/a',
  'Empresa',
  'Empleado/a',
  'Socio/a',
  'Accionista',
  'Administración',
  'Dueño',
  'Otra',
] as const

export type TipoRelacion = (typeof TIPOS_RELACION)[number]

export const GRUPOS_RELACION: readonly { categoria: string; tipos: readonly TipoRelacion[] }[] = [
  { categoria: 'Familia', tipos: ['Cónyuge/Pareja de Hecho', 'Hijo/a', 'Padre/Madre', 'Hermano/a', 'Suegro/a', 'Nuero/a', 'Cuñado/a', 'Tio/a', 'Sobrino/a', 'Novio/a'] },
  { categoria: 'Personal', tipos: ['Amigo/a'] },
  { categoria: 'Empresa', tipos: ['Empresa', 'Empleado/a', 'Socio/a', 'Accionista', 'Administración'] },
  { categoria: 'Propiedad', tipos: ['Dueño'] },
  { categoria: 'Otra', tipos: ['Otra'] },
]

export function tipoRelacion(v: unknown): TipoRelacion | null {
  return typeof v === 'string' && (TIPOS_RELACION as readonly string[]).includes(v) ? (v as TipoRelacion) : null
}

/** Si «B es X de A», entonces «A es inverso(X) de B». Los simétricos se devuelven tal cual. */
const INVERSO: Record<TipoRelacion, TipoRelacion> = {
  'Cónyuge/Pareja de Hecho': 'Cónyuge/Pareja de Hecho',
  'Hijo/a': 'Padre/Madre',
  'Padre/Madre': 'Hijo/a',
  'Hermano/a': 'Hermano/a',
  'Suegro/a': 'Nuero/a',
  'Nuero/a': 'Suegro/a',
  'Cuñado/a': 'Cuñado/a',
  'Tio/a': 'Sobrino/a',
  'Sobrino/a': 'Tio/a',
  'Novio/a': 'Novio/a',
  'Amigo/a': 'Amigo/a',
  Empresa: 'Dueño',
  'Empleado/a': 'Empresa',
  'Socio/a': 'Socio/a',
  Accionista: 'Empresa',
  Administración: 'Empresa',
  Dueño: 'Empresa',
  Otra: 'Otra',
}

/**
 * Tipo inverso. Para los pares del volcado «Tomador - Propietario» /
 * «Ocasional - Tomador» (fuera del vocabulario) se intercambian las mitades.
 * Lo desconocido se devuelve tal cual: mejor un tipo repetido que inventado.
 */
export function tipoInverso(tipo: string): string {
  const t = tipoRelacion(tipo)
  if (t) return INVERSO[t]
  const m = /^(.+?)\s-\s(.+)$/.exec(tipo)
  if (m) return `${m[2]} - ${m[1]}`
  return tipo
}

/** Fila cruda de `cliente_relaciones`. */
export type RelacionFila = {
  id: string
  clienteAId: string
  clienteBId: string
  tipo: string
  puedeVerPolizas: boolean
  observaciones: string | null
}

/** Un vínculo visto desde la ficha de `clienteId`, con los dos sentidos fundidos. */
export type RelacionFicha = {
  /** Fila ficha→relacionado (tipo desde la ficha). `null` si el volcado solo trajo la inversa. */
  idIda: string | null
  /** Fila relacionado→ficha. `null` si no existe. */
  idVuelta: string | null
  relacionadoId: string
  /** Qué es el relacionado para la ficha («María Antonia · Cónyuge/Pareja de Hecho»). */
  tipo: string
  /** La ficha autoriza al relacionado a ver SUS pólizas (flag de la fila ida). */
  autorizaVer: boolean
  /** La ficha puede ver las pólizas del relacionado (flag de la fila vuelta). */
  puedeVer: boolean
  observaciones: string | null
}

/**
 * Funde las filas de ambos sentidos en un vínculo por persona relacionada.
 * Si hay varios tipos con la misma persona (el volcado guarda «Cónyuge» y
 * «Tomador - Propietario» a la vez), gana el del vocabulario humano.
 */
export function relacionesDeFicha(filas: readonly RelacionFila[], clienteId: string): RelacionFicha[] {
  const por = new Map<string, { idas: RelacionFila[]; vueltas: RelacionFila[] }>()
  const orden: string[] = []
  for (const f of filas) {
    if (f.clienteAId === f.clienteBId) continue
    const esIda = f.clienteAId === clienteId
    if (!esIda && f.clienteBId !== clienteId) continue
    const otro = esIda ? f.clienteBId : f.clienteAId
    let g = por.get(otro)
    if (!g) {
      g = { idas: [], vueltas: [] }
      por.set(otro, g)
      orden.push(otro)
    }
    ;(esIda ? g.idas : g.vueltas).push(f)
  }
  const peso = (t: string) => (tipoRelacion(t) ? 2 : 1)
  const mejor = (fs: RelacionFila[]) => fs.reduce<RelacionFila | null>((m, f) => (m === null || peso(f.tipo) > peso(m.tipo) ? f : m), null)
  return orden.map((otro) => {
    const { idas, vueltas } = por.get(otro)!
    const ida = mejor(idas)
    const vuelta = mejor(vueltas)
    const tipo = ida ? ida.tipo : tipoInverso(vuelta!.tipo)
    return {
      idIda: ida?.id ?? null,
      idVuelta: vuelta?.id ?? null,
      relacionadoId: otro,
      tipo,
      autorizaVer: idas.some((f) => f.puedeVerPolizas),
      puedeVer: vueltas.some((f) => f.puedeVerPolizas),
      observaciones: ida?.observaciones ?? vuelta?.observaciones ?? null,
    }
  })
}

/**
 * Ids de los clientes cuyas pólizas puede ver `clienteId` (lo que un portal
 * enseñaría además de las suyas): las filas A→clienteId con el flag puesto.
 */
export function clientesVisiblesPara(filas: readonly RelacionFila[], clienteId: string): string[] {
  const out: string[] = []
  for (const f of filas) {
    if (f.clienteBId === clienteId && f.clienteAId !== clienteId && f.puedeVerPolizas && !out.includes(f.clienteAId)) out.push(f.clienteAId)
  }
  return out
}

/** Frase de la ficha: «María Antonia puede ver sus seguros» / «José no ve los de María Antonia». */
export function explicarAutorizacion(r: Pick<RelacionFicha, 'autorizaVer' | 'puedeVer'>, nombreFicha: string, nombreOtro: string): string {
  const a = r.autorizaVer ? `${nombreOtro} puede ver los seguros de ${nombreFicha}` : `${nombreOtro} no ve los seguros de ${nombreFicha}`
  const b = r.puedeVer ? `${nombreFicha} puede ver los de ${nombreOtro}` : `${nombreFicha} no ve los de ${nombreOtro}`
  return `${a} · ${b}`
}
