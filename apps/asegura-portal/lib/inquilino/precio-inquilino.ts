// «El inquilino PIDE precio» (27/10/2026, punto 5 de docs/ESTUDIO-PATRIMONIO-MERCADO.md §7) — lógica PURA (puertos
// inyectados, sin prisma ni sesión). Ruta: `app/api/inquilino/[contratoId]/pedir-precio`; pantalla: `PedirPrecioInquilino.tsx`
// dentro de «Mi alquiler». El lado de la correduría es `apps/asegura/lib/patrimonio-inquilino-precio-*.ts`.
//
// 🚨 Dos cosas DISTINTAS que viajan en el mismo gesto y no se mezclan nunca:
//   1. La PETICIÓN de precio: la pide el interesado (medidas precontractuales, art. 6.1.b RGPD). Sirve SOLO para contestarle.
//      Va por el puente a asegura (ficha de lead nueva + tarea para Alberto). Lleva qué pide, su nombre y UN contacto.
//   2. El consentimiento COMERCIAL («Quiero recibir otras ofertas…»): casilla aparte, opcional, NO premarcada. Es el mismo
//      mecanismo que ya existía en «Mi alquiler» (`portal_patrimonio_inquilino_consentimiento`, versión
//      `VERSION_CONSENTIMIENTO_INQUILINO`, texto exacto). Solo se escribe si llega `ofertas === true` (ni `'true'`, ni `1`)
//      con la versión del texto vigente; desmarcada NO escribe nada (no es una retirada). NUNCA cruza el puente.
// 🚨 AISLAMIENTO: el contrato de la URL es una PETICIÓN; se busca DENTRO de los accesos vivos de la identidad de la cookie
// (`accesoParaContrato`). Ajeno, revocado o inexistente = la misma 404. Al puente no va NADA del contrato ni del propietario.
// 🚨 El propietario no ve ni la petición ni la casilla: ninguna ruta suya lee esto (cepo
// `test/regression-portal-inquilino-precio.test.ts`). Nada se envía al inquilino ni a terceros desde aquí.
import {
  VERSION_CONSENTIMIENTO_INQUILINO,
  accesoParaContrato,
  consentimientoAdmisible,
} from '@central/module-patrimonio'
import { normalizarEmail, normalizarNombre, normalizarTelefono } from '@central/module-seguros'

import type { PuertosInquilino } from './inquilino-api.ts'
import {
  CANALES_INQUILINO,
  MAX_NOMBRE_INQUILINO,
  QUE_PIDE_INQUILINO,
  type CanalInquilino,
  type QuePideInquilino,
} from './precio-inquilino-textos.ts'

export {
  CANALES_INQUILINO,
  ETIQUETA_QUE_PIDE,
  MAX_NOMBRE_INQUILINO,
  QUE_PIDE_INQUILINO,
  type CanalInquilino,
  type QuePideInquilino,
} from './precio-inquilino-textos.ts'

export const MAX_PETICIONES_PRECIO_HORA = 3

export type SolicitudPrecioInquilino = { que: QuePideInquilino; nombre: string; canal: CanalInquilino; contacto: string }

export type RevisionSolicitud =
  | { ok: true; solicitud: SolicitudPrecioInquilino; ofertas: boolean }
  | { ok: false; status: 400 | 409; error: string; campo?: string; motivo?: string }

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {})

/**
 * Revisa el cuerpo. `ofertas` es `true` SOLO si llega el booleano `true` Y la versión del texto que se vio es la vigente
 * (si no, 409 `texto_cambiado`: no se sella un «sí» a un texto que ya no es). Cualquier otra cosa = `false`.
 */
export function revisarSolicitudPrecioInquilino(cuerpo: unknown): RevisionSolicitud {
  const b = obj(cuerpo)
  if (typeof b.que !== 'string' || !(QUE_PIDE_INQUILINO as readonly string[]).includes(b.que)) {
    return { ok: false, status: 400, error: 'datos_invalidos', campo: 'que' }
  }
  const n = normalizarNombre(b.nombre)
  if (!n.ok || Array.from(n.valor).length > MAX_NOMBRE_INQUILINO || /[<>\p{Cc}]/u.test(n.valor)) {
    return { ok: false, status: 400, error: 'datos_invalidos', campo: 'nombre', motivo: n.ok ? 'El nombre es demasiado largo.' : n.motivo }
  }
  if (typeof b.canal !== 'string' || !(CANALES_INQUILINO as readonly string[]).includes(b.canal)) {
    return { ok: false, status: 400, error: 'datos_invalidos', campo: 'canal' }
  }
  const canal = b.canal as CanalInquilino
  const c = canal === 'correo' ? normalizarEmail(b.contacto) : normalizarTelefono(b.contacto)
  if (!c.ok) return { ok: false, status: 400, error: 'datos_invalidos', campo: 'contacto', motivo: c.motivo }
  const ofertas = b.ofertas === true
  if (ofertas && !consentimientoAdmisible(b.versionOfertas)) return { ok: false, status: 409, error: 'texto_cambiado' }
  return { ok: true, solicitud: { que: b.que as QuePideInquilino, nombre: n.valor, canal, contacto: c.valor }, ofertas }
}

/** Lo que el gesto escribe en el consentimiento comercial: SOLO un «sí» explícito; desmarcado no escribe (no es retirar). */
export function consentimientoDeLaSolicitud(ofertas: boolean): { concedido: true; versionTexto: string } | null {
  return ofertas === true ? { concedido: true, versionTexto: VERSION_CONSENTIMIENTO_INQUILINO } : null
}

export type ResultadoPuentePrecioInquilino =
  | { estado: 'ok'; pedidoEl: string; yaExistia: boolean }
  | { estado: 'invalido'; campo: string }
  | { estado: 'sin_puente' }
  | { estado: 'error' }

export interface PuertosPrecioInquilino
  extends Pick<PuertosInquilino, 'identidadId' | 'accesos' | 'vista' | 'consentimientos' | 'registrarConsentimiento'> {
  /** Va a asegura con la identidad de la COOKIE y la solicitud; NADA del contrato ni del propietario. */
  pedirPorPuente(x: { identidadId: string } & SolicitudPrecioInquilino): Promise<ResultadoPuentePrecioInquilino>
}

type Respuesta = { status: number; body: Record<string, unknown> }
const NO_ENCONTRADO: Respuesta = { status: 404, body: { error: 'no_encontrado' } }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function responderPedirPrecioInquilino(p: PuertosPrecioInquilino, contratoId: unknown, cuerpo: unknown): Promise<Respuesta> {
  if (typeof contratoId !== 'string' || !UUID.test(contratoId)) return NO_ENCONTRADO
  const a = accesoParaContrato(await p.accesos(), p.identidadId, contratoId)
  if (!a) return NO_ENCONTRADO
  // El contrato sigue vivo para esta identidad (mismo criterio que la pantalla); si no, la misma 404.
  if (!(await p.vista(a))) return NO_ENCONTRADO
  const r = revisarSolicitudPrecioInquilino(cuerpo)
  if (!r.ok) return { status: r.status, body: { error: r.error, ...(r.campo ? { campo: r.campo } : {}), ...(r.motivo ? { motivo: r.motivo } : {}) } }

  const puente = await p.pedirPorPuente({ identidadId: p.identidadId, ...r.solicitud })
  switch (puente.estado) {
    case 'ok':
      break
    case 'invalido':
      return { status: 400, body: { error: 'datos_invalidos', campo: puente.campo } }
    case 'sin_puente':
      return { status: 503, body: { error: 'sin_puente' } }
    default:
      return { status: 502, body: { error: 'puente_fallido' } }
  }

  // La petición ya está; el consentimiento es APARTE y solo si se marcó. Si su escritura falla, se dice (no se da por guardado).
  let ofertas: 'no_marcada' | 'guardada' | 'no_guardada' = 'no_marcada'
  const c = consentimientoDeLaSolicitud(r.ofertas)
  if (c) {
    try {
      await p.registrarConsentimiento({ acceso: a, concedido: c.concedido, versionTexto: c.versionTexto })
      ofertas = 'guardada'
    } catch {
      ofertas = 'no_guardada'
    }
  }
  return { status: puente.yaExistia ? 200 : 201, body: { ok: true, yaExistia: puente.yaExistia, pedidoEl: puente.pedidoEl, ofertas } }
}
