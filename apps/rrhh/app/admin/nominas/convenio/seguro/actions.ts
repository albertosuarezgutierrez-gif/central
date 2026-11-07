'use server'
// Acciones del seguro obligatorio por convenio. La empresa sale SIEMPRE de `getSesion()` (nunca del formulario).
import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { getSesion, AuthError } from '@/lib/tenant'
import {
  CONSENTIMIENTO_LEAD_VERSION, ErrorSeguroConvenio, cuerpoLead, parsearCobertura, parsearObligacion, resumenLead, type Afectados,
} from '@/lib/seguro-convenio'
import {
  borrarObligacion, cerrarLead, contarAfectados, datosParaLead, guardarCobertura, guardarObligacion, marcarSinObligacion, obligacionDe, reservarLead,
} from '@/lib/seguro-convenio-repo'
import { enviarLeadCorreduria } from '@/lib/lead-correduria'

export type ResultadoAccion = { ok: true; mensaje?: string } | { ok: false; error: string }

const RUTA = '/admin/nominas/convenio/seguro'
const esId = (id: unknown): id is string => typeof id === 'string' && /^[0-9a-f-]{36}$/i.test(id)

function fallo(e: unknown, que: string, generico: string): ResultadoAccion {
  if (e instanceof AuthError) return { ok: false, error: 'Sesión caducada: vuelve a entrar' }
  if (e instanceof ErrorSeguroConvenio) return { ok: false, error: e.message }
  console.error(`[seguro-convenio] ${que}`, e instanceof Error ? e.message : e)
  return { ok: false, error: generico }
}

function refrescar() { revalidatePath(RUTA); revalidatePath('/admin') }

export async function guardarObligacionAccion(id: string | null, datos: Record<string, unknown>): Promise<ResultadoAccion> {
  try {
    const { empresa_id, usuario_id } = await getSesion()
    if (id !== null && !esId(id)) return { ok: false, error: 'Obligación inválida' }
    const o = parsearObligacion(datos)
    const n = await guardarObligacion(empresa_id, id, o, usuario_id)
    if (!n) return { ok: false, error: 'Obligación no encontrada' }
    // Hay obligación: el «revisado, no obliga» anterior deja de ser verdad.
    if (id === null) await marcarSinObligacion(empresa_id, false, usuario_id)
    refrescar()
    return { ok: true }
  } catch (e) { return fallo(e, 'guardar', 'No se pudo guardar la obligación') }
}

/** «He revisado el convenio y no obliga a ningún seguro» (marcar=true) o deshacerlo. Solo sin obligaciones registradas. */
export async function sinObligacionAccion(marcar: boolean): Promise<ResultadoAccion> {
  try {
    const { empresa_id, usuario_id } = await getSesion()
    if (typeof marcar !== 'boolean') return { ok: false, error: 'Respuesta inválida' }
    await marcarSinObligacion(empresa_id, marcar, usuario_id)
    refrescar()
    return { ok: true }
  } catch (e) { return fallo(e, 'sin-obligacion', 'No se pudo guardar la respuesta') }
}

export async function borrarObligacionAccion(id: string): Promise<ResultadoAccion> {
  try {
    const { empresa_id } = await getSesion()
    if (!esId(id)) return { ok: false, error: 'Obligación inválida' }
    const n = await borrarObligacion(empresa_id, id)
    refrescar()
    return n ? { ok: true } : { ok: false, error: 'Obligación no encontrada' }
  } catch (e) { return fallo(e, 'borrar', 'No se pudo borrar la obligación') }
}

export async function guardarCoberturaAccion(id: string, datos: Record<string, unknown>): Promise<ResultadoAccion> {
  try {
    const { empresa_id, usuario_id } = await getSesion()
    if (!esId(id)) return { ok: false, error: 'Obligación inválida' }
    const c = parsearCobertura(datos)
    const n = await guardarCobertura(empresa_id, id, c, usuario_id)
    refrescar()
    return n ? { ok: true } : { ok: false, error: 'Obligación no encontrada' }
  } catch (e) { return fallo(e, 'cobertura', 'No se pudo guardar la respuesta') }
}

/**
 * «Quiero que Grupo ASegura me lo revise». Crea UN lead en plataforma con el consentimiento EXPLÍCITO del responsable
 * (`consentimiento === true`, booleano exacto: la casilla no viene marcada). No envía correo ni mensaje a nadie.
 */
export async function pedirRevisionAccion(id: string, datos: Record<string, unknown>): Promise<ResultadoAccion> {
  try {
    const { empresa_id, usuario_id } = await getSesion()
    if (!esId(id)) return { ok: false, error: 'Obligación inválida' }
    if (datos.consentimiento !== true) return { ok: false, error: 'Marca la casilla para aceptar el envío de los datos' }
    const nombre = typeof datos.nombre === 'string' ? datos.nombre.trim().replace(/\s+/g, ' ') : ''
    if (!nombre || nombre.length > 200) return { ok: false, error: 'Indica tu nombre' }
    const email = typeof datos.email === 'string' ? datos.email.trim() : ''
    const telefono = typeof datos.telefono === 'string' ? datos.telefono.trim() : ''
    if (!email && !telefono) return { ok: false, error: 'Deja un correo o un teléfono para que te contacten' }
    if (email.length > 200 || telefono.length > 30) return { ok: false, error: 'Revisa tu correo y tu teléfono' }

    const [o, emp] = await Promise.all([obligacionDe(empresa_id, id), datosParaLead(empresa_id, usuario_id)])
    if (!o || !emp) return { ok: false, error: 'Obligación no encontrada' }
    let afectados: Afectados = null
    try { afectados = await contarAfectados(empresa_id, o) } catch { afectados = null }
    const resumen = resumenLead({ empresa: emp.empresa, nif: emp.nif, o, afectados })

    const reserva = await reservarLead(empresa_id, id, usuario_id, CONSENTIMIENTO_LEAD_VERSION, resumen)
    if ('ya' in reserva) {
      return reserva.ya === 'enviado'
        ? { ok: true, mensaje: 'Ya se lo pediste a Grupo ASegura: te contactarán.' }
        : { ok: false, error: 'La petición se está enviando: espera un momento.' }
    }
    const ip = (await headers()).get('x-forwarded-for')?.split(',')[0]?.trim() || null
    const r = await enviarLeadCorreduria(cuerpoLead({ nombre, email: email || null, telefono: telefono || null }, o.tipo, resumen), ip)
    await cerrarLead(empresa_id, reserva.id, r.estado, r.detalle)
    refrescar()
    return r.estado === 'enviado' ? { ok: true, mensaje: r.mensaje } : { ok: false, error: r.mensaje }
  } catch (e) { return fallo(e, 'lead', 'No se ha podido enviar ahora mismo. Inténtalo de nuevo en unos minutos.') }
}
