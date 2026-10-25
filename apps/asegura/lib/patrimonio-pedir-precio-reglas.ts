// «Pedir precio» del patrimonio (24/10/2026, P14) — reglas PURAS del puente `POST /api/portal/patrimonio/pedir-precio`.
// Sin BD ni red: el cuerpo, el ramo que se pide y el texto de la tarea.
//
// 🚨 Lo que NO acepta ni escribe, a propósito:
//  · NO acepta `clienteId`, titular ni ficha: llegan `identidadId` + `inmuebleId` + `tipo`. La ficha dueña se saca del
//    inmueble en la BD, y el nivel de la identidad sobre ella se recalcula allí (`puedePatrimonio`, 'pedir_precio').
//  · NO usa `lead-declarada.ts`: ese módulo modela pólizas APORTADAS con vencimiento; un inmueble sin seguro no tiene
//    declarada. Esto crea una oportunidad como `mejorar-precio-portal.ts`.
//  · NO manda nada a nadie: crea la oportunidad y una tarea para la correduría. El contacto con el cliente lo decide
//    Alberto (el cliente lo pidió: es petición expresa) y sale de la correduría, no de aquí.
//  · NO escribe en la tarea la dirección, la referencia catastral NI EL ALIAS que puso el cliente (26/10/2026: un alias
//    como «Piso de mamá» identifica a una persona; la tarea queda en `gestiones`, que no se suprime por fila). Solo datos no
//    personales: tipo de inmueble + municipio + tipo de petición; el enlace a la ficha (`cliente_id`/`oportunidad_id`)
//    ya identifica, y el inmueble va a `info_riesgo` por id. Telegram, solo ids.

export const ORIGEN_PORTAL_PATRIMONIO = 'portal:patrimonio'
/**
 * Lista CERRADA de tipos, UNO POR LÍNEA. `comunidad` (25/10/2026): «Seguro de la comunidad» para quien marcó que
 * preside/administra la comunidad de un piso en edificio; ramo `comunidades`. No depende de que el piso tenga su propio
 * seguro: solo de que no haya YA uno de comunidad.
 */
export const TIPOS_PEDIR_PRECIO = [
  'inmueble_sin_seguro',
  'seguro_no_vigente',
  'comunidad',
  'comparar_externa',
  'impago_alquiler',
  'hipoteca',
] as const
export type TipoPedirPrecio = (typeof TIPOS_PEDIR_PRECIO)[number]

/** Los dos primeros nacieron con el origen sin sufijo (`portal:patrimonio`): se conserva para no romper su idempotencia. */
const TIPOS_ORIGEN_SIN_SUFIJO: readonly TipoPedirPrecio[] = ['inmueble_sin_seguro', 'seguro_no_vigente']

/** `info_riesgo.origen` de la oportunidad: los tipos nuevos llevan `portal:patrimonio:<tipo>` (origen claro en /correduria). */
export function origenPedirPrecio(tipo: TipoPedirPrecio): string {
  return TIPOS_ORIGEN_SIN_SUFIJO.includes(tipo) ? ORIGEN_PORTAL_PATRIMONIO : `${ORIGEN_PORTAL_PATRIMONIO}:${tipo}`
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type PeticionPedirPrecio =
  | { identidadId: string; tipo: 'comparar_externa'; polizaDeclaradaId: string }
  | { identidadId: string; tipo: Exclude<TipoPedirPrecio, 'comparar_externa'>; inmuebleId: string; contratoId?: string }

const valida = (v: unknown): v is string => typeof v === 'string' && UUID.test(v.trim())

export function validarPedirPrecio(cuerpo: unknown): { ok: true; datos: PeticionPedirPrecio } | { ok: false; campo: string } {
  const b = cuerpo && typeof cuerpo === 'object' && !Array.isArray(cuerpo) ? (cuerpo as Record<string, unknown>) : {}
  if (!valida(b.identidadId)) return { ok: false, campo: 'identidadId' }
  if (typeof b.tipo !== 'string' || !(TIPOS_PEDIR_PRECIO as readonly string[]).includes(b.tipo)) return { ok: false, campo: 'tipo' }
  const tipo = b.tipo as TipoPedirPrecio
  const identidadId = b.identidadId.trim()
  // La póliza declarada es de la identidad (no cuelga de un inmueble): se pide ella y nada más.
  if (tipo === 'comparar_externa') {
    if (!valida(b.polizaDeclaradaId)) return { ok: false, campo: 'polizaDeclaradaId' }
    return { ok: true, datos: { identidadId, tipo, polizaDeclaradaId: b.polizaDeclaradaId.trim() } }
  }
  if (!valida(b.inmuebleId)) return { ok: false, campo: 'inmuebleId' }
  const inmuebleId = b.inmuebleId.trim()
  if (tipo === 'impago_alquiler') {
    if (!valida(b.contratoId)) return { ok: false, campo: 'contratoId' }
    return { ok: true, datos: { identidadId, tipo, inmuebleId, contratoId: b.contratoId.trim() } }
  }
  return { ok: true, datos: { identidadId, tipo, inmuebleId } }
}

/** Qué objeto identifica la petición (idempotencia 120 días POR TIPO: el origen ya lleva el tipo en los nuevos). */
export function objetoDePeticion(d: PeticionPedirPrecio): { clave: 'inmuebleId' | 'contratoId' | 'polizaDeclaradaId'; id: string } {
  if (d.tipo === 'comparar_externa') return { clave: 'polizaDeclaradaId', id: d.polizaDeclaradaId }
  if (d.tipo === 'impago_alquiler' && d.contratoId) return { clave: 'contratoId', id: d.contratoId }
  return { clave: 'inmuebleId', id: d.inmuebleId }
}

/** Ramo (`tipo_seguro`) que se pide según el uso del inmueble. Lo que no se sabe clasificar es `hogar` (lo revisa Alberto). */
export function ramoDeUso(uso: string | null): 'hogar' | 'comercio' {
  return uso === 'local' || uso === 'oficina' || uso === 'nave' ? 'comercio' : 'hogar'
}

export type RamoPedido = 'hogar' | 'comercio' | 'comunidades'

/** Ramo (`tipo_seguro`) de la petición: `comunidad` pide el ramo comunidades sea cual sea el uso del inmueble. */
export function ramoDePeticion(tipo: TipoPedirPrecio, uso: string | null): RamoPedido {
  return tipo === 'comunidad' ? 'comunidades' : ramoDeUso(uso)
}

/** ¿Un ramo de póliza (texto libre de cartera o declarada) es de comunidad? */
export const esRamoComunidad = (ramo: string | null | undefined): boolean => ['comunidad', 'comunidades'].includes((ramo ?? '').trim().toLowerCase())

/**
 * Asegura no se fía de lo que el portal dijo de la comunidad: el inmueble tiene que ser un piso en edificio (la persona lo
 * marcó en comunidad o el Catastro lo dice) Y la persona haber marcado que es presidente/administrador. `null` = no consta
 * = no aplica.
 */
export function aplicaComunidad(x: { enComunidad: boolean | null; tipoCatastro: string | null; presidenteComunidad: boolean | null }): boolean {
  return x.presidenteComunidad === true && (x.enComunidad === true || x.tipoCatastro === 'piso')
}

/**
 * ¿Sigue habiendo un seguro en vigor enlazado? El portal ya lo comprobó, pero asegura no se fía: si hay una póliza
 * confirmada en vigor, el inmueble NO está sin seguro y no se abre ninguna petición. `vigencias`: una por enlace
 * CONFIRMADO vivo (`true` en vigor · `false` no · `null` no se pudo saber). Para `comunidad` el llamador pasa SOLO las
 * vigencias de las pólizas de ramo comunidad (la póliza de hogar del piso no impide pedir la de la comunidad).
 */
export function aplicaPedirPrecio(tipo: TipoPedirPrecio, vigencias: readonly (boolean | null)[]): boolean {
  if (vigencias.some((v) => v === true || v === null)) return false // en vigor, o no se sabe: no se afirma «sin seguro»
  return tipo === 'seguro_no_vigente' ? vigencias.length > 0 : true
}

/** Impago de alquiler: el contrato tiene que seguir vivo (sin `terminado_en` pasado). `hoy` y `terminadoEn` en `YYYY-MM-DD`. */
export function aplicaImpagoAlquiler(x: { terminadoEn: string | null; hoy: string }): boolean {
  return x.terminadoEn === null || x.terminadoEn >= x.hoy
}

/** Hipoteca: solo si el cliente dijo que SÍ la tiene. `no`, `no_se` y sin contestar (`null`) no abren nada. */
export function aplicaHipoteca(hipoteca: string | null): boolean {
  return hipoteca === 'si'
}

/**
 * Comparar una póliza de otra correduría: sirve con o sin vencimiento (el botón manual existe siempre). Solo se descarta
 * la que el cliente ya marcó como no vigente o la ya vencida sin confirmar (`declaradaVigente` falso).
 */
export function aplicaCompararExterna(vigente: boolean): boolean {
  return vigente
}

/** `2.162,49€` (formato de la casa). `null` = no consta. */
export function eurosEs(cent: number | null): string | null {
  if (cent === null || !Number.isFinite(cent) || cent <= 0) return null
  const [ent, dec] = (cent / 100).toFixed(2).split('.')
  return `${ent!.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${dec}€`
}

const fechaEs = (iso: string | null) => (iso && /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso.split('-').reverse().join('/') : null)

const QUE: Partial<Record<TipoPedirPrecio, string>> = {
  inmueble_sin_seguro: 'no tiene seguro (lo ha dicho el cliente)',
  seguro_no_vigente: 'tiene el seguro caducado',
  comunidad: 'está en una comunidad que preside o administra el cliente y no consta su seguro de comunidad en vigor',
}

const limpia = (t: string, n: number) => t.replace(/\s+/g, ' ').trim().slice(0, n)

const USO_LEGIBLE: Readonly<Record<string, string>> = {
  vivienda: 'vivienda', local: 'local', oficina: 'oficina', nave: 'nave', garaje: 'garaje', trastero: 'trastero',
}

/** Tipo de inmueble en llano. Un uso fuera del catálogo o sin dato es «inmueble» (no se inventa uno). */
export function usoLegible(uso: string | null): string {
  return (uso && USO_LEGIBLE[uso.trim().toLowerCase()]) || 'inmueble'
}

/**
 * Municipio sacado de `direccion_normalizada` («CL PARRA LA 12, 41003 SEVILLA (SEVILLA)», `componerDireccionNormalizada`
 * del portal y `componerDireccion` de la importación). Solo si el último tramo lleva un CP de 5 cifras delante: sin CP no se
 * distingue el municipio de un trozo de calle, y entonces `null` (= no consta; la tarea lo dice, no lo inventa).
 */
export function municipioDeDireccion(direccion: string | null): string | null {
  if (!direccion) return null
  const m = /,\s*\d{5}\s+([^,()]+?)\s*(?:\([^()]*\))?\s*$/.exec(direccion)
  const municipio = m?.[1] ? limpia(m[1], 60) : ''
  return municipio === '' ? null : municipio
}

/**
 * Texto de la tarea: tipo de inmueble + municipio + tipo de petición. 🚨 SIN el alias del cliente, la dirección, la ref.
 * catastral ni el nº de póliza (ver cabecera): quien la trabaja abre la ficha enlazada.
 */
export function textoTareaPrecioPatrimonio(x: {
  tipo: TipoPedirPrecio
  uso: string | null
  municipio: string | null
  ramo: string
  rentaCent?: number | null
  compania?: string | null
  vence?: string | null
}): string {
  const inmueble = `${usoLegible(x.uso)} ${x.municipio ? `en ${limpia(x.municipio, 60)}` : '(municipio no consta)'}`
  const pidio = 'Lo ha pedido él desde Patrimonio en el portal.'
  switch (x.tipo) {
    case 'comparar_externa': {
      const v = fechaEs(x.vence ?? null)
      const c = x.compania ? limpia(x.compania, 60) : null
      return `Comparar una póliza de otra correduría${c ? ` (${c})` : ''}${v ? `, vence el ${v}` : ', sin vencimiento conocido'}. ${pidio} Ramo: ${x.ramo}.`
    }
    case 'impago_alquiler': {
      const r = eurosEs(x.rentaCent ?? null)
      return `Seguro de impago de alquiler / defensa jurídica del arrendador: ${inmueble} con un contrato de alquiler vivo${r ? ` (renta ${r}/mes)` : ''}. ${pidio}`
    }
    case 'hipoteca':
      return `Revisar los seguros de hogar y vida ligados a la hipoteca: ${inmueble}, el cliente dice que tiene hipoteca y quiere ver si se pueden mejorar. ${pidio}`
    default:
      return `Pedir precio de seguro de ${x.ramo}: ${inmueble}, ${QUE[x.tipo] ?? ''}. ${pidio}`
  }
}

/** Nota de la ficha (`historial_interno`) por tipo. */
export function textoHistorialPedirPrecio(tipo: TipoPedirPrecio): string {
  switch (tipo) {
    case 'comparar_externa': return 'Pidió desde Patrimonio (portal) que le comparen una póliza de otra correduría.'
    case 'impago_alquiler': return 'Pidió desde Patrimonio (portal) un seguro de impago de alquiler para un contrato suyo.'
    case 'hipoteca': return 'Pidió desde Patrimonio (portal) revisar los seguros de hogar y vida de la hipoteca de un inmueble.'
    default: return 'Pidió desde Patrimonio (portal) que le pasen precio de seguro para uno de sus inmuebles.'
  }
}

/**
 * `GET /api/portal/patrimonio/pedir-precio?identidadId=` (25/10/2026): solo la identidad, nada más. Un `clienteId` o un
 * `inmuebleId` en la query se IGNORA: la ficha sale de `portal_vinculo` en asegura, nunca de quien llama.
 */
export function identidadDeConsulta(url: string): string | null {
  let v: string | null
  try {
    v = new URL(url).searchParams.get('identidadId')
  } catch {
    return null
  }
  const t = v?.trim() ?? ''
  return UUID.test(t) ? t : null
}

/** Telegram a Alberto: SOLO ids (sin nombre ni dirección). */
export function textoAvisoPedirPrecio(x: { oportunidadId: string; inmuebleId?: string | null; tipo?: TipoPedirPrecio }): string {
  return `🏠 Petición desde Patrimonio (portal)${x.tipo ? ` · ${x.tipo}` : ''}\nOportunidad ${x.oportunidadId}${x.inmuebleId ? `\nInmueble ${x.inmuebleId}` : ''}\nMírala en plataforma /correduria → Hoy.`
}
