'use server'
// Acciones de OT por <form action>. Cada una: sesión → conPermiso (rol re-leído en BD) → servicio de lib/ordenes.
// El mecánico NUNCA elige a quién se imputa el parte: es el usuario de la sesión.
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { almacenActivo, mimeReal } from '@/lib/almacen'
import { conPermiso, configDe, mensajeDeAcceso } from '@/lib/contexto'
import { exigir, capacidadParaTransicion } from '@/lib/permisos'
import { auditar, type TxConfig } from '@/lib/config-repo'
import {
  anadirFotos, anadirNota, descartarPropuesta, enviarPropuesta, ErrorTrabajo, proponerAmpliacion, type FotoSubida, type TxTrabajo,
} from '@/lib/trabajo-ot'
import { abrirParteMecanico, cambiarEstadoOt, cerrarParteMecanico, type TxOrdenes } from '@/lib/ordenes'
import { entregarOt, MAX_FIRMA_BYTES, type TxEntrega } from '@/lib/entrega'

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
    else {
      // Stock que quedó en negativo al cerrar la OT: se dice (nunca en silencio); la OT SÍ queda cerrada.
      const av = (r as { avisosStock?: { descripcion: string; stockNuevo: number }[] }).avisosStock
      if (av?.length) msg = `Orden cerrada. Ojo, el stock de ${av.map((a) => `«${a.descripcion}»`).join(', ')} queda en negativo: revisa el inventario en Artículos`
    }
  } catch (e) {
    msg = mensajeDeAcceso(e)
    if (!msg) { console.error('[ordenes]', e); msg = 'No se pudo completar. Inténtalo de nuevo' }
  }
  return volver(otId, msg)
}

/**
 * Cambio de estado a mano. Recepción solo puede en_curso→terminado y terminado→entregado (`ordenes_avanzar`); cualquier otra
 * transición exige `ordenes_gestionar` (dueño). La capacidad se decide en SERVIDOR con el estado ACTUAL de la OT en BD.
 */
export async function cambiarEstadoAccion(fd: FormData): Promise<void> {
  const id = Id.safeParse(fd.get('otId'))
  const hacia = z.string().max(40).safeParse(fd.get('hacia'))
  if (!id.success || !hacia.success) return volver(null, 'Datos inválidos')
  // La entrega lleva la firma de retirada y tiene su propia acción: por aquí no se puede saltar.
  if (hacia.data === 'entregado') return volver(id.data, 'La entrega se hace desde el botón «Entregar el vehículo», con la firma de quien retira')
  await ejecutar(id.data, () =>
    conPermiso('ordenes_avanzar', async (tx, c) => {
      const ot = await tx.ordenTrabajo.findFirst({ where: { tallerId: c.tallerId, id: id.data }, select: { estado: true } })
      if (!ot) return { ok: false as const, motivo: 'orden no encontrada' }
      const cap = capacidadParaTransicion(ot.estado, hacia.data)
      if (cap !== 'ordenes_avanzar') await exigir(tx as never, c, cap)
      return cambiarEstadoOt(tx as unknown as TxOrdenes, { tallerId: c.tallerId, otId: id.data, hacia: hacia.data, ahora: new Date(), usuarioId: c.usuarioId })
    }),
  )
}

/**
 * Entrega del vehículo con la firma de retirada (terminado → entregado). Misma capacidad que el cambio de estado a mano; la firma
 * (PNG real, ≤ 1 MB) se exige o no según la configuración del taller, que se lee en SERVIDOR.
 */
export async function entregarOtAccion(fd: FormData): Promise<RespuestaTrabajo | void> {
  const id = Id.safeParse(fd.get('otId'))
  const nombre = z.string().max(200).safeParse(fd.get('nombre') ?? '')
  const version = z.string().max(100).safeParse(fd.get('versionTexto') ?? '')
  const vence = z.string().max(10).safeParse(fd.get('vencimientoSeguro') ?? '')
  if (!id.success || !nombre.success || !version.success || !vence.success) return { ok: false, errores: ['Datos inválidos'] }
  let firma: { mime: string; bytes: Uint8Array } | null = null
  const f = fd.get('firma')
  if (f instanceof File && f.size > 0) {
    if (f.size > MAX_FIRMA_BYTES) return { ok: false, errores: ['La firma pesa demasiado'] }
    const bytes = new Uint8Array(await f.arrayBuffer())
    if (mimeReal(bytes) !== 'image/png') return { ok: false, errores: ['La firma no es una imagen válida'] }
    firma = { mime: 'image/png', bytes }
  }
  let msg: string | null = null
  try {
    msg = await conPermiso('ordenes_avanzar', async (tx, c) => {
      const ot = await tx.ordenTrabajo.findFirst({ where: { tallerId: c.tallerId, id: id.data }, select: { estado: true } })
      if (!ot) return 'orden no encontrada'
      const cap = capacidadParaTransicion(ot.estado, 'entregado')
      if (cap !== 'ordenes_avanzar') await exigir(tx as never, c, cap)
      const config = await configDe(tx, c.tallerId)
      if (!config) return 'El taller no tiene configuración de alta'
      const r = await entregarOt(tx as unknown as TxEntrega, almacenActivo(), config, {
        tallerId: c.tallerId, otId: id.data, ahora: new Date(), retira: { nombre: nombre.data, firma }, versionTextoVista: version.data || null,
        usuarioId: c.usuarioId, vencimientoSeguro: vence.data || null,
      })
      return r.ok ? null : r.motivo
    }, { timeout: 40_000 })
  } catch (e) {
    msg = mensajeDeAcceso(e)
    if (!msg) { console.error('[ordenes/entrega]', e); msg = 'No se pudo completar. Inténtalo de nuevo' }
  }
  if (msg) return { ok: false, errores: [msg] }
  return volver(id.data, null)
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

// ── El mecánico en su OT: notas, fotos y propuestas de ampliación (sin precios) ──
export type RespuestaTrabajo<T = object> = ({ ok: true } & T) | { ok: false; errores: string[] }

async function trabajo<T extends object>(fn: () => Promise<T>): Promise<RespuestaTrabajo<T>> {
  try {
    const r = await fn()
    revalidatePath('/ordenes')
    return { ok: true, ...r }
  } catch (e) {
    const m = mensajeDeAcceso(e)
    if (m) return { ok: false, errores: [m] }
    if (e instanceof ErrorTrabajo) return { ok: false, errores: [e.message] }
    console.error('[ordenes/trabajo]', e)
    return { ok: false, errores: ['No se pudo completar. Inténtalo de nuevo'] }
  }
}

const MAX_FOTO = 6 * 1024 * 1024
const MAX_FOTOS = 12

async function fotosDe(fd: FormData, notas: string[]): Promise<FotoSubida[]> {
  const fotos: FotoSubida[] = []
  for (let i = 0; i < MAX_FOTOS; i++) {
    const f = fd.get(`foto_${i}`)
    if (!(f instanceof File) || f.size === 0) continue
    if (f.size > MAX_FOTO) throw new ErrorTrabajo('Una foto pesa demasiado')
    const bytes = new Uint8Array(await f.arrayBuffer())
    const mime = mimeReal(bytes) // el tipo real, no el que diga el navegador
    if (!mime) throw new ErrorTrabajo('Las fotos deben ser JPG, PNG o WebP')
    fotos.push({ mime, nombre: f.name || 'foto', bytes, nota: notas[i] ?? null, capturadaEn: new Date() })
  }
  return fotos
}

/** Nota de la OT. La escribe (o dicta y CONFIRMA) la persona: el servidor solo recibe el texto que pulsó «Guardar». */
export async function anadirNotaAccion(otId: unknown, texto: unknown): Promise<RespuestaTrabajo> {
  const id = Id.safeParse(otId), t = z.string().max(2000).safeParse(texto)
  if (!id.success || !t.success) return { ok: false, errores: ['Datos inválidos'] }
  return trabajo(() => conPermiso('ot_trabajo', async (tx, c) => {
    await anadirNota(tx as unknown as TxTrabajo, { tallerId: c.tallerId, usuarioId: c.usuarioId, otId: id.data, texto: t.data })
    return {}
  }))
}

export async function anadirFotosAccion(fd: FormData): Promise<RespuestaTrabajo<{ n: number }>> {
  const id = Id.safeParse(fd.get('otId'))
  if (!id.success) return { ok: false, errores: ['Datos inválidos'] }
  return trabajo(async () => {
    const fotos = await fotosDe(fd, [])
    return conPermiso('ot_trabajo', async (tx, c) => ({
      n: await anadirFotos(tx as unknown as TxTrabajo, almacenActivo(), { tallerId: c.tallerId, usuarioId: c.usuarioId, otId: id.data, fotos }),
    }))
  })
}

const Propuesta = z.object({
  otId: z.string().uuid(),
  explicacion: z.string().max(2000),
  lineas: z.array(z.object({ descripcion: z.string().min(1).max(200), referencia: z.string().max(80).nullable().optional(), cantidad: z.number().int().positive().max(9999) })).min(1).max(40),
  notasFotos: z.array(z.string().max(200)).max(MAX_FOTOS).optional(),
})

/** Propuesta de piezas/ampliación SIN precios: queda «pendiente de enviar» para recepción/dueño. */
export async function proponerAmpliacionAccion(fd: FormData): Promise<RespuestaTrabajo<{ propuestaId: string }>> {
  let crudo: unknown
  try { crudo = JSON.parse(String(fd.get('datos') ?? '')) } catch { return { ok: false, errores: ['Datos inválidos'] } }
  const p = Propuesta.safeParse(crudo)
  if (!p.success) return { ok: false, errores: ['Datos inválidos'] }
  return trabajo(async () => {
    const fotos = await fotosDe(fd, p.data.notasFotos ?? [])
    return conPermiso('ot_trabajo', async (tx, c) => ({
      propuestaId: await proponerAmpliacion(tx as unknown as TxTrabajo, almacenActivo(), {
        tallerId: c.tallerId, usuarioId: c.usuarioId, otId: p.data.otId, explicacion: p.data.explicacion, lineas: p.data.lineas, fotos,
      }),
    }), { timeout: 40_000 })
  })
}

const Envio = z.object({
  propuestaId: z.string().uuid(),
  precios: z.array(z.object({ orden: z.number().int().positive(), precioUnitarioCent: z.number().int().nonnegative().safe() })).min(1).max(40),
})

/** Recepción/dueño pone precio y manda la propuesta al cliente. El token del enlace se devuelve UNA vez. */
export async function enviarPropuestaAccion(entrada: unknown): Promise<RespuestaTrabajo<{ ruta: string }>> {
  const p = Envio.safeParse(entrada)
  if (!p.success) return { ok: false, errores: ['Datos inválidos'] }
  return trabajo(() => conPermiso('ampliaciones', async (tx, c) => {
    const config = await configDe(tx, c.tallerId)
    if (!config) throw new ErrorTrabajo('El taller no tiene configuración de alta')
    const r = await enviarPropuesta(tx as unknown as TxTrabajo, { tallerId: c.tallerId, propuestaId: p.data.propuestaId, precios: p.data.precios, config, ahora: new Date() })
    if (!r.ok) throw new ErrorTrabajo(r.errores.join(' · '))
    await auditar(tx as unknown as TxConfig, {
      tallerId: c.tallerId, usuarioId: c.usuarioId, entidad: 'presupuestos', entidadId: r.presupuestoId, accion: 'ampliacion_enviada', antes: null, despues: { propuestaId: p.data.propuestaId },
    })
    return { ruta: `/p/${r.token}` }
  }))
}

export async function descartarPropuestaAccion(propuestaId: unknown): Promise<RespuestaTrabajo> {
  const id = Id.safeParse(propuestaId)
  if (!id.success) return { ok: false, errores: ['Datos inválidos'] }
  return trabajo(() => conPermiso('ampliaciones', async (tx, c) => {
    await descartarPropuesta(tx as unknown as TxTrabajo, { tallerId: c.tallerId, propuestaId: id.data })
    return {}
  }))
}
