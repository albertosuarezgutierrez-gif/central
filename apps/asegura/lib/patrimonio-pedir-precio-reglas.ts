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
//  · NO escribe la dirección, la referencia catastral ni nada del inmueble en la tarea: solo el alias que puso el
//    cliente (que va a `info_riesgo` por id, no por texto). Telegram, solo ids.

export const ORIGEN_PORTAL_PATRIMONIO = 'portal:patrimonio'
// `comunidad` (25/10/2026): «Seguro de la comunidad» para quien marcó que preside/administra la comunidad de un piso en
// edificio; ramo `comunidades`. No depende de que el piso tenga su propio seguro: solo de que no haya YA uno de comunidad.
export const TIPOS_PEDIR_PRECIO = ['inmueble_sin_seguro', 'seguro_no_vigente', 'comunidad'] as const
export type TipoPedirPrecio = (typeof TIPOS_PEDIR_PRECIO)[number]

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type PeticionPedirPrecio = { identidadId: string; inmuebleId: string; tipo: TipoPedirPrecio }

export function validarPedirPrecio(cuerpo: unknown): { ok: true; datos: PeticionPedirPrecio } | { ok: false; campo: string } {
  const b = cuerpo && typeof cuerpo === 'object' && !Array.isArray(cuerpo) ? (cuerpo as Record<string, unknown>) : {}
  if (typeof b.identidadId !== 'string' || !UUID.test(b.identidadId.trim())) return { ok: false, campo: 'identidadId' }
  if (typeof b.inmuebleId !== 'string' || !UUID.test(b.inmuebleId.trim())) return { ok: false, campo: 'inmuebleId' }
  if (typeof b.tipo !== 'string' || !(TIPOS_PEDIR_PRECIO as readonly string[]).includes(b.tipo)) return { ok: false, campo: 'tipo' }
  return { ok: true, datos: { identidadId: b.identidadId.trim(), inmuebleId: b.inmuebleId.trim(), tipo: b.tipo as TipoPedirPrecio } }
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

const QUE: Record<TipoPedirPrecio, string> = {
  inmueble_sin_seguro: 'no tiene seguro (lo ha dicho el cliente)',
  seguro_no_vigente: 'tiene el seguro caducado',
  comunidad: 'está en una comunidad que preside o administra el cliente y no consta su seguro de comunidad en vigor',
}

/** Texto de la tarea: el alias que puso el cliente y el motivo. Sin dirección, ref. catastral ni nº de póliza. */
export function textoTareaPrecioPatrimonio(x: { tipo: TipoPedirPrecio; alias: string; ramo: RamoPedido }): string {
  const alias = x.alias.replace(/\s+/g, ' ').trim().slice(0, 80)
  return `Pedir precio de seguro de ${x.ramo}: el inmueble «${alias}» ${QUE[x.tipo]}. Lo ha pedido él desde Patrimonio en el portal.`
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
export function textoAvisoPedirPrecio(x: { oportunidadId: string; inmuebleId: string }): string {
  return `🏠 Petición de precio desde Patrimonio (portal)\nOportunidad ${x.oportunidadId}\nInmueble ${x.inmuebleId}\nMírala en plataforma /correduria → Hoy.`
}
