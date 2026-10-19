// SEGUIMIENTO de un lead por correo (19/10/2026, spec
// docs/superpowers/specs/2026-10-19-correduria-lead-a-propuesta-automatica-design.md, F5). PURO: ni red, ni BD, ni env.
//
// Lo comparten plataforma (el cron del triaje decide QUÉ hito toca y avisa a Alberto) y asegura (vuelve a decidirlo
// al ENVIAR, con la BD de ese momento: si el cliente ha contestado entre el aviso y el ✅, ya no toca y no sale nada).
//
// Reglas que no se negocian:
//   1. El reloj corre desde el ÚLTIMO ENVÍO REAL registrado en el hilo (petición, repregunta, recordatorio o propuesta),
//      nunca desde el aviso a Alberto ni desde la pasada del cron. Un aviso descartado no mueve el reloj.
//   2. Un hito = (etapa, ancla). El ancla es la fecha del último envío real: mientras no haya un envío nuevo, el mismo
//      hito da la MISMA clave y el cron no vuelve a avisar (un aviso por hito, nunca uno por pasada).
//   3. Un cliente que escribe DESPUÉS del último envío corta la cadena.
//   4. Lo que no se sabe no avisa: un dato `null` que hace falta (columna sin SQL, presupuesto que no se pudo leer) =
//      no hay hito. Nunca se recuerda a alguien de quien no se sabe si contestó.
//   5. Solo en ventana (9-20 h, hora de Madrid): fuera de ella no se avisa ni se envía nada solo.

/** Hora de Madrid en la que empieza la ventana (incluida) y en la que acaba (excluida). */
export const VENTANA_SEGUIMIENTO = { desde: 9, hasta: 20 } as const

/** Horas desde el último envío real hasta cada hito. 48 h + 72 h = el 2º recordatorio a los 5 días de la petición. */
export const HORAS_HITO = {
  datos_1: 48,
  datos_2: 72,
  datos_cerrar: 48,
  propuesta_1: 72,
} as const

export type EtapaSeguimientoLead = keyof typeof HORAS_HITO
export const ETAPAS_SEGUIMIENTO_LEAD = Object.keys(HORAS_HITO) as EtapaSeguimientoLead[]
/** Etapas que mandan un correo al cliente (la de cerrar solo PREGUNTA a Alberto). */
export const ETAPAS_CON_ENVIO: readonly EtapaSeguimientoLead[] = ['datos_1', 'datos_2', 'propuesta_1']

export const esEtapaSeguimientoLead = (v: unknown): v is EtapaSeguimientoLead =>
  typeof v === 'string' && (ETAPAS_SEGUIMIENTO_LEAD as string[]).includes(v)

/** Estados del expediente de datos en los que el cliente nos DEBE una respuesta. */
const ESPERANDO_DATOS = new Set(['pedida', 'incompleta'])

export type HiloSeguimiento = {
  estadoDatos: string
  /** Último envío de petición o repregunta (F1/F2). `null` = no consta ninguno. */
  ultimaPeticionAt: string | null
  /** Último recordatorio ENVIADO (F5). */
  ultimoRecordatorioAt: string | null
  /** Recordatorios enviados desde el envío base. `null` = no se sabe (SQL de F5 sin aplicar): no hay hito. */
  recordatoriosEnviados: number | null
  /** Último correo del cliente casado con este hilo. */
  ultimoContactoClienteAt: string | null
  cerradoPerdidoAt: string | null
  /** Propuesta enviada en el hilo (F4 lo anota). `null` = no hay propuesta. */
  propuestaEnviadaAt: string | null
  /** `true` aceptada/emitida/retirada (no se recuerda) · `false` abierta sin aceptar · `null` no se pudo leer. */
  propuestaCerrada: boolean | null
}

export type HitoSeguimiento = {
  etapa: EtapaSeguimientoLead
  /** ISO del último envío real: con la etapa, la clave del hito. */
  ancla: string
  /** Recordatorios que habrá DESPUÉS de este envío (lo que se escribe al enviarlo). */
  recordatoriosTrasEnvio: number
}

const ms = (v: string | null): number | null => {
  if (!v) return null
  const t = Date.parse(v)
  return Number.isNaN(t) ? null : t
}

/** ¿Hora de Madrid dentro de la ventana 9-20 h? PURA. */
export function enVentanaSeguimiento(ahora: Date): boolean {
  const h = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Madrid', hour: '2-digit', hourCycle: 'h23' }).format(ahora))
  return Number.isFinite(h) && h >= VENTANA_SEGUIMIENTO.desde && h < VENTANA_SEGUIMIENTO.hasta
}

/**
 * Qué hito toca HOY para este hilo, o `null`. No mira la ventana (eso lo decide quien avisa o envía): así asegura puede
 * re-verificar un ✅ pulsado por Alberto. PURA.
 */
export function hitoSeguimientoLead(h: HiloSeguimiento, ahora: Date): HitoSeguimiento | null {
  if (h.cerradoPerdidoAt) return null
  if (h.recordatoriosEnviados === null || !Number.isInteger(h.recordatoriosEnviados) || h.recordatoriosEnviados < 0) return null
  const ahoraMs = ahora.getTime()
  const contacto = ms(h.ultimoContactoClienteAt)
  const recordatorio = ms(h.ultimoRecordatorioAt)

  const cadena = (base: number): { n: number; ancla: number } | null => {
    // El cliente escribió después del último envío de la cadena: la corta.
    // Cualquier correo suyo posterior al envío base (o a un recordatorio, que es posterior) corta la cadena.
    if (contacto !== null && contacto >= base) return null
    const n = recordatorio !== null && recordatorio > base ? h.recordatoriosEnviados! : 0
    return { n, ancla: n > 0 ? recordatorio! : base }
  }
  const pasaron = (ancla: number, horas: number) => ahoraMs - ancla >= horas * 3_600_000

  // La propuesta es la etapa más avanzada: si hay una enviada, manda ella.
  const propuesta = ms(h.propuestaEnviadaAt)
  if (h.propuestaEnviadaAt !== null) {
    if (propuesta === null || h.propuestaCerrada !== false) return null
    const c = cadena(propuesta)
    if (!c || c.n > 0) return null // un solo recordatorio de la propuesta
    return pasaron(c.ancla, HORAS_HITO.propuesta_1)
      ? { etapa: 'propuesta_1', ancla: new Date(c.ancla).toISOString(), recordatoriosTrasEnvio: 1 }
      : null
  }

  if (!ESPERANDO_DATOS.has(h.estadoDatos)) return null
  const base = ms(h.ultimaPeticionAt)
  if (base === null) return null
  const c = cadena(base)
  if (!c) return null
  const etapa: EtapaSeguimientoLead = c.n === 0 ? 'datos_1' : c.n === 1 ? 'datos_2' : 'datos_cerrar'
  if (!pasaron(c.ancla, HORAS_HITO[etapa])) return null
  return { etapa, ancla: new Date(c.ancla).toISOString(), recordatoriosTrasEnvio: c.n + 1 }
}

/** ¿El hito que se aprobó sigue siendo EL que toca ahora (misma etapa y mismo ancla)? PURA. */
export function mismoHito(a: HitoSeguimiento | null, etapa: string, ancla: string): boolean {
  if (!a || a.etapa !== etapa) return false
  const x = Date.parse(a.ancla)
  const y = Date.parse(ancla)
  return Number.isFinite(x) && x === y
}

/** Clave estable del hito (sin datos personales): `f5:<hilo>:<etapa>:<ancla en ms>`. PURA. */
export function claveHitoSeguimiento(hiloId: string, hito: Pick<HitoSeguimiento, 'etapa' | 'ancla'>): string {
  return `f5:${hiloId}:${hito.etapa}:${Date.parse(hito.ancla)}`
}
