// lib/sivra/mensajes-prog/cobertura.ts — ¿está llegando el ciclo a los huéspedes? PURO.
//
// El latido del cron dice «5 reservas · 0 debidos · 0 enviados», y eso es exactamente lo mismo que
// decía el 05/09/2026 con el ciclo roto por dos sitios a la vez: el Dúplex sin activar desde el
// primer día, y la víspera CON LOS CÓDIGOS de una huésped que llegaba ese mediodía atrapada en una
// fila `sombra`. Los dos se encontraron mirando a mano.
//
// Por eso esto NO vigila el mecanismo (interruptores, chequeos, estados) sino el RESULTADO: quién
// llega y no tiene sus instrucciones. Da igual la causa —piso sin activar, hito bloqueado, Smoobu
// rechazando, idioma sin traducir—: si un huésped entra pasado mañana y no ha salido nada suyo,
// suena. Un vigía que mide el mecanismo se calla cuando el mecanismo falla de una forma nueva.

/** Días de antelación con los que un huésped ya debería tener sus instrucciones de acceso. */
export const AVISO_ANTELACION_DIAS = 2

/** Los hitos que llevan dirección, pasos y códigos. Cualquiera de los dos sirve: la víspera los
 *  contiene todos (ver `decidir.ts`), así que una reserva vista tarde no necesita además `acceso`. */
const HITOS_DE_ACCESO = ['acceso', 'vispera_llegada']

export type ReservaVigilada = {
  bookingId: string
  propertyId: string
  piso: string
  huesped: string
  /** YYYY-MM-DD */
  checkIn: string
  /** Tipos de hito con estado `enviado`. SOLO enviados: una copia en sombra no es una entrega. */
  hitosEnviados: string[]
}

export type Hallazgo =
  | { clase: 'llega_sin_acceso'; bookingId: string; piso: string; huesped: string; checkIn: string; dias: number }
  | { clase: 'piso_sin_interruptor'; propertyId: string; piso: string }
  | { clase: 'piso_en_sombra_con_reservas'; propertyId: string; piso: string; reservas: number }
  | { clase: 'sombra_bloqueando'; propertyId: string; piso: string; hitos: string[] }

export type EntradaCobertura = {
  /** YYYY-MM-DD, hora Madrid. */
  hoy: string
  reservas: ReservaVigilada[]
  /** Pisos con `activo = true` en `mensajes_prog_pisos`. */
  pisosActivos: Set<string>
  /** Pisos que el ciclo sabe atender (los de `ACCESO`), con su nombre. */
  pisosConocidos: { propertyId: string; piso: string }[]
  /** Pisos que TIENEN fila en `mensajes_prog_pisos`, activa o no. */
  pisosDeclarados: Set<string>
  /** Hitos en `sombra` con `fecha_objetivo >= hoy`, de pisos ACTIVOS. */
  sombraPendiente: { propertyId: string; tipo: string }[]
}

function aDias(fecha: string): number | null {
  const t = Date.parse(`${fecha}T00:00:00Z`)
  return Number.isFinite(t) ? Math.floor(t / 86400000) : null
}

export function revisarCobertura(e: EntradaCobertura): Hallazgo[] {
  const dHoy = aDias(e.hoy)
  if (dHoy === null) return []
  const out: Hallazgo[] = []
  const nombre = new Map(e.pisosConocidos.map(p => [p.propertyId, p.piso]))

  // 1) Un piso que el ciclo sabe atender pero que nadie declaró. Es el caso del Dúplex: no estaba
  // ni activo ni inactivo, sencillamente no existía para el interruptor — y un piso ausente no
  // aparece en ningún recuento, que es justo por lo que sobrevivió sin que nadie lo notara.
  const sinInterruptor = new Set<string>()
  for (const p of e.pisosConocidos) {
    if (!e.pisosDeclarados.has(p.propertyId)) {
      sinInterruptor.add(p.propertyId)
      out.push({ clase: 'piso_sin_interruptor', propertyId: p.propertyId, piso: p.piso })
    }
  }

  // 2) El hallazgo que de verdad importa: alguien llega y no tiene sus instrucciones.
  const enSombraConReservas = new Map<string, number>()
  for (const r of e.reservas) {
    const dIn = aDias(r.checkIn)
    if (dIn === null) continue
    const dias = dIn - dHoy
    if (dias < 0 || dias > AVISO_ANTELACION_DIAS) continue

    if (!e.pisosActivos.has(r.propertyId)) {
      // Su piso está en sombra: que no le llegue nada es lo ESPERADO, no una avería. Pero es un
      // huésped real sin instrucciones, así que se cuenta aparte en vez de callarlo.
      if (!sinInterruptor.has(r.propertyId)) {
        enSombraConReservas.set(r.propertyId, (enSombraConReservas.get(r.propertyId) ?? 0) + 1)
      }
      continue
    }
    if (r.hitosEnviados.some(h => HITOS_DE_ACCESO.includes(h))) continue
    out.push({ clase: 'llega_sin_acceso', bookingId: r.bookingId, piso: r.piso, huesped: r.huesped, checkIn: r.checkIn, dias })
  }
  for (const [propertyId, reservas] of enSombraConReservas) {
    out.push({ clase: 'piso_en_sombra_con_reservas', propertyId, piso: nombre.get(propertyId) ?? propertyId, reservas })
  }

  // 3) Hitos que quedaron registrados en sombra y siguen por delante. Desde el 05/09/2026 ya no
  // bloquean el envío (`hitosBloqueantes`), pero si aparecen es que un piso se activó con trabajo a
  // medias — la señal que faltaba aquella mañana.
  const porPiso = new Map<string, Set<string>>()
  for (const s of e.sombraPendiente) {
    if (!e.pisosActivos.has(s.propertyId)) continue
    if (!porPiso.has(s.propertyId)) porPiso.set(s.propertyId, new Set())
    porPiso.get(s.propertyId)!.add(s.tipo)
  }
  for (const [propertyId, hitos] of porPiso) {
    out.push({ clase: 'sombra_bloqueando', propertyId, piso: nombre.get(propertyId) ?? propertyId, hitos: [...hitos].sort() })
  }

  return out
}

/** Clave de dedupe: una vez por hallazgo y día. El cron pasa 48 veces al día. */
export function claveAviso(h: Hallazgo, hoy: string): string {
  switch (h.clase) {
    case 'llega_sin_acceso': return `${hoy}:llega_sin_acceso:${h.bookingId}`
    case 'piso_sin_interruptor': return `${hoy}:piso_sin_interruptor:${h.propertyId}`
    case 'piso_en_sombra_con_reservas': return `${hoy}:piso_en_sombra:${h.propertyId}`
    case 'sombra_bloqueando': return `${hoy}:sombra_bloqueando:${h.propertyId}`
  }
}

/** El texto del Telegram. `null` cuando no hay nada que decir — el día normal no manda nada. */
export function textoCobertura(hallazgos: Hallazgo[]): string | null {
  if (!hallazgos.length) return null
  const l: string[] = ['📭 <b>Mensajes a huéspedes — cobertura</b>']

  const llegan = hallazgos.filter(h => h.clase === 'llega_sin_acceso')
  if (llegan.length) {
    l.push('', '🚨 <b>Llegan sin sus instrucciones de acceso:</b>')
    for (const h of llegan) {
      if (h.clase !== 'llega_sin_acceso') continue
      const cuando = h.dias === 0 ? 'HOY' : h.dias === 1 ? 'mañana' : `en ${h.dias} días`
      l.push(`· ${h.huesped || '¿?'} — ${h.piso}, entra ${cuando} (${h.checkIn}) · reserva ${h.bookingId}`)
    }
    l.push('Comprueba su hilo en Smoobu y mándaselas a mano si no las tiene.')
  }

  for (const h of hallazgos) {
    if (h.clase === 'piso_sin_interruptor') {
      l.push('', `⚙️ <b>${h.piso}</b> no tiene fila en <code>mensajes_prog_pisos</code>: sus huéspedes no reciben NADA y el piso no sale en ningún recuento.`)
    } else if (h.clase === 'piso_en_sombra_con_reservas') {
      l.push('', `🕶️ <b>${h.piso}</b> está en SOMBRA y tiene ${h.reservas} reserva(s) llegando: esos huéspedes no van a recibir nada. Actívalo o mándaselas a mano.`)
    } else if (h.clase === 'sombra_bloqueando') {
      l.push('', `🩹 <b>${h.piso}</b> tiene hitos registrados en sombra pendientes (${h.hitos.join(', ')}): se generaron antes de activarlo.`)
    }
  }
  return l.join('\n')
}
