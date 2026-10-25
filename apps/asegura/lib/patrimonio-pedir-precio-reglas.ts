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
export const TIPOS_PEDIR_PRECIO = ['inmueble_sin_seguro', 'seguro_no_vigente'] as const
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

/**
 * ¿Sigue habiendo un seguro en vigor enlazado? El portal ya lo comprobó, pero asegura no se fía: si hay una póliza
 * confirmada en vigor, el inmueble NO está sin seguro y no se abre ninguna petición. `vigencias`: una por enlace
 * CONFIRMADO vivo (`true` en vigor · `false` no · `null` no se pudo saber).
 */
export function aplicaPedirPrecio(tipo: TipoPedirPrecio, vigencias: readonly (boolean | null)[]): boolean {
  if (vigencias.some((v) => v === true || v === null)) return false // en vigor, o no se sabe: no se afirma «sin seguro»
  return tipo === 'seguro_no_vigente' ? vigencias.length > 0 : true
}

const QUE: Record<TipoPedirPrecio, string> = {
  inmueble_sin_seguro: 'no tiene seguro (lo ha dicho el cliente)',
  seguro_no_vigente: 'tiene el seguro caducado',
}

/** Texto de la tarea: el alias que puso el cliente y el motivo. Sin dirección, ref. catastral ni nº de póliza. */
export function textoTareaPrecioPatrimonio(x: { tipo: TipoPedirPrecio; alias: string; ramo: 'hogar' | 'comercio' }): string {
  const alias = x.alias.replace(/\s+/g, ' ').trim().slice(0, 80)
  return `Pedir precio de seguro de ${x.ramo}: el inmueble «${alias}» ${QUE[x.tipo]}. Lo ha pedido él desde Patrimonio en el portal.`
}

/** Telegram a Alberto: SOLO ids (sin nombre ni dirección). */
export function textoAvisoPedirPrecio(x: { oportunidadId: string; inmuebleId: string }): string {
  return `🏠 Petición de precio desde Patrimonio (portal)\nOportunidad ${x.oportunidadId}\nInmueble ${x.inmuebleId}\nMírala en plataforma /correduria → Hoy.`
}
