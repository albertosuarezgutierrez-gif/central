// lib/sivra/agente-huesped/contexto.ts — ensambla el contexto de una reserva.
import { prisma } from '@/lib/db'
import { Prisma } from '@prisma/client'
import { smoobuFetch } from '@/lib/smoobu'
import { getGuiaPiso } from './guia'
import { htmlATexto, seccionesVigentes, seccionesATexto } from './guest-app'
import { dedupHilo } from './hilo'
import { listarHechos } from './hechos'
import { avisarConflictoGuia } from './conflictos'
import { horarioPiso } from './horarios'
import { nocheAnteriorLibre, restarDias, entradaMismoDiaLibre, sumarDias } from './disponibilidad'
import { setEnviados, corregirAtribucion, atribuirEmisor } from './atribucion'
import { bloqueParking } from './parking'
import { bloqueEquipaje } from './equipaje'
import { bloqueLlegada } from './llegada'
import { bloqueSalida } from './salida'

export type MensajeHist = { id: string; from: 'guest' | 'host'; text: string; ts: string }
export type Aprendizaje = { categoria: string; pregunta_norm: string; respuesta_final: string }
export type Contexto = {
  bookingId: string
  reservationId: string
  propertyId: string
  property: string
  guestName: string
  lang: string
  idiomaReserva: string   // idioma del huésped según Smoobu (reserva.language, p.ej. "es")
  portal: string
  checkIn: string         // fecha de llegada (YYYY-MM-DD)
  checkOut: string        // fecha de salida (YYYY-MM-DD)
  horaCheckIn: string     // hora oficial de entrada de la reserva (p.ej. "15:00")
  horaCheckOut: string    // hora oficial de salida de la reserva (p.ej. "11:00")
  earlyCheckinPosible: boolean  // ¿está LIBRE la noche anterior? (gratis solo si nadie duerme la víspera)
  earlyCheckinChequeado: boolean  // ¿pudimos comprobarlo en Smoobu? (false = fetch falló / sin datos → NO afirmar disponibilidad)
  lateCheckoutPosible: boolean   // ¿está LIBRE el día de la salida (nadie más entra ese mismo día)?
  lateCheckoutChequeado: boolean // ¿pudimos comprobarlo en Smoobu? (false = fetch falló → NO afirmar disponibilidad)
  lat: number | null
  lng: number | null
  zona: string
  direccion: string
  ficha: string           // ficha ESTRUCTURADA del piso (datos oficiales de Smoobu)
  guia: string | null     // guía REAL del piso, ya filtrada por lo que hoy se le puede enseñar
  guiaCargada: boolean    // false = NO SE PUDO LEER. NO significa "no hay guía" (CLAUDE.md, tres estados)
  guiaAccesoOculto: boolean  // hay secciones de llaves/códigos pero aún no toca (faltan >7 días)
  hechos: string[]        // hechos permanentes del piso que enseñó Alberto (van SIEMPRE al prompt)
  historial: MensajeHist[]
  enviados: Set<string>   // respuestas que YA enviamos (normalizadas) — para no respondernos a nosotros
  aprendizajes: Aprendizaje[]
}

function strip(html: string): string {
  return (html || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/\s+/g, ' ').trim()
}

// Mapea apartmentId/nombre de Smoobu → property_id interno (prop_*).
export function toPropertyId(_apartmentId: unknown, apartmentName: string): string {
  const n = (apartmentName || '').toLowerCase()
  if (n.includes('house') || n.includes('sevillana')) return 'prop_house_sevillana'
  if (n.includes('busto reform')) return 'prop_busto_reform'
  if (n.includes('luxury')) return 'prop_luxury_busto'
  if (n.includes('duplex') || n.includes('center')) return 'prop_duplex_center'
  return 'all'
}

export async function construirContexto(bookingId: string, lang: string): Promise<Contexto | null> {
  const reserva: any = await smoobuFetch(`/api/reservations/${bookingId}`, { cache: 'no-store' })
    .then(r => r.json()).catch(() => null)
  if (!reserva) return null

  const apartmentId = reserva?.apartment?.id ?? reserva?.apartmentId
  const apartmentName: string = reserva?.apartment?.name ?? ''
  const apt: any = apartmentId ? await smoobuFetch(`/api/apartments/${apartmentId}`, { cache: 'no-store' })
    .then(r => r.json()).catch(() => ({})) : {}

  const propertyId = toPropertyId(apartmentId, apartmentName)

  const msgRaw: any[] = await smoobuFetch(`/api/reservations/${bookingId}/messages`, { cache: 'no-store' })
    .then(r => r.json()).then(d => (Array.isArray(d?.messages) ? d.messages : Array.isArray(d) ? d : [])).catch(() => [])
  // El texto PLANO de Smoobu (`message`) se come los enlaces: los automáticos traen anclas cuyo texto
  // visible es "AQUÍ"/"HERE" y la URL solo está en `htmlMessage`. Leer el plano es lo que hizo que el
  // agente le escribiera el marcador literal "[lien d'accès]" a un huésped (20/08/2026) teniendo el
  // enlace en el hilo. El ASUNTO también importa: "WHERE TO COLLECT THE KEYS?" es la mitad del mensaje.
  // OJO con la fecha: Smoobu la manda en `createdAt` (camelCase). Leer solo `created_at` dejaba el `ts`
  // VACÍO en todo el historial → el guard anti-duplicado `ya_respondido` del orquestador no podía
  // comparar nada y se colaban propuestas repetidas para la misma pregunta.
  const historialRaw: MensajeHist[] = msgRaw.map(m => {
    const html = String(m.htmlMessage || '')
    const cuerpo = html ? htmlATexto(html) : strip(m.message || m.text || '')
    const asunto = String(m.subject || '').trim()
    return {
      id: String(m.id || m.createdAt || m.created_at || ''),
      from: atribuirEmisor(m),   // `type`/`sent_by_owner` nativos de Smoobu (no solo `sent_by_owner`)
      text: asunto ? `${asunto}\n${cuerpo}`.trim() : cuerpo,
      ts: m.created_at || m.createdAt || '',
    }
  }).filter(m => m.text)

  // Lo que YA enviamos al huésped (ground truth). Smoobu no siempre marca el emisor (`sent_by_owner`
  // vacío), así que nuestra propia respuesta puede reaparecer en el hilo como si fuera del huésped.
  // Cruzando el historial con nuestros envíos corregimos esa atribución → 'host' (y el agente deja de
  // responderse a sí mismo). Lo consumen el guard `ultimoMsg.from==='host'` y `esEcoPropio`.
  const enviadosRows = await prisma.$queryRaw<{ respuesta: string }[]>(Prisma.sql`
    SELECT respuesta FROM mensajes_log
    WHERE booking_id = ${bookingId} AND auto_sent = true AND respuesta <> ''
    ORDER BY created_at DESC LIMIT 30
  `).catch(() => [])
  const enviados = setEnviados(enviadosRows.map((r: { respuesta: string }) => r.respuesta))
  // Smoobu manda cada automático POR DUPLICADO (8 de los 25 mensajes del hilo de la reserva
  // 152291091 eran copias) y esas copias se comían la ventana de contexto del modelo.
  const historial = dedupHilo(corregirAtribucion(historialRaw, enviados))

  // Guía REAL del piso (guest app de Smoobu), filtrada por lo que HOY se le puede enseñar a este
  // huésped: vigencia declarada por Smoobu + ventana de 7 días para llaves y códigos.
  const guiaPiso = await getGuiaPiso(propertyId, bookingId)
  const hoyMadrid = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Madrid' })
  const vigentes = seccionesVigentes(guiaPiso.secciones, {
    hoy: hoyMadrid,
    checkIn: String(reserva?.arrival || ''),
    checkOut: String(reserva?.departure || ''),
  })
  const guia = seccionesATexto(vigentes.secciones) || null
  // Una sección de la guía que pisamos con una regla de negocio se avisa UNA vez (no se resuelve en
  // silencio). Best-effort: nunca debe romper ni retrasar la respuesta al huésped.
  if (vigentes.pisadas.length) {
    void avisarConflictoGuia(propertyId, apartmentName || propertyId, vigentes.pisadas).catch(() => {})
  }

  const hechos = (await listarHechos(propertyId)).map(h => h.hecho)

  const aprendizajes = await prisma.$queryRaw<Aprendizaje[]>(Prisma.sql`
    SELECT categoria, pregunta_norm, respuesta_final FROM mensajes_aprendizaje
    WHERE property_id = ${propertyId} ORDER BY created_at DESC LIMIT 8
  `)

  // Horas OFICIALES. En Smoobu, `arrival`/`departure` son las FECHAS y `check-in`/`check-out` las
  // HORAS — pero esas horas se graban por reserva y quedan desfasadas en reservas viejas (p.ej.
  // 13:00 cuando la entrada real es 15:00). Por eso el override por piso (horarios.ts) MANDA; solo
  // si el piso no está en la tabla se usa lo que diga Smoobu.
  const horario = horarioPiso(
    propertyId,
    String(reserva?.['check-in'] || '').trim(),
    String(reserva?.['check-out'] || '').trim(),
  )
  const horaCheckIn = horario.checkIn
  const horaCheckOut = horario.checkOut

  // ¿Se puede confirmar early check-in (gratis)? Solo si la NOCHE ANTERIOR a la llegada está libre
  // (nadie duerme la víspera; ojo a una reserva que SALE el mismo día). Consultamos las reservas del
  // piso en una ventana hasta la llegada y lo resolvemos con la función pura `nocheAnteriorLibre`.
  // OJO: si el fetch/parseo FALLA devolvemos `null` (no `[]`). Un `[]` significaría "no hay reservas
  // en la ventana" → víspera libre, y `nocheAnteriorLibre([])` diría true. Confundir un fallo de red
  // con "libre" haría CONFIRMAR una entrada anticipada que no pudimos verificar. Por eso `chequeado`
  // solo pasa a true cuando de verdad tenemos respuesta de Smoobu.
  const arrivalDate = String(reserva?.arrival || '').trim()
  let earlyCheckinPosible = false
  let earlyCheckinChequeado = false
  if (apartmentId && arrivalDate) {
    const desde = restarDias(arrivalDate, 30) || arrivalDate
    const estancias: any[] | null = await smoobuFetch(
      `/api/reservations?apartments[]=${apartmentId}&from=${desde}&to=${arrivalDate}&showCancellation=false&pageSize=100`,
      { cache: 'no-store' },
    ).then(r => r.json()).then(d => (Array.isArray(d?.bookings) ? d.bookings : Array.isArray(d?.data) ? d.data : [])).catch(() => null)
    if (estancias !== null) {
      earlyCheckinChequeado = true
      earlyCheckinPosible = nocheAnteriorLibre(arrivalDate, estancias, bookingId)
    }
  }

  // ¿Se puede confirmar late check-out? Solo si NADIE entra el mismo día de la salida (si entra, el
  // piso necesita turnover: limpieza + la siguiente entrada). Mismo criterio conservador que el early
  // check-in: si el fetch falla, `chequeado=false` y NUNCA se afirma disponibilidad sin verificarla.
  const departureDate = String(reserva?.departure || '').trim()
  let lateCheckoutPosible = false
  let lateCheckoutChequeado = false
  if (apartmentId && departureDate) {
    const hasta = sumarDias(departureDate, 2) || departureDate
    const estanciasSalida: any[] | null = await smoobuFetch(
      `/api/reservations?apartments[]=${apartmentId}&from=${departureDate}&to=${hasta}&showCancellation=false&pageSize=100`,
      { cache: 'no-store' },
    ).then(r => r.json()).then(d => (Array.isArray(d?.bookings) ? d.bookings : Array.isArray(d?.data) ? d.data : [])).catch(() => null)
    if (estanciasSalida !== null) {
      lateCheckoutChequeado = true
      lateCheckoutPosible = entradaMismoDiaLibre(departureDate, estanciasSalida, bookingId)
    }
  }

  const direccion = [apt?.location?.street, apt?.location?.zip, apt?.location?.city]
    .map((x: any) => (x ? String(x).trim() : '')).filter(Boolean).join(', ')

  // Ficha estructurada del piso a partir de datos OFICIALES de Smoobu (el guest-app-url es una
  // SPA que no se puede leer, así que ésta es la fuente de verdad para el agente).
  const amenities: string[] = Array.isArray(apt?.amenities) ? apt.amenities : []
  const fichaLineas = [
    direccion && `Dirección: ${direccion}`,
    (horaCheckIn || horaCheckOut) &&
      `Horario: entrada a partir de las ${horaCheckIn || '—'}, salida hasta las ${horaCheckOut || '—'}`,
    apt?.rooms?.maxOccupancy && `Capacidad máxima: ${apt.rooms.maxOccupancy} huéspedes`,
    amenities.length && `Equipamiento: ${amenities.join(', ')}`,
    bloqueLlegada(horaCheckIn),
    bloqueParking(),
    bloqueEquipaje(propertyId),
    bloqueSalida(horaCheckOut),
  ].filter(Boolean)
  const ficha = fichaLineas.join('\n')

  return {
    bookingId, reservationId: String(bookingId), propertyId,
    property: apartmentName || 'el apartamento',
    guestName: reserva?.guest_name || reserva?.guestName || reserva?.firstname || '',
    lang, idiomaReserva: String(reserva?.language || '').trim().toLowerCase().slice(0, 2),
    portal: reserva?.channel?.name || reserva?.type || 'directo',
    checkIn: reserva?.arrival || '',
    checkOut: reserva?.departure || '',
    horaCheckIn, horaCheckOut, earlyCheckinPosible, earlyCheckinChequeado,
    lateCheckoutPosible, lateCheckoutChequeado,
    lat: apt?.location?.latitude ?? null, lng: apt?.location?.longitude ?? null,
    zona: [apt?.location?.city, apt?.location?.country].filter(Boolean).join(', ') || 'Sevilla, España',
    direccion, ficha, guia, guiaCargada: guiaPiso.cargada, guiaAccesoOculto: vigentes.accesoOculto,
    hechos, historial, enviados, aprendizajes,
  }
}
