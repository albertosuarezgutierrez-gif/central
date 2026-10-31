// Felicitación de cumpleaños a EX-CLIENTES (Alberto, 30/10/2026: «felicitar también a los ex-clientes con un
// mensaje de reconquista»). Reglas PURAS (sin BD ni red): las lee `node --test` y las usa
// `felicitaciones-exclientes.ts`.
//
//  - Población: persona física con alguna póliza pero SIN cartera en vigor (la cartera en vigor ya la felicita
//    `felicitaciones.ts`: no se solapan). Leads sin póliza: fuera. Sin más exclusiones (decisión de Alberto).
//  - Variante: `posible_cliente` si alguna de sus pólizas está en estado vigente pero no es cartera viva (volcado
//    sin EIAC: puede ser un cliente real que CIMA no trae) → no se le dice «ya no tienes tus seguros con nosotros».
//    El resto, `ex_cliente`, con la frase de reconquista.
//  - Puerta `ASEGURA_FELICITACIONES_EXCLIENTES`: sin valor → nada; `aprobar` → Telegram con botones, sin enviar;
//    `auto` → envía.
import { esCarteraEnVigor, esCarteraViva, esEstadoVigente, MEDIADOR, type EntradaCarteraEnVigor } from '@central/module-seguros'

export type ModoExclientes = 'apagado' | 'aprobar' | 'auto'
export const ENV_EXCLIENTES = 'ASEGURA_FELICITACIONES_EXCLIENTES'

/** Cualquier valor que no sea exactamente `aprobar` o `auto` = apagado (fail-closed: un typo no envía). */
export function modoExclientes(v: string | undefined = process.env[ENV_EXCLIENTES]): ModoExclientes {
  const m = v?.trim().toLowerCase()
  return m === 'aprobar' || m === 'auto' ? m : 'apagado'
}

/** Nombre de pila para el saludo; un centinela del volcado («Lead») no es un nombre. */
export function nombreDePila(nombre: string | null): string | null {
  const n = nombre?.trim().split(/\s+/)[0] ?? ''
  if (!n || /^lead$/i.test(n)) return null
  return n.charAt(0).toUpperCase() + n.slice(1).toLowerCase()
}

/** «María» + «López García» → «M. L. G.». Para Telegram: sin apellidos enteros. */
export function iniciales(nombre: string | null, apellidos: string | null): string {
  return `${nombre ?? ''} ${apellidos ?? ''}`.trim().split(/\s+/).filter((w) => /^\p{L}/u.test(w)).map((w) => `${w.charAt(0).toUpperCase()}.`).join(' ')
}

export type VarianteExcliente = 'ex_cliente' | 'posible_cliente'

/**
 * Qué felicitación le toca a una persona según TODAS sus pólizas (no fusionadas). `null` = no entra:
 * sin pólizas (lead) o con alguna en cartera en vigor (la felicita el cron de clientes).
 */
export function varianteExcliente(polizas: readonly EntradaCarteraEnVigor[]): VarianteExcliente | null {
  if (polizas.length === 0) return null
  if (polizas.some((p) => esCarteraEnVigor(p))) return null
  const vigenteNoViva = polizas.some((p) => !esCarteraViva(p) && p.estado != null && esEstadoVigente(p.estado))
  return vigenteNoViva ? 'posible_cliente' : 'ex_cliente'
}

/** Una propuesta pendiente solo se envía el MISMO día del cumpleaños (`dia` y `hoy` en `YYYY-MM-DD`, Madrid). */
export function propuestaDelDia(dia: string, hoy: string): boolean {
  return dia === hoy
}

/** `+34637349990` → `637 349 990`, siempre desde MEDIADOR (nunca a mano). Otro formato: tal cual. */
export function telefonoCorto(t: string = MEDIADOR.identidad.telefono): string {
  const m = /^\+34(\d{3})(\d{3})(\d{3})$/.exec(t)
  return m ? `${m[1]} ${m[2]} ${m[3]}` : t
}

// ─── Telegram ────────────────────────────────────────────────────────────────

export const PREFIJO_FEX = 'fex'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** callback_data ≤ 64 bytes: `fex_ok:<uuid>:<año>` = 48. */
export function botonesExcliente(clienteId: string, anio: number): { texto: string; callback: string }[][] {
  return [[
    { texto: '✅ Enviar', callback: `${PREFIJO_FEX}_ok:${clienteId}:${anio}` },
    { texto: '❌ Descartar', callback: `${PREFIJO_FEX}_no:${clienteId}:${anio}` },
  ]]
}

const escaparTg = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** Resumen para Alberto (HTML de Telegram): nombre de pila e iniciales, variante y el texto que saldría. Sin email ni NIF. */
export function textoPropuestaTelegram(p: { nombre: string | null; iniciales: string; variante: VarianteExcliente; texto: string }): string {
  const quien = `${p.nombre ?? 'Sin nombre'} (${p.iniciales || '—'})`
  const etiqueta = p.variante === 'ex_cliente' ? 'ex-cliente · reconquista' : 'posible cliente (póliza vigente fuera de CIMA)'
  return `🎂 <b>¿Felicito a ${escaparTg(quien)}?</b>\n${escaparTg(etiqueta)}\n\n<i>${escaparTg(p.texto)}</i>\n\nSolo sale si pulsas ✅ (hoy).`
}

export type DecisionFex = { decision: 'ok' | 'no'; clienteId: string; anio: number }

/** Lee `fex_<ok|no>:<uuid>:<año>` ya partido por `parseCallback`. `null` = botón no válido. */
export function leerBotonFex(accion: string, args: readonly string[]): DecisionFex | null {
  if ((accion !== 'ok' && accion !== 'no') || args.length !== 2) return null
  const [clienteId, a] = args
  const anio = Number(a)
  if (!UUID.test(clienteId) || !/^\d{4}$/.test(a) || anio < 2026) return null
  return { decision: accion, clienteId, anio }
}
