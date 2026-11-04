'use server'
// Acciones de OT por <form action>. Cada una: sesión → conPermiso (rol re-leído en BD) → servicio de lib/ordenes.
// El mecánico NUNCA elige a quién se imputa el parte: es el usuario de la sesión.
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { conPermiso, mensajeDeAcceso } from '@/lib/contexto'
import { abrirParteMecanico, cambiarEstadoOt, cerrarParteMecanico, type TxOrdenes } from '@/lib/ordenes'

const Id = z.string().uuid()

function volver(otId: string | null, msg: string | null): never {
  const base = otId ? `/ordenes/${otId}` : '/ordenes'
  revalidatePath('/ordenes')
  if (otId) revalidatePath(base)
  redirect(msg ? `${base}?aviso=${encodeURIComponent(msg)}` : base)
}

async function ejecutar<T extends { ok: boolean } & ({ ok: true } | { ok: false; motivo: string })>(
  otId: string | null, fn: () => Promise<T>,
): Promise<never> {
  let msg: string | null = null
  try {
    const r = await fn()
    if (!r.ok) msg = (r as { motivo: string }).motivo
  } catch (e) {
    msg = mensajeDeAcceso(e)
    if (!msg) { console.error('[ordenes]', e); msg = 'No se pudo completar. Inténtalo de nuevo' }
  }
  return volver(otId, msg)
}

export async function cambiarEstadoAccion(fd: FormData): Promise<void> {
  const id = Id.safeParse(fd.get('otId'))
  const hacia = z.string().max(40).safeParse(fd.get('hacia'))
  if (!id.success || !hacia.success) return volver(null, 'Datos inválidos')
  await ejecutar(id.data, () =>
    conPermiso('ordenes_gestionar', (tx, c) =>
      cambiarEstadoOt(tx as unknown as TxOrdenes, { tallerId: c.tallerId, otId: id.data, hacia: hacia.data, ahora: new Date() })),
  )
}

export async function abrirMiParteAccion(fd: FormData): Promise<void> {
  const id = Id.safeParse(fd.get('otId'))
  if (!id.success) return volver(null, 'Datos inválidos')
  await ejecutar(id.data, () =>
    conPermiso('partes', (tx, c) =>
      abrirParteMecanico(tx as unknown as TxOrdenes, { tallerId: c.tallerId, mecanicoId: c.usuarioId, otId: id.data, ahora: new Date() })),
  )
}

export async function cerrarMiParteAccion(fd: FormData): Promise<void> {
  const id = Id.safeParse(fd.get('otId'))
  await ejecutar(id.success ? id.data : null, () =>
    conPermiso('partes', (tx, c) =>
      cerrarParteMecanico(tx as unknown as TxOrdenes, { tallerId: c.tallerId, mecanicoId: c.usuarioId, ahora: new Date() })),
  )
}
