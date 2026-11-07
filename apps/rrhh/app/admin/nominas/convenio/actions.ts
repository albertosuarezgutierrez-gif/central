'use server'
// Acciones de servidor de «Tablas del convenio». La empresa sale SIEMPRE de `getSesion()` (nunca del formulario).
import { revalidatePath } from 'next/cache'
import { getSesion, AuthError } from '@/lib/tenant'
import { parsearFilaConvenio } from '@/lib/convenio-tablas'
import { borrarFilaConvenio, guardarFilaConvenio } from '@/lib/convenio-tablas-repo'

export type ResultadoAccion = { ok: true } | { ok: false; error: string }

export async function guardarFila(datos: Record<string, unknown>): Promise<ResultadoAccion> {
  try {
    const { empresa_id, usuario_id } = await getSesion()
    const fila = parsearFilaConvenio(datos)
    await guardarFilaConvenio(empresa_id, fila, usuario_id)
    revalidatePath('/admin/nominas/convenio')
    return { ok: true }
  } catch (e) {
    if (e instanceof AuthError) return { ok: false, error: 'Sesión caducada: vuelve a entrar' }
    if (e instanceof Error && /inválid|Indica|Pagas/.test(e.message)) return { ok: false, error: e.message }
    console.error('[convenio] guardar', e instanceof Error ? e.message : e)
    return { ok: false, error: 'No se pudo guardar la fila' }
  }
}

export async function borrarFila(id: string): Promise<ResultadoAccion> {
  try {
    const { empresa_id } = await getSesion()
    if (!/^[0-9a-f-]{36}$/i.test(id)) return { ok: false, error: 'Fila inválida' }
    const n = await borrarFilaConvenio(empresa_id, id)
    revalidatePath('/admin/nominas/convenio')
    return n ? { ok: true } : { ok: false, error: 'Fila no encontrada' }
  } catch (e) {
    if (e instanceof AuthError) return { ok: false, error: 'Sesión caducada: vuelve a entrar' }
    console.error('[convenio] borrar', e instanceof Error ? e.message : e)
    return { ok: false, error: 'No se pudo borrar la fila' }
  }
}
