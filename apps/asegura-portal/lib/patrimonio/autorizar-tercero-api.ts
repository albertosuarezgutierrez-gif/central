// Patrimonio (27/10/2026) — el TITULAR autoriza a otra persona a GESTIONAR o a tener TODO su patrimonio. Lógica PURA (puertos
// inyectados, sin prisma ni sesión): `GET/POST /api/patrimonio/autorizaciones` y `POST /api/patrimonio/autorizaciones/[id]`.
// La BD real está en `autorizar-tercero-bd.ts`; las reglas del alcance, en `@central/module-patrimonio` (`autorizar-tercero.ts`).
//
// Reutiliza el flujo de la invitación del portal, sin atajos: correo escrito a mano → fila en `portal_invitacion` (token HASHEADO)
// → correo con el enlace → el invitado entra con SU correo y un código → acepta (`responderInvitacion`, doble firma) → nace la
// `portal_autorizacion` por IDENTIDAD con su texto sellado. Revocar es un sello (`revocado_en`) que `accesosPatrimonio` lee en
// cada petición: el acceso se corta en la siguiente.
//
// 🚨 SOLO EL TITULAR CONCEDE. El titular del cuerpo es una PETICIÓN: se busca DENTRO de `autorizables()` (= `titularesAutorizables`:
// ficha propia que opera o Dueño, nunca por nivel). Quien entra por una autorización Total lo ve todo pero NO está ahí → la MISMA
// 404 que un titular inventado (nunca 403). Cepo: `test/regression-portal-patrimonio-autorizar.test.ts`.
// 🚨 Orden de la invitación (el de `crearInvitacion`): forma → ENLACE (sin enlace no se escribe nada) → cupo → no a ti mismo →
// no repetida → fila → correo. `envio_fallido` = la fila SÍ está escrita (502, `registrada: true`).
import { destinoValido, normalizarMensajeInvitacion, normalizarNombreInvitado } from '@central/module-seguros-portal'
import {
  ALCANCES_PATRIMONIO,
  NOMBRE_ALCANCE_PATRIMONIO,
  QUE_PUEDE_PATRIMONIO,
  alcancePatrimonio,
  type AlcancePatrimonio,
} from '@central/module-patrimonio'

import type { Respuesta } from './gastos-api.ts'

const NO_ENCONTRADO: Respuesta = { status: 404, body: { error: 'no_encontrado' } }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' ? (v as Record<string, unknown>) : {})

/** Tope de invitaciones por identidad y día: el MISMO freno que la invitación de la bóveda (se cuenta la tabla entera). */
export const MAX_INVITACIONES_PATRIMONIO_DIA = 10

export type TitularAutorizable = { clienteId: string; nombre: string | null }

/** Un acceso concedido (vivo o pendiente). `nombre` = cómo lo llamó el titular al invitar; `null` = no consta. */
export type AccesoConcedido = { id: string; clienteId: string; alcance: AlcancePatrimonio; nombre: string | null; desde: Date }
/** Una invitación sin contestar. No lleva el correo: solo se guarda su hash. */
export type InvitacionPendiente = { id: string; clienteId: string; alcance: AlcancePatrimonio; nombre: string | null; caducaEn: Date }
/** Un acceso que me han dado A MÍ. `titular` = nombre de la ficha; `null` = no consta. */
export type AccesoRecibido = { id: string; alcance: AlcancePatrimonio; titular: string | null; desde: Date }

export interface PuertosAutorizarPatrimonio {
  /** `titularesAutorizables(identidad.id)` con el nombre de cada ficha. */
  autorizables(): Promise<TitularAutorizable[]>
  ahora(): Date
  /** Solo dentro de `clientesIds` (ya autorizables). Alcances de patrimonio sin revocar, vigentes o por aceptar. */
  concedidos(clientesIds: readonly string[]): Promise<AccesoConcedido[]>
  /** Invitaciones de patrimonio que ESTA identidad mandó y siguen sin contestar ni caducar. */
  pendientes(clientesIds: readonly string[]): Promise<InvitacionPendiente[]>
  /** Accesos de patrimonio vigentes con `autorizado_identidad_id` = yo. */
  recibidos(): Promise<AccesoRecibido[]>
  token(): string
  /** `null` = sin `PORTAL_PUBLIC_URL` https: no hay enlace y no se escribe nada. */
  enlace(token: string): string | null
  hashCanal(email: string): string
  hashToken(token: string): string
  /** Invitaciones (de cualquier tipo) que esta identidad creó desde `desde`. */
  enviadasDesde(desde: Date): Promise<number>
  /** ¿El correo es uno de MIS canales? */
  esMiCorreo(canalHash: string): Promise<boolean>
  /** ¿La identidad de ese correo ya tiene ESE alcance vivo sobre ESE titular? */
  yaAutorizado(x: { clienteId: string; alcance: AlcancePatrimonio; canalHash: string }): Promise<boolean>
  /** La fila. `'ya_invitado'` = el índice único de invitaciones vivas (P2002). */
  crearInvitacion(x: {
    clienteId: string
    alcance: AlcancePatrimonio
    canalHash: string
    tokenHash: string
    invitadoNombre: string | null
    mensaje: string | null
    creadaEn: Date
  }): Promise<{ id: string } | 'ya_invitado'>
  enviarCorreo(email: string, x: { invitante: string | null; invitado: string | null; alcance: AlcancePatrimonio; mensaje: string | null; enlace: string }): Promise<boolean>
  /**
   * Revoca un acceso de patrimonio. Lo puede el titular (otorgante dentro de `clientesIds`) o el propio autorizado (yo).
   * `'no_encontrada'` = no es un acceso de patrimonio de ninguno de los dos lados; `'ya_revocada'` = ya no estaba vivo.
   */
  revocar(x: { autorizacionId: string; clientesIds: readonly string[] }): Promise<'ok' | 'no_encontrada' | 'ya_revocada'>
}

/** La pantalla: a quién puedo autorizar, a quién he autorizado, qué invitaciones siguen sin contestar y qué me han dado a mí. */
export async function responderListar(p: PuertosAutorizarPatrimonio): Promise<Respuesta> {
  const titulares = await p.autorizables()
  const ids = titulares.map((t) => t.clienteId)
  // Sin `catch`: una lectura caída sube como 500. Un `[]` de consuelo diría «no has autorizado a nadie» cuando puede que sí,
  // y sobre eso decide si revoca.
  const [concedidos, pendientes, recibidos] = await Promise.all([
    ids.length > 0 ? p.concedidos(ids) : Promise.resolve([]),
    ids.length > 0 ? p.pendientes(ids) : Promise.resolve([]),
    p.recibidos(),
  ])
  return {
    status: 200,
    body: {
      titulares,
      concedidos,
      pendientes,
      recibidos,
      niveles: ALCANCES_PATRIMONIO.map((a) => ({ alcance: a, nombre: NOMBRE_ALCANCE_PATRIMONIO[a], quePuede: QUE_PUEDE_PATRIMONIO[a] })),
    },
  }
}

const no = (status: number, error: string, mensaje: string, registrada = false): Respuesta => ({
  status,
  body: { error, mensaje, registrada },
})

/** El titular invita. Cuerpo: `{ titularClienteId, alcance, email, invitadoNombre, mensaje? }`. */
export async function responderInvitar(p: PuertosAutorizarPatrimonio, cuerpo: unknown): Promise<Respuesta> {
  const b = obj(cuerpo)
  // ── 1. Forma, sin BD ────────────────────────────────────────────────────
  const alcance = alcancePatrimonio(b.alcance)
  const email = typeof b.email === 'string' ? b.email.trim() : ''
  const invitadoNombre = normalizarNombreInvitado(b.invitadoNombre)
  if (alcance === null || typeof b.titularClienteId !== 'string' || !UUID.test(b.titularClienteId)) {
    return no(400, 'datos_invalidos', 'No hemos entendido qué acceso querías dar. Vuelve a cargar la pantalla.')
  }
  if (email === '' || !destinoValido('email', email)) {
    return no(400, 'datos_invalidos', 'Escribe un correo electrónico válido.')
  }
  if (invitadoNombre === null) {
    return no(400, 'datos_invalidos', 'Escribe cómo se llama esa persona: así la reconocerás en tu lista.')
  }

  // ── 2. 🚨 Solo el titular: el del cuerpo se busca DENTRO de los autorizables. Fuera = 404, nunca 403 ─────────────
  const titular = (await p.autorizables()).find((t) => t.clienteId === b.titularClienteId)
  if (!titular) return NO_ENCONTRADO

  // ── 3. El enlace, ANTES de escribir nada ─────────────────────────────────
  const token = p.token()
  const enlace = p.enlace(token)
  if (enlace === null) {
    return no(503, 'sin_enlace', 'Ahora mismo no podemos mandar invitaciones. Escríbenos y lo revisamos: no hemos guardado nada.')
  }

  // ── 4. Cupo por la IDENTIDAD que invita ──────────────────────────────────
  const ahora = p.ahora()
  if ((await p.enviadasDesde(new Date(ahora.getTime() - 24 * 60 * 60 * 1000))) >= MAX_INVITACIONES_PATRIMONIO_DIA) {
    return no(429, 'limite_diario', 'Has mandado ya varias invitaciones hoy. Prueba de nuevo mañana.')
  }

  // ── 5. Ni a uno mismo ni lo que ya tiene ─────────────────────────────────
  const canalHash = p.hashCanal(email)
  if (await p.esMiCorreo(canalHash)) {
    return no(400, 'a_si_mismo', 'Ese correo es el tuyo: tu patrimonio ya lo gestionas tú.')
  }
  if (await p.yaAutorizado({ clienteId: titular.clienteId, alcance, canalHash })) {
    return no(409, 'ya_autorizado', 'Esa persona ya tiene ese acceso a tu patrimonio.')
  }

  // ── 6. La fila y, solo después, el correo ────────────────────────────────
  const mensaje = normalizarMensajeInvitacion(b.mensaje)
  const fila = await p.crearInvitacion({
    clienteId: titular.clienteId,
    alcance,
    canalHash,
    tokenHash: p.hashToken(token),
    invitadoNombre,
    mensaje,
    creadaEn: ahora,
  })
  if (fila === 'ya_invitado') {
    return no(409, 'ya_invitado', 'Ya le has mandado esta invitación a esa persona y sigue sin contestar.')
  }
  const enviado = await p.enviarCorreo(email, { invitante: titular.nombre, invitado: invitadoNombre, alcance, mensaje, enlace })
  if (!enviado) {
    return no(
      502,
      'envio_fallido',
      'La invitación está registrada, pero no hemos podido enviarle el correo. Avísale tú o escríbenos y lo reintentamos.',
      true,
    )
  }
  // Ni el token ni el correo vuelven en la respuesta.
  return { status: 201, body: { id: fila.id } }
}

/** Revocar: lo hace el titular (cualquier acceso suyo) o el propio autorizado (el suyo). Se corta al instante. */
export async function responderRevocar(p: PuertosAutorizarPatrimonio, autorizacionId: unknown, cuerpo: unknown): Promise<Respuesta> {
  if (typeof autorizacionId !== 'string' || !UUID.test(autorizacionId) || obj(cuerpo).accion !== 'revocar') {
    return no(400, 'datos_invalidos', 'No hemos entendido qué acceso querías quitar.')
  }
  const ids = (await p.autorizables()).map((t) => t.clienteId)
  const r = await p.revocar({ autorizacionId, clientesIds: ids })
  if (r === 'no_encontrada') return NO_ENCONTRADO
  if (r === 'ya_revocada') return no(409, 'ya_revocada', 'Ese acceso ya estaba quitado.')
  return { status: 200, body: { estado: 'revocada' } }
}
