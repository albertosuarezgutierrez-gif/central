'use server'
import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { fechaInputDe } from '@central/module-taller'
import { almacenActivo, MIME_ACEPTADOS } from '@/lib/almacen'
import { conPermiso, configDe, mensajeDeAcceso } from '@/lib/contexto'
import { direccionOpcional } from '@/lib/direccion'
import { ipDeCabecera } from '@/lib/ip'
import { notificadorRegistro } from '@/lib/notificador'
import { vincularCitaARecepcion, type TxCitas } from '@/lib/citas'
import { buscarPorMatricula, crearRecepcion, ErrorRecepcion, type FotoEntrada, type TxRecepcion } from '@/lib/recepcion'

export type Respuesta<T = object> = ({ ok: true } & T) | { ok: false; errores: string[] }

export type FichaMatricula = {
  vehiculo: { marca: string | null; modelo: string | null; kmActuales: number | null; seguroHasta: string }
  cliente: { id: string; nombre: string; movil: string | null; correo: string | null; direccion: { cp: string; provincia: string; municipio: string; via: string; numero: string } } | null
  historial: { fecha: string; km: number | null; motivo: string | null }[]
}

export async function buscarMatriculaAccion(matricula: unknown): Promise<Respuesta<{ ficha: FichaMatricula | null }>> {
  if (typeof matricula !== 'string' || matricula.length > 20) return { ok: false, errores: ['Matrícula inválida'] }
  try {
    return await conPermiso('recepcion', async (tx, c) => {
      const r = await buscarPorMatricula(tx as unknown as TxRecepcion, c.tallerId, matricula)
      if (!r) return { ok: true as const, ficha: null }
      return {
        ok: true as const,
        ficha: {
          vehiculo: { marca: r.vehiculo.marca, modelo: r.vehiculo.modelo, kmActuales: r.vehiculo.kmActuales, seguroHasta: fechaInputDe(r.vehiculo.seguroHasta) },
          cliente: r.cliente ? {
            id: r.cliente.id, nombre: r.cliente.nombre, movil: r.cliente.movil, correo: r.cliente.correo,
            direccion: { cp: r.cliente.cp ?? '', provincia: r.cliente.provincia ?? '', municipio: r.cliente.municipio ?? '', via: r.cliente.via ?? '', numero: r.cliente.numero ?? '' },
          } : null,
          historial: r.historial.map((h) => ({ fecha: h.recibidoEn.toISOString(), km: h.kmEntrada, motivo: h.motivo })),
        },
      }
    })
  } catch (e) {
    const m = mensajeDeAcceso(e)
    if (m) return { ok: false, errores: [m] }
    console.error('[recepcion/buscar]', e)
    return { ok: false, errores: ['No se pudo buscar. Inténtalo de nuevo'] }
  }
}

const COMBUSTIBLE = ['', 'vacio', '1/4', '1/2', '3/4', 'lleno'] as const
const Datos = z.object({
  matricula: z.string().min(1).max(20),
  clienteId: z.string().uuid().nullable(),
  citaId: z.string().uuid().nullable().optional(),
  nombre: z.string().max(200),
  movil: z.string().max(30),
  correo: z.string().max(200),
  km: z.string().max(9),
  direccion: z.object({ cp: z.string().max(5), provincia: z.string().max(100), municipio: z.string().max(100), via: z.string().max(200), numero: z.string().max(20) }),
  combustible: z.enum(COMBUSTIBLE),
  objetos: z.string().max(1000),
  motivo: z.string().max(2000),
  danos: z.string().max(2000),
  seguro: z.object({ vigente: z.enum(['', 'si', 'no']), aseguradora: z.string().max(100), vence: z.string().max(10) }),
  // Las casillas llegan SIN MARCAR por defecto; el servicio no depende de ellas.
  casillas: z.object({ asegura: z.boolean(), taller: z.boolean() }),
  fotoPosiciones: z.array(z.string().max(40)).max(12),
})

const MAX_FOTO = 6 * 1024 * 1024
const MAX_FIRMA = 512 * 1024

async function bytesDe(f: FormDataEntryValue | null, max: number, mimes: readonly string[]): Promise<{ mime: string; bytes: Uint8Array; nombre: string } | null> {
  if (!(f instanceof File) || f.size === 0) return null
  if (f.size > max || !mimes.includes(f.type)) throw new ErrorRecepcion('Archivo no admitido o demasiado grande')
  return { mime: f.type, bytes: new Uint8Array(await f.arrayBuffer()), nombre: f.name || 'archivo' }
}

export async function guardarRecepcion(fd: FormData): Promise<Respuesta<{ recepcionId: string; otNumero: number; firmada: boolean }>> {
  let crudo: unknown
  try { crudo = JSON.parse(String(fd.get('datos') ?? '')) } catch { return { ok: false, errores: ['Datos inválidos'] } }
  const p = Datos.safeParse(crudo)
  if (!p.success) return { ok: false, errores: ['Datos inválidos'] }
  const d = p.data
  const km = d.km.trim() === '' ? null : /^\d{1,7}$/.test(d.km.trim()) ? Number(d.km.trim()) : NaN
  if (Number.isNaN(km)) return { ok: false, errores: ['Los kilómetros son un número entero'] }
  // La fecha (rango y formato) y el móvil obligatorio los valida crearRecepcion con los helpers de module-taller.
  const vence = d.seguro.vence.trim()
  // Dirección del cliente (opcional): si se empieza, debe quedar COMPLETA y coherente con su código postal.
  const dir = direccionOpcional(d.direccion)
  if (!dir.ok) return { ok: false, errores: dir.errores }
  const h = await headers()
  try {
    const firma = await bytesDe(fd.get('firma'), MAX_FIRMA, ['image/png'])
    const fotos: FotoEntrada[] = []
    for (let i = 0; i < d.fotoPosiciones.length; i++) {
      const f = await bytesDe(fd.get(`foto_${i}`), MAX_FOTO, MIME_ACEPTADOS)
      if (f) fotos.push({ posicion: d.fotoPosiciones[i] || null, ...f, capturadaEn: new Date() })
    }
    const r = await conPermiso('recepcion', async (tx, c) => {
      const config = await configDe(tx, c.tallerId)
      if (!config) throw new ErrorRecepcion('El taller no tiene configuración de alta')
      const rec = await crearRecepcion(tx as unknown as TxRecepcion, {
        tallerId: c.tallerId, usuarioId: c.usuarioId, matricula: d.matricula, clienteId: d.clienteId,
        cliente: { nombre: d.nombre, movil: d.movil, correo: d.correo }, direccion: dir.direccion, km, combustible: d.combustible || null,
        objetos: d.objetos, motivo: d.motivo, danos: d.danos.trim() ? { nota: d.danos } : null,
        seguro: d.seguro.vigente === '' && !d.seguro.aseguradora.trim() && !vence ? null
          : { vigente: d.seguro.vigente === '' ? null : d.seguro.vigente === 'si', aseguradora: d.seguro.aseguradora.trim(), vence: vence || null },
        fotos, firma, casillas: d.casillas, ip: ipDeCabecera(h.get('x-forwarded-for')), userAgent: h.get('user-agent')?.slice(0, 300) ?? null,
        ahora: new Date(),
      }, {
        config, almacen: almacenActivo(), notificador: notificadorRegistro(tx as never, c.usuarioId),
        textoTaller: { version: config.textos.versionTextoComercialTaller, texto: config.textos.textoConsentimientoComercialTaller },
      })
      // El coche llega con cita: la cita pasa a «realizada» y queda enlazada a esta recepción (una sentencia condicionada).
      if (d.citaId) await vincularCitaARecepcion(tx as unknown as TxCitas, { tallerId: c.tallerId, citaId: d.citaId, recepcionId: rec.recepcionId, ahora: new Date() })
      return rec
    })
    revalidatePath('/recepcion')
    revalidatePath('/ordenes')
    return { ok: true, recepcionId: r.recepcionId, otNumero: r.otNumero, firmada: r.firmada }
  } catch (e) {
    const m = mensajeDeAcceso(e)
    if (m) return { ok: false, errores: [m] }
    if (e instanceof ErrorRecepcion) return { ok: false, errores: [e.message] }
    console.error('[recepcion/guardar]', e)
    return { ok: false, errores: ['No se pudo guardar la recepción. Inténtalo de nuevo'] }
  }
}
