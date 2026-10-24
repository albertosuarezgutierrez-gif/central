// PATRIMONIO (24/10/2026, P11) — los SEGUROS de un inmueble: estado, propuestas y enlace. Lógica de
// `app/(portal)/patrimonio/inmueble/[id]/page.tsx` y de `POST /api/patrimonio/inmuebles/[id]/seguros`, SIN prisma ni
// sesión (puertos inyectados) para poder probar el aislamiento con `node --test`. Los puertos reales están en
// `seguros-inmueble-bd.ts` y parten de `accesosPatrimonio()` + `carteraDeIdentidad()` de la cookie.
//
// 🚨 Aislamiento (spec 24/10/2026 §2.5):
//  · El inmueble del URL se busca DENTRO de los titulares autorizados; si no está → la MISMA 404 `no_encontrado`.
//  · La póliza del cuerpo se busca DENTRO de lo que esta identidad VE (su cartera a su nivel + sus declaradas), nunca
//    por su id a secas. Ajena → 404 (no confirma que exista). Nivel insuficiente para enlazar → 404 también.
//  · Un enlace cuenta para el ESTADO de todos los que ven el inmueble, pero el DETALLE (compañía, dirección,
//    vencimiento) solo se pinta si quien mira también ve esa póliza; si no: «enlazado por otra persona con acceso»,
//    sin datos. Y su vigencia queda `null` (no se puede comprobar con lo que esta identidad ve): el puro lo dice.
//  · Jamás se enseña el nº de póliza ni la prima: la póliza se identifica por compañía + bien (regla del portal).
import {
  esEstadoDecisionSeguro,
  esRamoDeInmueble,
  estadoSeguroInmueble,
  origenAEscribir,
  proponerEnlaces,
  puede,
  type EstadoDecisionSeguro,
  type EstadoSeguroInmueble,
  type InmuebleParaEnlace,
  type NivelPatrimonio,
  type OrigenEnlace,
  type PropuestaEnlace,
  type TipoPolizaEnlace,
} from '@central/module-patrimonio'

/** Una póliza que esta identidad ve, reducida a lo que se puede enseñar y casar. */
export type PolizaVisible = {
  tipo: TipoPolizaEnlace
  id: string
  compania: string | null
  ramo: string | null
  /** La dirección del riesgo TAL COMO LA VE quien mira (`null` = no informada o no visible en su nivel). */
  ubicacion: string | null
  /** Solo declaradas (la cartera no la expone). */
  referenciaCatastral: string | null
  /** `YYYY-MM-DD` o `null` (no consta). */
  vence: string | null
  /** `true` en vigor · `false` consta que no · `null` no se ha podido saber. */
  vigente: boolean | null
}

/** Lo que se pinta de una póliza (sin ref. catastral ni nada que sirva para casar). */
export type PolizaPintable = Omit<PolizaVisible, 'referenciaCatastral'>

export type FilaEnlace = {
  id: string
  polizaId: string | null
  polizaDeclaradaId: string | null
  estado: string
  origen: string
}

export type InmuebleDeSeguros = InmuebleParaEnlace & {
  id: string
  alias: string
  nivel: NivelPatrimonio
  enComunidad: boolean | null
  sinSeguroDeclaradoEn: Date | null
}

export interface PuertosSegurosInmueble {
  /** El inmueble SOLO si cuelga de un titular autorizado a esta sesión. `null` = 404. */
  inmueble(idPedido: string): Promise<InmuebleDeSeguros | null>
  /** Filas VIVAS (sin archivar) del inmueble ya autorizado. */
  enlaces(inmuebleId: string): Promise<FilaEnlace[]>
  /** Lo que esta identidad ve. `null` en una fuente = no se ha podido leer (nunca «no tiene»). */
  visibles(): Promise<{ cartera: PolizaVisible[] | null; declaradas: PolizaVisible[] | null }>
  /** Crea la decisión; si había un «No es este» vivo del mismo par y ahora se confirma, lo archiva antes. */
  crearEnlace(x: {
    inmuebleId: string
    tipo: TipoPolizaEnlace
    polizaId: string
    estado: EstadoDecisionSeguro
    origen: OrigenEnlace
  }): Promise<'ok' | 'duplicado'>
  /** Archiva un enlace VIVO de ese inmueble. `false` = no existe ahí. */
  archivarEnlace(inmuebleId: string, enlaceId: string): Promise<boolean>
  declararSinSeguro(inmuebleId: string, valor: boolean): Promise<void>
}

export type EnlacePintable = {
  id: string
  /** `null` = la enlazó otra persona con acceso y tú no ves esa póliza: se calla el detalle. */
  poliza: PolizaPintable | null
}

export type SegurosDeInmueble = {
  inmuebleId: string
  alias: string
  enComunidad: boolean | null
  estado: EstadoSeguroInmueble
  /** `YYYY-MM-DD` de la declaración «no tiene seguro», o `null`. */
  sinSeguroDeclaradoEn: string | null
  /** Enlaces CONFIRMADOS vivos. */
  enlaces: EnlacePintable[]
  propuestas: (PolizaPintable & { origen: PropuestaEnlace['origen'] })[]
  /** Lo que se puede enlazar a mano (ramos de inmueble o sin ramo claro), sin lo ya confirmado. */
  enlazables: PolizaPintable[]
  puedeEnlazar: boolean
  /** Alguna fuente (cartera o declaradas) no se ha podido leer: la pantalla lo dice. */
  sinComprobar: boolean
}

export type Respuesta = { status: number; body: Record<string, unknown> }

const NO_ENCONTRADO: Respuesta = { status: 404, body: { error: 'no_encontrado' } }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const clave = (tipo: TipoPolizaEnlace, id: string) => `${tipo}:${id}`

function pintable(p: PolizaVisible): PolizaPintable {
  // Lista blanca: lo que se pinta, campo a campo (la ref. catastral solo sirve para casar).
  return { tipo: p.tipo, id: p.id, compania: p.compania, ramo: p.ramo, ubicacion: p.ubicacion, vence: p.vence, vigente: p.vigente }
}

function tipoDeFila(f: FilaEnlace): { tipo: TipoPolizaEnlace; id: string } | null {
  if (f.polizaId !== null && f.polizaDeclaradaId === null) return { tipo: 'cartera', id: f.polizaId }
  if (f.polizaDeclaradaId !== null && f.polizaId === null) return { tipo: 'declarada', id: f.polizaDeclaradaId }
  return null
}

/** Enlazable a mano: ramo de inmueble, o un ramo que no sabemos clasificar (`otros`/vacío): no se esconde. */
function enlazable(p: PolizaVisible): boolean {
  const r = (p.ramo ?? '').trim().toLowerCase()
  return esRamoDeInmueble(r) || r === '' || r === 'otros'
}

const fechaIso = (d: Date) => d.toISOString().slice(0, 10)

/** El estado de UN inmueble desde sus filas vivas y lo que esta identidad ve. La misma regla en la ficha y en Inicio. */
function estadoDeFilas(
  filas: readonly FilaEnlace[],
  porClave: ReadonlyMap<string, PolizaVisible>,
  sinSeguroDeclaradoEn: Date | null,
): EstadoSeguroInmueble {
  const enlaces = filas.map((f) => {
    const par = tipoDeFila(f)
    const v = par ? porClave.get(clave(par.tipo, par.id)) : undefined
    // Sin ver la póliza no se sabe si sigue en vigor: `null`, ni sí ni no.
    return { estado: f.estado, archivado: false, vigente: v ? v.vigente : null }
  })
  return estadoSeguroInmueble({ enlaces, sinSeguroDeclaradoEn })
}

/**
 * Los estados de TODOS los inmuebles que ve la identidad (tarjeta «Patrimonio» de Inicio). `visibles` `null` = la
 * cartera no se pudo leer: los enlaces de cartera quedan «sin comprobar», nunca «sin seguro».
 */
export function estadosDeInmuebles(
  inmuebles: readonly { id: string; sinSeguroDeclaradoEn: Date | null }[],
  filas: readonly (FilaEnlace & { inmuebleId: string })[],
  visibles: readonly PolizaVisible[],
): EstadoSeguroInmueble[] {
  const porClave = new Map(visibles.map((v) => [clave(v.tipo, v.id), v]))
  const porInmueble = new Map<string, FilaEnlace[]>()
  for (const f of filas) porInmueble.set(f.inmuebleId, [...(porInmueble.get(f.inmuebleId) ?? []), f])
  return inmuebles.map((i) => estadoDeFilas(porInmueble.get(i.id) ?? [], porClave, i.sinSeguroDeclaradoEn))
}

/** Todo lo que pinta la sección «Seguros» de la ficha. `null` = 404. */
export async function segurosDeInmueble(p: PuertosSegurosInmueble, idPedido: unknown): Promise<SegurosDeInmueble | null> {
  if (typeof idPedido !== 'string' || !UUID.test(idPedido)) return null
  const inm = await p.inmueble(idPedido)
  if (inm === null) return null
  const [filas, vis] = await Promise.all([p.enlaces(inm.id), p.visibles()])
  const visibles = [...(vis.cartera ?? []), ...(vis.declaradas ?? [])]
  const porClave = new Map(visibles.map((v) => [clave(v.tipo, v.id), v]))

  const enlaces: EnlacePintable[] = []
  for (const f of filas) {
    const par = tipoDeFila(f)
    const v = par ? porClave.get(clave(par.tipo, par.id)) : undefined
    if (f.estado === 'confirmado' && par) enlaces.push({ id: f.id, poliza: v ? pintable(v) : null })
  }
  const estado = estadoDeFilas(filas, porClave, inm.sinSeguroDeclaradoEn)

  const decisiones = filas.map(tipoDeFila).filter((x): x is { tipo: TipoPolizaEnlace; id: string } => x !== null)
  const confirmadas = new Set(
    filas.filter((f) => f.estado === 'confirmado').map(tipoDeFila).filter((x) => x !== null).map((x) => clave(x!.tipo, x!.id)),
  )
  const propuestas = proponerEnlaces(inm, visibles, decisiones).flatMap((pr) => {
    const v = porClave.get(clave(pr.tipo, pr.id))
    return v ? [{ ...pintable(v), origen: pr.origen }] : []
  })
  const yaPropuestas = new Set(propuestas.map((x) => clave(x.tipo, x.id)))

  return {
    inmuebleId: inm.id,
    alias: inm.alias,
    enComunidad: inm.enComunidad,
    estado,
    sinSeguroDeclaradoEn: inm.sinSeguroDeclaradoEn ? fechaIso(inm.sinSeguroDeclaradoEn) : null,
    enlaces,
    propuestas,
    enlazables: visibles
      .filter((v) => enlazable(v) && !confirmadas.has(clave(v.tipo, v.id)) && !yaPropuestas.has(clave(v.tipo, v.id)))
      .map(pintable),
    puedeEnlazar: puede(inm.nivel, 'enlazar_seguro'),
    sinComprobar: vis.cartera === null || vis.declaradas === null,
  }
}

/** `POST /api/patrimonio/inmuebles/[id]/seguros`. Acciones: `enlazar`, `quitar`, `sin_seguro`. */
export async function responderSegurosInmueble(p: PuertosSegurosInmueble, idPedido: unknown, cuerpo: unknown): Promise<Respuesta> {
  if (typeof idPedido !== 'string' || !UUID.test(idPedido)) return NO_ENCONTRADO
  const inm = await p.inmueble(idPedido)
  // Ajeno, inexistente o sin nivel para enlazar: la MISMA 404 (nunca 403).
  if (inm === null || !puede(inm.nivel, 'enlazar_seguro')) return NO_ENCONTRADO
  const c = cuerpo && typeof cuerpo === 'object' ? (cuerpo as Record<string, unknown>) : null
  if (c === null) return { status: 400, body: { error: 'datos_invalidos' } }

  if (c.accion === 'sin_seguro') {
    if (typeof c.valor !== 'boolean') return { status: 400, body: { error: 'datos_invalidos', campo: 'valor' } }
    await p.declararSinSeguro(inm.id, c.valor)
    return { status: 200, body: { ok: true } }
  }

  if (c.accion === 'quitar') {
    if (typeof c.enlaceId !== 'string' || !UUID.test(c.enlaceId)) return { status: 400, body: { error: 'datos_invalidos', campo: 'enlaceId' } }
    return (await p.archivarEnlace(inm.id, c.enlaceId)) ? { status: 200, body: { ok: true } } : NO_ENCONTRADO
  }

  if (c.accion === 'enlazar') {
    const tipo = c.tipo === 'cartera' || c.tipo === 'declarada' ? c.tipo : null
    if (tipo === null || typeof c.polizaId !== 'string' || !UUID.test(c.polizaId)) {
      return { status: 400, body: { error: 'datos_invalidos', campo: 'poliza' } }
    }
    if (!esEstadoDecisionSeguro(c.estado)) return { status: 400, body: { error: 'datos_invalidos', campo: 'estado' } }
    const vis = await p.visibles()
    const fuente = tipo === 'cartera' ? vis.cartera : vis.declaradas
    // No se ha podido leer lo que ves: no se puede comprobar que la póliza sea tuya → no se escribe nada.
    if (fuente === null) return { status: 503, body: { error: 'sin_comprobar' } }
    // 🚨 La póliza se busca DENTRO de lo que esta identidad ve. Si no está: 404, como si no existiera.
    const poliza = fuente.find((v) => v.id === c.polizaId)
    if (!poliza || !enlazable(poliza)) return NO_ENCONTRADO
    const filas = await p.enlaces(inm.id)
    const visibles = [...(vis.cartera ?? []), ...(vis.declaradas ?? [])]
    const decisiones = filas.map(tipoDeFila).filter((x): x is { tipo: TipoPolizaEnlace; id: string } => x !== null)
    const origen = origenAEscribir(c.origen, { tipo, id: poliza.id }, proponerEnlaces(inm, visibles, decisiones))
    const r = await p.crearEnlace({ inmuebleId: inm.id, tipo, polizaId: poliza.id, estado: c.estado, origen })
    if (r === 'duplicado') return { status: 409, body: { error: 'ya_existe' } }
    return { status: 201, body: { ok: true, origen } }
  }

  return { status: 400, body: { error: 'datos_invalidos', campo: 'accion' } }
}
