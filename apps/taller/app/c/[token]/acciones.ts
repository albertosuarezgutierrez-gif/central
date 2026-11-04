'use server'
// Reserva PÚBLICA por enlace de invitación (sin sesión). Cada acción: formato del token → límite de fallos por IP (que ya comprueba
// que la invitación esté vigente) → transacción RLS del taller del token. Token inválido, caducado, usado o IP bloqueada: 404 igual.
import { headers } from 'next/headers'
import { z } from 'zod'
import { fechaLocal } from '@central/module-taller'
import { conTaller, tallerPorEnlaceLimitado } from '@/lib/db'
import { configDe } from '@/lib/contexto'
import { ipDeCabecera } from '@/lib/ip'
import { huecosPublicos, reservarPorInvitacion, serviciosOfrecidos, type TxCitas } from '@/lib/citas'
import { tallerDeToken } from '@/lib/presupuestos'
import { notificadorRegistro } from '@/lib/notificador'

export type HuecoVista = { inicio: string; fecha: string; hora: string; plazasLibres: number }
export type RespuestaHuecos = { ok: true; huecos: HuecoVista[]; hastaFecha: string } | { ok: false; status: 404 | 400; mensaje: string }
export type RespuestaReserva = { ok: true; estado: string; inicio: string } | { ok: false; status: 404 | 409 | 400; mensaje: string }

const NO_ENCONTRADO = { ok: false, status: 404, mensaje: 'No encontrado' } as const
const SEMANAS_MAX = 12

async function resolver(token: unknown) {
  if (!tallerDeToken(token)) return null
  const h = await headers()
  const ahora = new Date()
  const tallerId = await tallerPorEnlaceLimitado(token, ipDeCabecera(h.get('x-forwarded-for')), ahora)
  return tallerId ? { tallerId, token: token as string, ahora, h } : null
}

export async function huecosAccion(token: unknown, servicio: unknown, semana: unknown): Promise<RespuestaHuecos> {
  if (typeof servicio !== 'string' || servicio.length > 60 || typeof semana !== 'number' || !Number.isInteger(semana) || semana < 0 || semana >= SEMANAS_MAX) {
    return { ok: false, status: 400, mensaje: 'Datos inválidos' }
  }
  const r = await resolver(token)
  if (!r) return NO_ENCONTRADO
  try {
    return await conTaller(r.tallerId, async (tx) => {
      const config = await configDe(tx, r.tallerId)
      if (!config) return NO_ENCONTRADO
      if (!serviciosOfrecidos(config).some((s) => s.codigo === servicio)) return { ok: false as const, status: 400 as const, mensaje: 'Servicio no disponible' }
      const desde = new Date(r.ahora.getTime() + semana * 7 * 86_400_000)
      const hasta = new Date(desde.getTime() + 7 * 86_400_000)
      const x = await huecosPublicos(tx as unknown as TxCitas, { tallerId: r.tallerId, token: r.token, servicio, desde, hasta, ahora: r.ahora, config })
      if (!x.ok) return NO_ENCONTRADO
      return {
        ok: true as const, hastaFecha: fechaLocal(hasta, config.agenda.zonaHoraria),
        huecos: x.huecos.map((h) => ({ inicio: h.inicio.toISOString(), fecha: h.fecha, hora: h.hora, plazasLibres: h.plazasLibres })),
      }
    })
  } catch (e) {
    console.error('[c/huecos]', e)
    return { ok: false, status: 400, mensaje: 'No se pudieron cargar los huecos. Inténtalo de nuevo' }
  }
}

const Datos = z.object({
  servicio: z.string().min(1).max(60),
  inicio: z.string().max(40),
  matricula: z.string().min(1).max(20),
  nombre: z.string().max(200),
  movil: z.string().max(30),
  correo: z.string().max(200),
  // Las casillas llegan SIN MARCAR; reservar nunca depende de ellas.
  casillas: z.object({ asegura: z.boolean(), taller: z.boolean() }),
})

export async function reservarAccion(token: unknown, datos: unknown): Promise<RespuestaReserva> {
  const p = Datos.safeParse(datos)
  if (!p.success) return { ok: false, status: 400, mensaje: 'Datos inválidos' }
  const d = p.data
  const inicio = new Date(d.inicio)
  if (Number.isNaN(inicio.getTime())) return { ok: false, status: 400, mensaje: 'Franja inválida' }
  const r = await resolver(token)
  if (!r) return NO_ENCONTRADO
  try {
    return await conTaller(r.tallerId, async (tx) => {
      const config = await configDe(tx, r.tallerId)
      if (!config) return NO_ENCONTRADO
      const x = await reservarPorInvitacion(tx as unknown as TxCitas, {
        tallerId: r.tallerId, token: r.token, ahora: r.ahora, config, servicio: d.servicio, inicio, matricula: d.matricula,
        nombre: d.nombre, movil: d.movil, correo: d.correo, casillas: d.casillas,
        ip: ipDeCabecera(r.h.get('x-forwarded-for')), userAgent: r.h.get('user-agent')?.slice(0, 300) ?? null,
        textoTaller: { version: config.textos.versionTextoComercialTaller, texto: config.textos.textoConsentimientoComercialTaller },
      }, notificadorRegistro(tx as never))
      return x.ok ? { ok: true as const, estado: x.estado, inicio: x.inicio.toISOString() } : x
    }, { timeout: 20_000 })
  } catch (e) {
    console.error('[c/reservar]', e)
    return { ok: false, status: 409, mensaje: 'No se pudo reservar. Inténtalo de nuevo' }
  }
}

