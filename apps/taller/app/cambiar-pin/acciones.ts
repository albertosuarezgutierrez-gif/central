'use server'
// Cambio del PIN propio. Sin `conPermiso`: es justo la pantalla a la que se manda a quien tiene un PIN temporal. Solo toca
// el usuario DE LA SESIÓN (nunca un id que llegue del navegador).
import { z } from 'zod'
import { conTaller } from '@/lib/db'
import { getSession } from '@/lib/session'
import { auditar, type TxConfig } from '@/lib/config-repo'
import { cambiarMiPin, ErrorPersonal, type TxPersonal } from '@/lib/personal'

const Pin = z.string().regex(/^\d{4}$/)

export async function cambiarPinAccion(pin: unknown): Promise<{ ok: true } | { ok: false; errores: string[] }> {
  const p = Pin.safeParse(pin)
  if (!p.success) return { ok: false, errores: ['El PIN son 4 dígitos'] }
  const s = await getSession()
  if (!s) return { ok: false, errores: ['La sesión ha caducado. Vuelve a entrar con tu PIN'] }
  try {
    await conTaller(s.tallerId, async (tx) => {
      await cambiarMiPin(tx as unknown as TxPersonal, { tallerId: s.tallerId, usuarioId: s.usuarioId, pinNuevo: p.data })
      await auditar(tx as unknown as TxConfig, {
        tallerId: s.tallerId, usuarioId: s.usuarioId, entidad: 'usuarios_taller', entidadId: s.usuarioId, accion: 'cambio_pin_propio',
        antes: null, despues: { pin: 'cambiado' },
      })
    }, { timeout: 20_000 })
    return { ok: true }
  } catch (e) {
    if (e instanceof ErrorPersonal) return { ok: false, errores: [e.message] }
    console.error('[cambiar-pin]', e)
    return { ok: false, errores: ['No se pudo cambiar el PIN. Inténtalo de nuevo'] }
  }
}
