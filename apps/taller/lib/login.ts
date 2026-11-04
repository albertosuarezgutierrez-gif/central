// Login por PIN de un taller: TODO (bloqueo, verificación, registro) en UNA transacción con RLS del taller.
import { loginConPin, type ResultadoLoginPin } from '@central/core-identity/pin'
import { configDeAlta } from '@central/module-taller'
import { esTallerId, type ConTaller } from './rls.ts'
import { claveBloqueoPin, crearPinStoreBd, type TxPin } from './pin-store-bd.ts'
import {
  anotarFalloUsuario, leerBloqueoUsuario, limpiarBloqueoUsuario, politicaUsuario, usuarioBloqueado, type TxBloqueoUsuario, type TxConfigUsuario,
} from './bloqueo-usuario.ts'
import type { PoliticaTope } from './tope-taller.ts'
import { anotarFalloTope, leerTope, topeBloqueado, type TxTope } from './tope-taller.ts'

/** PBKDF2 × mecánicos del taller dentro de la transacción: margen sobre los 5 s por defecto de Prisma. */
const TIMEOUT_LOGIN_MS = 15_000

type TxConfigLogin = {
  configuracion?: {
    findUnique(a: unknown): Promise<{ loginMaxFallosTaller: number; loginVentanaMinutos: number; loginBloqueoTallerMinutos: number } | null>
  }
}

/** Política del tope por taller: la de su configuración; sin fila de configuración, la de ALTA (nunca «sin tope»). */
async function politicaTope(tx: TxConfigLogin, tallerId: string): Promise<PoliticaTope> {
  const c = await tx.configuracion?.findUnique({ where: { tallerId } })
  if (!c) return configDeAlta().seguridadLogin
  return { maxFallosTaller: c.loginMaxFallosTaller, ventanaMinutos: c.loginVentanaMinutos, bloqueoMinutos: c.loginBloqueoTallerMinutos }
}

/** Usuarios que se enseñan en el paso 2 del login: solo ACTIVOS del taller (RLS), con nombre; ni rol ni nada más. */
export async function listarUsuariosLogin(
  conTaller: ConTaller<{ usuarioTaller: { findMany(a: unknown): Promise<Array<{ id: string; nombre: string }>> } }>, tallerId: string,
): Promise<Array<{ id: string; nombre: string }>> {
  const xs = await conTaller(tallerId, (tx) =>
    tx.usuarioTaller.findMany({ where: { tallerId, activo: true }, orderBy: { nombre: 'asc' }, select: { id: true, nombre: true } }))
  return xs.map((u) => ({ id: u.id, nombre: u.nombre }))
}

export type ResultadoLoginTaller =
  | ResultadoLoginPin
  // `usuario`: ese usuario no existe en el taller o está de baja. `ambito`: quién bloquea (para el mensaje).
  | { ok: false; motivo: 'usuario' }
type Bloqueo = { ok: false; motivo: 'bloqueado'; minutos: number; ambito: 'taller' | 'usuario' | 'ip' }
export type ResultadoLoginTallerCompleto = Exclude<ResultadoLoginTaller, { motivo: 'bloqueado' }> | Bloqueo

type TxAviso = { auditoria?: { create(a: { data: Record<string, unknown> }): Promise<unknown> } }

/**
 * Login taller → usuario → PIN, TODO en UNA transacción con RLS del taller. Orden de candados (siempre el mismo, sin interbloqueos):
 * taller → usuario → IP. Cada PIN fallado cuenta para el taller, para ESA persona y para la IP; el PIN ya no identifica a nadie
 * (se verifica solo contra el hash del usuario elegido).
 */
export function loginTaller<Tx extends TxPin & TxConfigLogin & TxBloqueoUsuario & TxConfigUsuario & TxAviso & Pick<TxTope, '$executeRaw'>>(
  conTaller: ConTaller<Tx>,
  o: { tallerId: string; usuarioId: unknown; ip: string; pin: unknown; ahora: Date },
): Promise<ResultadoLoginTallerCompleto> {
  return conTaller(
    o.tallerId,
    async (tx): Promise<ResultadoLoginTallerCompleto> => {
      const usuarioId = o.usuarioId
      if (!esTallerId(usuarioId)) return { ok: false, motivo: 'usuario' }
      // 1) Tope del TALLER (todas las IP): si está bloqueado, ni se mira el PIN.
      const tope = tx as unknown as TxTope
      const previa = await leerTope(tope, o.tallerId)
      const b = topeBloqueado(previa, o.ahora)
      if (b.bloqueado) return { ok: false, motivo: 'bloqueado', minutos: b.minutos, ambito: 'taller' }
      // 2) Usuario: existe, activo y no bloqueado.
      const [u] = await tx.usuarioTaller.findMany({
        where: { tallerId: o.tallerId, activo: true, id: usuarioId }, select: { id: true, pinHash: true, rol: true, nombre: true, sesionVersion: true },
      })
      if (!u) return { ok: false, motivo: 'usuario' }
      const previoUsuario = await leerBloqueoUsuario(tx, o.tallerId, usuarioId)
      const bu = usuarioBloqueado(previoUsuario, o.ahora)
      if (bu.bloqueado) return { ok: false, motivo: 'bloqueado', minutos: bu.minutos, ambito: 'usuario' }
      // 3) Bloqueo por IP + verificación contra el hash de ESE usuario.
      const claveIp = claveBloqueoPin(o.tallerId, o.ip)
      const ipYaBloqueada = (await tx.bloqueoPin.findUnique({ where: { tallerId_clave: { tallerId: o.tallerId, clave: claveIp } } }))
        ?.bloqueadoHasta
      const r = await loginConPin(crearPinStoreBd(tx, o.tallerId), {
        tenantId: o.tallerId, usuarioId, claveBloqueo: claveIp, pin: o.pin, ahora: o.ahora,
      })
      if (r.ok) {
        if (previoUsuario.intentos > 0 || previoUsuario.bloqueadoHasta) await limpiarBloqueoUsuario(tx, o.tallerId, usuarioId)
        return r
      }
      // 4) Cada PIN FALLADO cuenta para el taller y para la persona (también el que dispara el bloqueo por IP; no el rechazado por IP ya bloqueada).
      const ipBloqueadaAntes = !!ipYaBloqueada && ipYaBloqueada.getTime() > o.ahora.getTime()
      if (r.motivo === 'bloqueado' && ipBloqueadaAntes) return { ...r, ambito: 'ip' }
      if (r.motivo === 'formato') return r
      const pol = await politicaTope(tx, o.tallerId)
      const n = await anotarFalloTope(tope, o.tallerId, previa, o.ahora, pol)
      if (n.bloqueadoHasta) await avisarDueno(tx, o.tallerId, 'tope_taller_bloqueado', { hasta: n.bloqueadoHasta.toISOString(), fallos: n.intentos })
      const nu = await anotarFalloUsuario(tx, o.tallerId, usuarioId, previoUsuario, o.ahora, await politicaUsuario(tx, o.tallerId))
      // (Si llega aquí es que antes NO estaba bloqueado: `bloqueadoHasta` presente = este fallo lo acaba de bloquear.)
      if (nu.bloqueadoHasta) await avisarDueno(tx, o.tallerId, 'usuario_bloqueado', { usuarioId, hasta: nu.bloqueadoHasta.toISOString() })
      if (r.motivo === 'bloqueado') return { ...r, ambito: 'ip' } // este fallo acaba de bloquear la IP
      if (n.bloqueadoHasta) return { ok: false, motivo: 'bloqueado', minutos: Math.ceil((n.bloqueadoHasta.getTime() - o.ahora.getTime()) / 60_000), ambito: 'taller' }
      if (nu.bloqueadoHasta) return { ok: false, motivo: 'bloqueado', minutos: Math.ceil((nu.bloqueadoHasta.getTime() - o.ahora.getTime()) / 60_000), ambito: 'usuario' }
      return r
    },
    { timeout: TIMEOUT_LOGIN_MS },
  )
}

/** Aviso al DUEÑO (se ve como banner en Ajustes mientras dure): fila de auditoría `aviso_dueno`. Nunca lleva PIN ni hash. */
async function avisarDueno(tx: TxAviso, tallerId: string, accion: string, despues: Record<string, unknown>) {
  await tx.auditoria?.create({ data: { tallerId, usuarioId: null, entidad: 'aviso_dueno', accion, antes: null, despues } })
}

type TxSesion = { configuracion: { findUnique(a: unknown): Promise<{ loginSesionMinutos: number; loginInactividadMinutos: number } | null> } }

/** Sesión del taller: la de su configuración; sin fila, la de ALTA (nunca «sin caducidad»). */
export async function politicaSesion(conTaller: ConTaller<TxSesion>, tallerId: string): Promise<{ sesionMinutos: number; inactividadMinutos: number }> {
  const c = await conTaller(tallerId, (tx) => tx.configuracion.findUnique({ where: { tallerId } }))
  if (!c) { const a = configDeAlta().seguridadLogin; return { sesionMinutos: a.sesionMinutos, inactividadMinutos: a.inactividadMinutos } }
  return { sesionMinutos: c.loginSesionMinutos, inactividadMinutos: c.loginInactividadMinutos }
}
