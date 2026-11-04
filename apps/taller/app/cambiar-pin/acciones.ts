'use server'
// Cambio del PIN propio. Sin `conPermiso`: es justo la pantalla a la que se manda a quien tiene un PIN temporal. Solo toca
// el usuario DE LA SESIÓN (nunca un id que llegue del navegador). Con PIN temporal (`debeCambiarPin`) basta la sesión; si no, exige
// el PIN ACTUAL y sus fallos cuentan en el bloqueo de esa persona (mismo que el login). Al cambiar, sube la versión de sesión y se
// reemite la cookie de ESTA sesión (las demás, con la versión vieja, dejan de valer).
import { cookies } from 'next/headers'
import { z } from 'zod'
import { conTaller } from '@/lib/db'
import { getSession } from '@/lib/session'
import { auditar, type TxConfig } from '@/lib/config-repo'
import { cambiarMiPin, ErrorPersonal, type TxCambioPin } from '@/lib/personal'
import { usuarioDeSesion } from '@/lib/acceso'
import { COOKIE_NAME, cookieOpts, renovarCookie } from '@/lib/sesion-cookie'

const Pin = z.string().regex(/^\d{4}$/)

export async function cambiarPinAccion(pin: unknown, pinActual?: unknown): Promise<{ ok: true } | { ok: false; errores: string[] }> {
  const p = Pin.safeParse(pin)
  if (!p.success) return { ok: false, errores: ['El PIN son 4 dígitos'] }
  const s = await getSession()
  if (!s) return { ok: false, errores: ['La sesión ha caducado. Vuelve a entrar con tu PIN'] }
  try {
    const ahora = new Date()
    const r = await conTaller(s.tallerId, async (tx) => {
      // Sesión vigente: activo y con la versión de la cookie (si cambiaron el PIN desde otro sitio, esta sesión ya no vale).
      if (!(await usuarioDeSesion(tx as never, s))) return { ok: false as const, error: 'La sesión ha caducado. Vuelve a entrar con tu PIN', caducada: true }
      const c = await cambiarMiPin(tx as unknown as TxCambioPin, { tallerId: s.tallerId, usuarioId: s.usuarioId, pinNuevo: p.data, pinActual, ahora })
      if (c.ok) {
        await auditar(tx as unknown as TxConfig, {
          tallerId: s.tallerId, usuarioId: s.usuarioId, entidad: 'usuarios_taller', entidadId: s.usuarioId, accion: 'cambio_pin_propio',
          antes: null, despues: { pin: 'cambiado' },
        })
      }
      return c
    }, { timeout: 20_000 })
    if (!r.ok) return { ok: false, errores: [r.error] }
    const jar = await cookies()
    jar.set(COOKIE_NAME, await renovarCookie({ ...s, sv: r.sesionVersion }, ahora), cookieOpts(Math.max(1, Math.ceil((s.exp - ahora.getTime()) / 60_000))))
    return { ok: true }
  } catch (e) {
    if (e instanceof ErrorPersonal) return { ok: false, errores: [e.message] }
    console.error('[cambiar-pin]', e)
    return { ok: false, errores: ['No se pudo cambiar el PIN. Inténtalo de nuevo'] }
  }
}
