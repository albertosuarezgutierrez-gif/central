// Login por PIN de un taller: TODO (bloqueo, verificación, registro) en UNA transacción con RLS del taller.
import { loginConPin, type ResultadoLoginPin } from '@central/core-identity/pin'
import { configDeAlta } from '@central/module-taller'
import { esTallerId, type ConTaller } from './rls.ts'
import { claveBloqueoPin, crearPinStoreBd, type TxPin } from './pin-store-bd.ts'
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

export function loginTaller<Tx extends TxPin & TxConfigLogin & Pick<TxTope, '$executeRaw'>>(
  conTaller: ConTaller<Tx>,
  o: { tallerId: string; ip: string; pin: unknown; ahora: Date },
): Promise<ResultadoLoginPin> {
  return conTaller(
    o.tallerId,
    async (tx) => {
      // 1) Tope del TALLER (todas las IP): si está bloqueado, ni se mira el PIN.
      const tope = tx as unknown as TxTope
      const previa = await leerTope(tope, o.tallerId)
      const b = topeBloqueado(previa, o.ahora)
      if (b.bloqueado) return { ok: false, motivo: 'bloqueado', minutos: b.minutos }
      // 2) Bloqueo por IP + verificación (como antes).
      const claveIp = claveBloqueoPin(o.tallerId, o.ip)
      const ipYaBloqueada = (await tx.bloqueoPin.findUnique({ where: { tallerId_clave: { tallerId: o.tallerId, clave: claveIp } } }))
        ?.bloqueadoHasta
      const r = await loginConPin(crearPinStoreBd(tx, o.tallerId), {
        tenantId: o.tallerId, claveBloqueo: claveIp, pin: o.pin, ahora: o.ahora,
      })
      // 3) Cada PIN FALLADO cuenta para el taller (también el que dispara el bloqueo por IP; no el rechazado por IP ya bloqueada).
      const ipBloqueadaAntes = !!ipYaBloqueada && ipYaBloqueada.getTime() > o.ahora.getTime()
      if (!r.ok && r.motivo !== 'formato' && !ipBloqueadaAntes) {
        const n = await anotarFalloTope(tope, o.tallerId, previa, o.ahora, await politicaTope(tx, o.tallerId))
        if (n.bloqueadoHasta && r.motivo === 'incorrecto') return { ok: false, motivo: 'bloqueado', minutos: Math.ceil((n.bloqueadoHasta.getTime() - o.ahora.getTime()) / 60_000) }
      }
      return r
    },
    { timeout: TIMEOUT_LOGIN_MS },
  )
}

type TxSesion = { configuracion: { findUnique(a: unknown): Promise<{ loginSesionMinutos: number; loginInactividadMinutos: number } | null> } }

/** Sesión del taller: la de su configuración; sin fila, la de ALTA (nunca «sin caducidad»). */
export async function politicaSesion(conTaller: ConTaller<TxSesion>, tallerId: string): Promise<{ sesionMinutos: number; inactividadMinutos: number }> {
  const c = await conTaller(tallerId, (tx) => tx.configuracion.findUnique({ where: { tallerId } }))
  if (!c) { const a = configDeAlta().seguridadLogin; return { sesionMinutos: a.sesionMinutos, inactividadMinutos: a.inactividadMinutos } }
  return { sesionMinutos: c.loginSesionMinutos, inactividadMinutos: c.loginInactividadMinutos }
}

/** Taller de ESTE despliegue/dispositivo (F1: uno, por configuración). null si falta o no es uuid: sin login. */
export function tallerDelDespliegue(env: Record<string, string | undefined> = process.env): string | null {
  const v = env.TALLER_PILOTO_ID?.trim()
  return esTallerId(v) ? v : null
}
