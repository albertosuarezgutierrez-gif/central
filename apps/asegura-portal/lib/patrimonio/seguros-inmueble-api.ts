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
  alertaInfraseguro,
  esPisoEnEdificio,
  estimarContinenteMinimo,
  ofreceSeguroComunidad,
  esEstadoDecisionSeguro,
  esRamoDeInmueble,
  estadoSeguroInmueble,
  origenAEscribir,
  proponerEnlaces,
  puede,
  type AlertaInfraseguro,
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
  /**
   * Capital de CONTINENTE en céntimos (`capital-continente.ts`). `null`/ausente = no consta (nunca 0). Solo sirve para
   * la alerta de infraseguro: no se pinta en la lista.
   */
  capitalContinenteCent?: number | null
  /** Coste anual del seguro en céntimos, anualidad `desde`→`vence`. `null`/ausente = no consta o no visible a tu nivel. Solo rentabilidad. */
  costeAnualCent?: number | null
  /** `YYYY-MM-DD` del efecto de la anualidad. `null`/ausente = no consta. */
  desde?: string | null
}

/** Lo que se pinta de una póliza (sin ref. catastral ni nada que sirva para casar). */
export type PolizaPintable = Omit<PolizaVisible, 'referenciaCatastral' | 'capitalContinenteCent' | 'costeAnualCent' | 'desde'>

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
  /** Valor de reconstrucción estimado (céntimos). `null`/ausente = sin m² del Catastro: no se estima. */
  valorReconstruccionCent?: number | null
  /** Uso del inmueble (`USOS_INMUEBLE`); decide la fila del catálogo de coste de reconstrucción. */
  uso?: string
  /** m² construidos que contestó el Catastro (caché). `null`/ausente = no se sabe. */
  superficieCatastroM2?: number | null
  /** Lo que el Catastro dice de la vivienda (caché). `null`/ausente = no se sabe. */
  tipoCatastro?: 'piso' | 'unifamiliar' | null
  /** La persona dice que preside/administra la comunidad. `null`/ausente = no lo ha dicho. */
  presidenteComunidad?: boolean | null
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
  /** «Soy presidente/administrador de la comunidad» de ESE inmueble ya autorizado. */
  declararPresidenteComunidad(inmuebleId: string, valor: boolean): Promise<void>
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
  /**
   * Alerta de infraseguro con el capital de la póliza ENLAZADA y en vigor (P14). `null` = no aplica (sin seguro
   * enlazado en vigor): sin póliza no hay capital que comparar.
   */
  infraseguro: AlertaInfraseguro | null
  capitalContinenteCent: number | null
  valorEstimadoCent: number | null
  /**
   * De dónde sale el valor estimado cuando es la ESTIMACIÓN por m² del Catastro (siempre una estimación; `porVerificar`
   * mientras el catálogo de €/m² no lo confirme Alberto). `null` = el valor es el que dio la persona, o no hay.
   */
  estimacionContinente: { superficieM2: number; eurPorM2: number; porVerificar: boolean } | null
  /** La persona preside/administra la comunidad (`null` = no lo ha dicho). */
  presidenteComunidad: boolean | null
  /** Es un piso en edificio (comunidad marcada o Catastro). `null` = no se sabe. */
  enPisoEnEdificio: boolean | null
  /** «Seguro de la comunidad»: presidente + piso + sin póliza de comunidad en vigor. Pide precio con tipo `comunidad`. */
  ofreceComunidad: boolean
  /** «Pedir precio»: inmueble sin seguro (o con el seguro caducado) y nivel `total`. */
  puedePedirPrecio: boolean
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

  const vigentes = filas
    .filter((f) => f.estado === 'confirmado')
    .map((f) => {
      const par = tipoDeFila(f)
      return par ? porClave.get(clave(par.tipo, par.id)) : undefined
    })
    .filter((v): v is PolizaVisible => v !== undefined && v.vigente === true)
  const esComunidad = (v: PolizaVisible) => ['comunidad', 'comunidades'].includes((v.ramo ?? '').trim().toLowerCase())
  // El capital del propio inmueble: el mayor de sus pólizas en vigor que NO son de comunidad (su continente es el edificio).
  const capitales = vigentes.filter((v) => !esComunidad(v)).map((v) => v.capitalContinenteCent).filter((c): c is number => typeof c === 'number' && c > 0)
  const capital = capitales.length > 0 ? Math.max(...capitales) : null
  const dadoPorLaPersona = typeof inm.valorReconstruccionCent === 'number' ? inm.valorReconstruccionCent : null
  // Sin valor propio, la estimación por m² del Catastro (cacheada en el inmueble): superficie × €/m² del catálogo.
  const est = dadoPorLaPersona === null && inm.uso !== undefined
    ? estimarContinenteMinimo({ superficieM2: inm.superficieCatastroM2, uso: inm.uso, tipoVivienda: inm.tipoCatastro ?? null })
    : null
  const valorEstimado = dadoPorLaPersona ?? est?.capitalCent ?? null
  // ¿Hay una póliza de comunidad EN VIGOR enlazada? `null` = alguna no se pudo comprobar (no se ofrece nada).
  const comunidadesEnlazadas = filas
    .filter((f) => f.estado === 'confirmado')
    .map((f) => {
      const par = tipoDeFila(f)
      return par ? porClave.get(clave(par.tipo, par.id)) : undefined
    })
  const polizaComunidadVigente: boolean | null =
    vis.cartera === null || vis.declaradas === null
      ? null
      : comunidadesEnlazadas.some((v) => v === undefined || (esComunidad(v) && v.vigente === null))
        ? null
        : comunidadesEnlazadas.some((v) => v !== undefined && esComunidad(v) && v.vigente === true)
  const enPiso = esPisoEnEdificio({ enComunidad: inm.enComunidad, tipoCatastro: inm.tipoCatastro ?? null })
  const infraseguro =
    vigentes.length === 0
      ? null
      : alertaInfraseguro({ capitalContinente: capital, valorEstimado, enComunidad: inm.enComunidad, polizaComunidadEnlazada: vigentes.some(esComunidad) })

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
    infraseguro,
    capitalContinenteCent: capital,
    valorEstimadoCent: valorEstimado,
    estimacionContinente: est === null ? null : { superficieM2: est.superficieM2, eurPorM2: est.eurPorM2, porVerificar: est.porVerificar },
    presidenteComunidad: inm.presidenteComunidad ?? null,
    enPisoEnEdificio: enPiso,
    ofreceComunidad: puede(inm.nivel, 'pedir_precio') && ofreceSeguroComunidad({ esPiso: enPiso, presidente: inm.presidenteComunidad ?? null, polizaComunidadVigente }),
    puedePedirPrecio: puede(inm.nivel, 'pedir_precio') && (estado === 'sin_seguro' || estado === 'con_seguro_no_vigente'),
    sinComprobar: vis.cartera === null || vis.declaradas === null,
  }
}

/** `POST /api/patrimonio/inmuebles/[id]/seguros`. Acciones: `enlazar`, `quitar`, `sin_seguro`, `presidente_comunidad`. */
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

  if (c.accion === 'presidente_comunidad') {
    if (typeof c.valor !== 'boolean') return { status: 400, body: { error: 'datos_invalidos', campo: 'valor' } }
    await p.declararPresidenteComunidad(inm.id, c.valor)
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
