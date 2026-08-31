// lib/sivra/mensajes-prog/orquestador.ts — pasada del cron de mensajes programados a huéspedes.
//
// Lista las reservas vivas de Smoobu en una ventana [−2 d, +9 d], decide con `decidir.ts` qué hitos
// tocan, renderiza las plantillas deterministas, traduce con guarda de datos y:
//   · piso NO activado en `mensajes_prog_pisos` → MODO SOMBRA: se registra + copia a Telegram,
//     nada llega al huésped (así se valida el ciclo entero con reservas reales sin riesgo);
//   · piso activado → envía por Smoobu (`enviarAlHuesped`), con reintentos si el envío falla
//     (Smoobu se cae de vez en cuando — el registro sabe qué quedó pendiente).
//
// Guardas clave:
//   · Reclamo atómico en `mensajes_programados` (UNIQUE booking+tipo+fecha_objetivo) ANTES de
//     enviar: dos pasadas simultáneas no pueden duplicar un hito.
//   · «¿Ya lo mandó Smoobu?» (pedido por Alberto): si la plantilla equivalente de Smoobu está en
//     el hilo, el hito se marca hecho SIN enviar y Telegram avisa de qué plantilla apagar.
//   · Un código NULL en BD jamás se inventa: la plantilla declara el hueco y Telegram lo canta.
//   · La lista de reservas viene con showCancellation=false y se consulta EN VIVO en cada pasada:
//     a una reserva cancelada no se le envía nada (el registro de lo YA enviado queda para la
//     rotación de códigos, fuera de este módulo).

import { prisma } from '@/lib/db'
import { Prisma } from '@prisma/client'
import { smoobuFetch } from '@/lib/smoobu'
import { tgSend, escapeHtml } from '@central/core-telegram'
import { registrarLatido } from '@/lib/monitoring/latido-escribir'
import { toPropertyId } from '@/lib/sivra/agente-huesped/contexto'
import { horarioPiso } from '@/lib/sivra/agente-huesped/horarios'
import { entradaMismoDiaLibre, sumarDias, restarDias } from '@/lib/sivra/agente-huesped/disponibilidad'
import { parseGuestAppUrl, fetchGuiaSecciones } from '@/lib/sivra/agente-huesped/guest-app'
import { enviarAlHuesped } from '@/lib/sivra/agente-huesped/enviar'
import { mensajesDebidos, claveHito, type ReservaMin } from './decidir'
import { renderPlantilla, renderAsunto, type TipoMensaje, type DatosPlantilla } from './plantillas'
import { traducirMensaje } from './traducir'
import { yaLoMandoSmoobu, type MsgHilo } from './equivalentes-smoobu'
import { ACCESO, codigosQueFaltan, type CodigosAcceso } from '../acceso'

const AGENTE = 'sivra_mensajes_prog'
const MAX_INTENTOS = 5

type Resumen = {
  ok: boolean
  reservas: number
  debidos: number
  sombra: number
  enviados: number
  fallos: number
  saltadosSmoobu: number
  detalle: string[]
}

function hoyMadrid(): { fecha: string; hora: string } {
  const ahora = new Date()
  return {
    fecha: ahora.toLocaleDateString('sv-SE', { timeZone: 'Europe/Madrid' }),
    hora: ahora.toLocaleTimeString('sv-SE', { timeZone: 'Europe/Madrid', hour12: false }).slice(0, 5),
  }
}

async function cargarCodigos(): Promise<Record<string, CodigosAcceso>> {
  const rows = await prisma.$queryRaw<{ property_id: string; codigo_portal: string | null; codigo_caja: string | null; wifi_ssid: string | null; wifi_password: string | null }[]>(
    Prisma.sql`SELECT property_id, codigo_portal, codigo_caja, wifi_ssid, wifi_password FROM sivra_codigos_acceso`,
  )
  const out: Record<string, CodigosAcceso> = {}
  for (const r of rows) out[r.property_id] = { portal: r.codigo_portal, caja: r.codigo_caja, wifiSsid: r.wifi_ssid, wifiPass: r.wifi_password }
  return out
}

async function cargarPisosActivos(): Promise<Set<string>> {
  const rows = await prisma.$queryRaw<{ property_id: string }[]>(
    Prisma.sql`SELECT property_id FROM mensajes_prog_pisos WHERE activo = true`,
  ).catch(() => [])
  return new Set(rows.map(r => r.property_id))
}

async function cargarYaHechos(bookingIds: string[]): Promise<Map<string, Set<string>>> {
  const out = new Map<string, Set<string>>()
  if (!bookingIds.length) return out
  // IN con Prisma.join, no ANY(array): el pooler de Supabase falla con params array (landmine del
  // acotado de mapa_arquitectura, 17/07/2026) — solo params escalares.
  const rows = await prisma.$queryRaw<{ booking_id: string; tipo: string; fecha_objetivo: Date }[]>(Prisma.sql`
    SELECT booking_id, tipo, fecha_objetivo FROM mensajes_programados
    WHERE booking_id IN (${Prisma.join(bookingIds)})
  `)
  for (const r of rows) {
    const f = r.fecha_objetivo instanceof Date ? r.fecha_objetivo.toISOString().slice(0, 10) : String(r.fecha_objetivo).slice(0, 10)
    if (!out.has(r.booking_id)) out.set(r.booking_id, new Set())
    out.get(r.booking_id)!.add(claveHito(r.tipo, f))
  }
  return out
}

// Hilo de la reserva reducido a lo que necesita `yaLoMandoSmoobu`.
async function hiloReserva(bookingId: string): Promise<MsgHilo[] | null> {
  try {
    const d: any = await smoobuFetch(`/api/reservations/${bookingId}/messages?pageSize=50`, { cache: 'no-store' }).then(r => r.json())
    const msgs: any[] = Array.isArray(d?.messages) ? d.messages : []
    return msgs.map(m => ({
      from: Number(m?.type) === 1 ? 'guest' as const : 'host' as const,
      subject: String(m?.subject || ''),
      text: String(m?.message || ''),
    }))
  } catch { return null }
}

// Enlace Chekin POR RESERVA: vive en la sección "CHECK-IN OBLIGATORIO" de su guest app.
function chekinDeSecciones(secciones: { texto: string }[] | null): string {
  if (!secciones) return ''
  for (const s of secciones) {
    const m = s.texto.match(/https:\/\/guest\.chekin\.com\/[A-Za-z0-9]+/)
    if (m) return m[0]
  }
  return ''
}

// ¿Queda libre el día de la salida (nadie entra ese día)? true/false verificado · null = no se pudo
// comprobar → la plantilla NO ofrece las 12:00 (mismo criterio conservador que el agente).
async function lateOferta(apartmentId: unknown, departure: string, bookingId: string): Promise<boolean | null> {
  if (!apartmentId || !departure) return null
  try {
    const hasta = sumarDias(departure, 2) || departure
    const d: any = await smoobuFetch(
      `/api/reservations?apartments[]=${apartmentId}&from=${departure}&to=${hasta}&showCancellation=false&pageSize=100`,
      { cache: 'no-store' },
    ).then(r => r.json())
    const est: any[] | null = Array.isArray(d?.bookings) ? d.bookings : Array.isArray(d?.data) ? d.data : null
    if (est === null) return null
    return entradaMismoDiaLibre(departure, est, bookingId)
  } catch { return null }
}

export async function pasadaMensajesProgramados(deadline = Date.now() + 280_000): Promise<Resumen> {
  await registrarLatido(AGENTE, false, 'intento: pasada arrancada')
  const res: Resumen = { ok: true, reservas: 0, debidos: 0, sombra: 0, enviados: 0, fallos: 0, saltadosSmoobu: 0, detalle: [] }
  const { fecha: hoy, hora } = hoyMadrid()

  // 1) Reservas vivas en la ventana. Si Smoobu no responde, la pasada se declara mala y se vuelve:
  // sin lista no hay nada que afirmar (un [] por fallo de red enviaría "no hay trabajo" falso).
  const desde = restarDias(hoy, 2) || hoy
  const hasta = sumarDias(hoy, 9) || hoy
  let bookings: any[]
  try {
    const d: any = await smoobuFetch(
      `/api/reservations?from=${desde}&to=${hasta}&showCancellation=false&pageSize=100`,
      { cache: 'no-store' },
    ).then(r => r.json())
    bookings = Array.isArray(d?.bookings) ? d.bookings : []
  } catch (e: any) {
    await registrarLatido(AGENTE, false, `Smoobu no responde al listado: ${e?.message || e}`)
    return { ...res, ok: false, detalle: ['listado de reservas ilegible'] }
  }

  // Solo reservas reales de los 4 pisos (fuera bloqueos y canales bloqueados), dedupe por id.
  const vistas = new Set<string>()
  const reservas = bookings.filter(b => {
    const id = String(b?.id || '')
    if (!id || vistas.has(id)) return false
    vistas.add(id)
    if (String(b?.type || '') === 'cancellation') return false
    if (/blocked/i.test(String(b?.channel?.name || ''))) return false
    const pid = toPropertyId(b?.apartment?.id, String(b?.apartment?.name || ''))
    return !!ACCESO[pid]
  })
  res.reservas = reservas.length

  const [codigos, activos, yaHechosPorReserva] = await Promise.all([
    cargarCodigos().catch(() => ({} as Record<string, CodigosAcceso>)),
    cargarPisosActivos(),
    cargarYaHechos(reservas.map(b => String(b.id))),
  ])

  const avisosSombra: string[] = []
  const avisos: string[] = []

  for (const b of reservas) {
    if (Date.now() > deadline) { res.detalle.push('presupuesto de tiempo agotado — el resto, en la próxima pasada'); break }
    const bookingId = String(b.id)
    const propertyId = toPropertyId(b?.apartment?.id, String(b?.apartment?.name || ''))
    const r: ReservaMin = {
      bookingId,
      propertyId,
      checkIn: String(b?.arrival || ''),
      checkOut: String(b?.departure || ''),
      noches: Math.max(0, Math.round((Date.parse(`${b?.departure}T00:00Z`) - Date.parse(`${b?.arrival}T00:00Z`)) / 86400000)) || 0,
      createdAt: String(b?.['created-at'] || '').slice(0, 10),
    }
    if (!r.checkIn || !r.checkOut) continue

    const yaHechos = yaHechosPorReserva.get(bookingId) ?? new Set<string>()
    const debidos = mensajesDebidos(r, hoy, hora, yaHechos)
    if (!debidos.length) continue
    res.debidos += debidos.length

    const activo = activos.has(propertyId)
    // El hilo solo hace falta para el chequeo «¿ya lo mandó Smoobu?», que solo aplica con el piso
    // ACTIVO (en sombra las plantillas de Smoobu siguen encendidas a propósito: avisar de cada una
    // sería puro ruido, y la copia sombra se quiere generar igualmente para validar el texto).
    const hilo = activo ? await hiloReserva(bookingId) : []

    // Datos comunes de la reserva para las plantillas.
    const horario = horarioPiso(propertyId, String(b?.['check-in'] || '').trim(), String(b?.['check-out'] || '').trim())
    const guestAppUrl = String(b?.['guest-app-url'] || '')
    const idiomaReserva = String(b?.language || '').trim().toLowerCase().slice(0, 2)
    const cods = codigos[propertyId] || {}

    for (const deb of debidos) {
      if (Date.now() > deadline) break

      // ¿Smoobu ya mandó su equivalente? Marcado como hecho SIN enviar + aviso de qué apagar.
      // Con el hilo ilegible (null) NO se afirma nada: el hito se deja para la próxima pasada.
      if (activo && hilo === null) { res.detalle.push(`${bookingId}: hilo ilegible — ${deb.tipo} pospuesto`); continue }
      if (activo && hilo !== null && yaLoMandoSmoobu(deb.tipo, hilo)) {
        const ins = await prisma.$queryRaw<{ id: bigint }[]>(Prisma.sql`
          INSERT INTO mensajes_programados (booking_id, property_id, tipo, fecha_objetivo, idioma, estado, cuerpo, error)
          VALUES (${bookingId}, ${propertyId}, ${deb.tipo}, ${deb.fechaObjetivo}::date, 'es', 'sombra', '', 'equivalente de Smoobu ya en el hilo')
          ON CONFLICT (booking_id, tipo, fecha_objetivo) DO NOTHING RETURNING id
        `)
        if (ins.length) {
          res.saltadosSmoobu++
          avisos.push(`↔️ ${ACCESO[propertyId].nombre} · reserva ${bookingId}: Smoobu ya mandó su plantilla equivalente a «${deb.tipo}» — apágala en Smoobu para que el ciclo sea nuestro.`)
        }
        continue
      }

      // Enlace Chekin por reserva, solo para los hitos que lo usan.
      let chekinUrl = ''
      if (deb.tipo === 'confirmacion' || deb.tipo === 'acceso' || deb.tipo === 'vispera_llegada') {
        const ref = guestAppUrl ? parseGuestAppUrl(guestAppUrl) : null
        const secciones = ref ? await fetchGuiaSecciones(ref) : null
        chekinUrl = chekinDeSecciones(secciones)
      }

      const late = deb.tipo === 'vispera_salida' ? await lateOferta(b?.apartment?.id, r.checkOut, bookingId) : null

      const datos: DatosPlantilla = {
        guestName: String(b?.['guest-name'] || b?.guestName || '').trim(),
        property: ACCESO[propertyId].nombre,
        propertyId,
        checkIn: r.checkIn,
        checkOut: r.checkOut,
        horaCheckIn: horario.checkIn,
        horaCheckOut: horario.checkOut,
        noches: r.noches,
        codigos: cods,
        chekinUrl: chekinUrl || undefined,
        guestAppUrl: guestAppUrl || undefined,
        llegadaHoy: deb.llegadaHoy,
        lateOfertaOk: late,
      }
      const cuerpoEs = renderPlantilla(deb.tipo, datos)
      const faltan = (deb.tipo === 'acceso' || deb.tipo === 'vispera_llegada') ? codigosQueFaltan(propertyId, cods) : []
      if (faltan.length) avisos.push(`🚨 ${ACCESO[propertyId].nombre}: falta en BD ${faltan.join(' y ')} (sivra_codigos_acceso) — el mensaje «${deb.tipo}» de la reserva ${bookingId} sale declarando el hueco.`)

      const { texto, idioma } = activo && idiomaReserva && idiomaReserva !== 'es'
        ? await traducirMensaje(cuerpoEs, idiomaReserva)
        : { texto: cuerpoEs, idioma: 'es' }

      // Reclamo atómico ANTES de enviar: si otra pasada lo insertó, este hito ya no es nuestro.
      const claim = await prisma.$queryRaw<{ id: bigint }[]>(Prisma.sql`
        INSERT INTO mensajes_programados (booking_id, property_id, tipo, fecha_objetivo, idioma, estado, cuerpo)
        VALUES (${bookingId}, ${propertyId}, ${deb.tipo}, ${deb.fechaObjetivo}::date, ${idioma}, ${activo ? 'pendiente' : 'sombra'}, ${texto})
        ON CONFLICT (booking_id, tipo, fecha_objetivo) DO NOTHING RETURNING id
      `)
      if (!claim.length) continue

      if (!activo) {
        res.sombra++
        avisosSombra.push(
          `🕶️ <b>SOMBRA</b> · <b>${escapeHtml(ACCESO[propertyId].nombre)}</b> · ${escapeHtml(datos.guestName || '¿?')} (reserva ${bookingId})` +
          `\nHito: <b>${deb.tipo}</b>${idiomaReserva && idiomaReserva !== 'es' ? ` · idioma de la reserva: ${idiomaReserva.toUpperCase()} (se traduciría al activar)` : ''}` +
          `\n\n${escapeHtml(texto.length > 2600 ? texto.slice(0, 2600) + '…' : texto)}`,
        )
        continue
      }

      const asunto = renderAsunto(deb.tipo, datos)
      const okEnvio = await enviarAlHuesped(bookingId, texto, asunto)
      if (okEnvio) {
        res.enviados++
        await prisma.$executeRaw(Prisma.sql`
          UPDATE mensajes_programados SET estado = 'enviado', enviado_at = now(), intentos = intentos + 1
          WHERE booking_id = ${bookingId} AND tipo = ${deb.tipo} AND fecha_objetivo = ${deb.fechaObjetivo}::date
        `)
        avisos.push(`🤖 Enviado «${deb.tipo}» a ${datos.guestName || '¿?'} (${ACCESO[propertyId].nombre}, reserva ${bookingId})${idioma !== 'es' ? ` en ${idioma.toUpperCase()}` : ''}.`)
      } else {
        res.fallos++
        await prisma.$executeRaw(Prisma.sql`
          UPDATE mensajes_programados SET estado = 'fallo', intentos = intentos + 1, error = 'Smoobu rechazó el envío'
          WHERE booking_id = ${bookingId} AND tipo = ${deb.tipo} AND fecha_objetivo = ${deb.fechaObjetivo}::date
        `)
        avisos.push(`🛑 Smoobu rechazó el envío de «${deb.tipo}» a la reserva ${bookingId} (${ACCESO[propertyId].nombre}) — se reintenta en la próxima pasada.`)
      }
    }
  }

  // 2) Reintentos: hitos en 'fallo' (o reclamados que se quedaron colgados a mitad de pasada).
  const pendientes = await prisma.$queryRaw<{ booking_id: string; property_id: string; tipo: string; fecha_objetivo: Date; cuerpo: string; intentos: number }[]>(Prisma.sql`
    SELECT booking_id, property_id, tipo, fecha_objetivo, cuerpo, intentos FROM mensajes_programados
    WHERE (estado = 'fallo' OR (estado = 'pendiente' AND created_at < now() - interval '1 hour'))
      AND intentos < ${MAX_INTENTOS} AND cuerpo <> ''
    ORDER BY fecha_objetivo LIMIT 10
  `).catch(() => [])
  for (const p of pendientes) {
    if (Date.now() > deadline) break
    if (!activos.has(p.property_id)) continue
    const f = p.fecha_objetivo instanceof Date ? p.fecha_objetivo.toISOString().slice(0, 10) : String(p.fecha_objetivo).slice(0, 10)
    const okEnvio = await enviarAlHuesped(p.booking_id, p.cuerpo)
    await prisma.$executeRaw(Prisma.sql`
      UPDATE mensajes_programados
      SET estado = ${okEnvio ? 'enviado' : 'fallo'}, intentos = intentos + 1,
          enviado_at = CASE WHEN ${okEnvio} THEN now() ELSE enviado_at END,
          error = ${okEnvio ? null : 'Smoobu rechazó el reintento'}
      WHERE booking_id = ${p.booking_id} AND tipo = ${p.tipo} AND fecha_objetivo = ${f}::date
    `)
    if (okEnvio) res.enviados++
    else {
      res.fallos++
      if (p.intentos + 1 >= MAX_INTENTOS) avisos.push(`🛑 «${p.tipo}» de la reserva ${p.booking_id} agotó los ${MAX_INTENTOS} reintentos — revisar a mano.`)
    }
  }

  // 3) Telegram: cada sombra con su texto (es la validación de Alberto) + los avisos operativos.
  for (const a of avisosSombra) await tgSend(a).catch(() => {})
  if (avisos.length) await tgSend(`📬 <b>Mensajes programados</b>\n${avisos.map(a => escapeHtml(a)).join('\n')}`).catch(() => {})

  const detalle = `${res.reservas} reservas · ${res.debidos} debidos · ${res.sombra} sombra · ${res.enviados} enviados · ${res.fallos} fallos · ${res.saltadosSmoobu} ya-de-Smoobu${res.detalle.length ? ' · ' + res.detalle.join(' · ') : ''}`
  res.ok = res.fallos === 0
  await registrarLatido(AGENTE, res.ok, detalle)
  return res
}
