// packages/module-seguros/src/lead-competencia.ts
//
// El carril de LEADS de Vencimientos (Fase 1 de ASegura OS, 23/09/2026).
//
// ── Por qué existe ──────────────────────────────────────────────────────────
// La tabla heredada `seguros.oportunidades` (app de Manuel, importada el
// 21/06/2026) guarda 3.676 pólizas que los leads tenían en OTRA compañía, con
// su `fecha_fin_vigencia` real entre mayo de 2023 y mayo de 2024. Medido el
// 23/09/2026: 3.546 de esas filas son contactables (874 con aniversario en los
// próximos 90 días) y no son hoy clientes en vigor. Nadie las leía: la
// recaptación solo miraba el volcado de 2013-2018, del que salían 216
// contactables. Una póliza de auto u hogar renueva cada año en el mismo día,
// así que el aniversario de una fecha de hace 2 años es una pista mucho mejor
// que el de una de hace 10.
//
// 🚨 La fecha que sale de aquí es ESTIMADA, siempre: la póliza pudo cambiar de
// compañía, de fecha o darse de baja desde 2023. Se rotula como tal en cada
// fila y la llamada la confirma. Nunca se presenta como el vencimiento real.

export type VentanaLead = 'menos_30' | '30_60' | '60_90' | 'mas_90'

/**
 * El próximo aniversario (≥ hoy) de una fecha pasada, en `yyyy-mm-dd`.
 * `null` si la fecha no se puede leer: sin fecha no hay a qué anclar el
 * contacto, y eso no es «vence hoy». Un 29 de febrero cae al 28 en años no
 * bisiestos (la compañía emite el día anterior, no el siguiente).
 */
export function proximoAniversario(fechaIso: string | null | undefined, hoy: Date): string | null {
  if (typeof fechaIso !== 'string') return null
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(fechaIso)
  if (!m) return null
  const mes = Number(m[2])
  const dia = Number(m[3])
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null
  const base = Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), hoy.getUTCDate())
  for (let anio = hoy.getUTCFullYear(); anio <= hoy.getUTCFullYear() + 1; anio++) {
    const ultimoDelMes = new Date(Date.UTC(anio, mes, 0)).getUTCDate()
    const t = Date.UTC(anio, mes - 1, Math.min(dia, ultimoDelMes))
    if (t >= base) return new Date(t).toISOString().slice(0, 10)
  }
  return null
}

/** Días naturales entre hoy y una fecha `yyyy-mm-dd` (0 = hoy). */
export function diasHasta(fechaIso: string, hoy: Date): number {
  const [a, m, d] = fechaIso.split('-').map(Number)
  const base = Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), hoy.getUTCDate())
  return Math.round((Date.UTC(a, m - 1, d) - base) / 86_400_000)
}

export function ventanaDe(dias: number): VentanaLead {
  if (dias < 30) return 'menos_30'
  if (dias < 60) return '30_60'
  if (dias < 90) return '60_90'
  return 'mas_90'
}

export type DatosPuntuacion = {
  tieneTelefono: boolean
  tieneEmail: boolean
  /** `null` = no se conoce la prima. Nunca cuenta como 0. */
  prima: number | null
  /** Abrió o respondió algún contacto nuestro antes. */
  respondioAntes: boolean
  /** Ramo en el vocabulario de `polizas.tipo`. */
  ramo: string
}

/** Ramos que hoy sabemos tarificar y emitir: un lead de estos se puede cerrar el mismo día. */
const RAMOS_TARIFICABLES = new Set(['auto', 'hogar', 'moto'])

/**
 * Puntuación 0-100 para ORDENAR la lista, no para decidir nada: por reglas y
 * a la vista, sin modelo. Pesa sobre todo poder hablar con él (sin canal no se
 * vende) y que el ramo se pueda tarificar hoy. La prima desconocida no resta:
 * no saberla no es que sea baja.
 */
export function puntuarLead(d: DatosPuntuacion): number {
  let p = 0
  if (d.tieneTelefono) p += 35
  if (d.tieneEmail) p += 15
  if (RAMOS_TARIFICABLES.has(d.ramo)) p += 25
  if (d.respondioAntes) p += 15
  if (d.prima !== null && Number.isFinite(d.prima)) {
    if (d.prima >= 600) p += 10
    else if (d.prima >= 300) p += 6
    else p += 3
  }
  return Math.min(100, p)
}

export type PasoLead =
  | { accion: 'esperar'; motivo: string; dentroDeDias: number }
  | { accion: 'primer_contacto' | 'recordatorio' | 'llamada'; motivo: string; dentroDeDias: number }
  | { accion: 'aparcar'; motivo: string; dentroDeDias: 0 }
  /** Hay una tarea pendiente que no es una llamada: manda ella, no la secuencia. */
  | { accion: 'tarea'; motivo: string; dentroDeDias: number }

/**
 * Una tarea pendiente de la oportunidad manda sobre la secuencia: si pidió
 * precio o que le llamen el jueves, lo que toca es ESO, no otro recordatorio.
 * Sin esto, quien acaba de decir «quiero precio» volvería a salir en la cola
 * de llamadas de hoy. La vencida se dice vencida (0 días), no se esconde.
 */
export function pasoConTarea(
  paso: PasoLead,
  tarea: { tipo: string; fechaLimite: string; observaciones: string } | null,
  hoy: Date,
): PasoLead {
  if (tarea === null) return paso
  const d = diasHasta(tarea.fechaLimite, hoy)
  const cuando = d < 0 ? `vencida hace ${-d} día(s)` : d === 0 ? 'para hoy' : `para el ${tarea.fechaLimite}`
  const que = tarea.observaciones.split('\n')[0].slice(0, 120)
  return tarea.tipo === 'llamada'
    ? { accion: 'llamada', motivo: `${que} (${cuando})`, dentroDeDias: Math.max(0, d) }
    : { accion: 'tarea', motivo: `${que} (${cuando})`, dentroDeDias: Math.max(0, d) }
}

/** A cuántos días del aniversario se escribe por primera vez. */
export const DIAS_PRIMER_CONTACTO = 60
export const DIAS_RECORDATORIO = 7
export const DIAS_LLAMADA = 14
export const MAX_INTENTOS = 3
/** Con quien respondió se insiste algo más, pero con tope y espaciado. */
export const MAX_INTENTOS_RESPONDIO = 5
export const DIAS_ENTRE_LLAMADAS_RESPONDIO = 2

/**
 * Qué toca con un lead, por reglas: primer contacto a 60 días del aniversario,
 * recordatorio a los 7 días sin respuesta, llamada a los 14 y, tras 3 intentos
 * sin respuesta, se aparca hasta el año siguiente. `diasDesdeUltimo` = `null`
 * cuando nunca se le contactó. Un lead que ya RESPONDIÓ (abrió o pinchó) no
 * se aparca ni recibe otro recordatorio: está templado y toca llamarle.
 * Nada aquí envía nada: dice qué toca y cuándo.
 */
export function siguientePasoLead(
  dias: number,
  intentos: number,
  diasDesdeUltimo: number | null,
  respondio = false,
  propuestaEnviada = false,
): PasoLead {
  // Con propuesta enviada ya no se capta: se confirma si la acepta.
  if (propuestaEnviada) {
    const falta = diasDesdeUltimo === null ? 0 : Math.max(0, DIAS_RECORDATORIO - diasDesdeUltimo)
    return { accion: 'llamada', motivo: 'tiene una propuesta enviada: confirma si la acepta', dentroDeDias: falta }
  }
  // Templado, pero no para siempre: llamadas espaciadas y, pasado el tope,
  // se aparca como cualquiera (si no, un «no contesta» detrás de otro lo
  // devolvería a la cola cada día sin fin).
  if (respondio && intentos > 0 && intentos < MAX_INTENTOS_RESPONDIO) {
    const falta = diasDesdeUltimo === null ? 0 : Math.max(0, DIAS_ENTRE_LLAMADAS_RESPONDIO - diasDesdeUltimo)
    return { accion: 'llamada', motivo: 'respondió a un contacto anterior: llámale mientras está templado', dentroDeDias: falta }
  }
  if (intentos >= MAX_INTENTOS) {
    return { accion: 'aparcar', motivo: `${intentos} intentos sin respuesta: se aparca hasta el año que viene`, dentroDeDias: 0 }
  }
  if (diasDesdeUltimo === null || intentos === 0) {
    if (dias > DIAS_PRIMER_CONTACTO) {
      return { accion: 'esperar', motivo: `se le escribe a ${DIAS_PRIMER_CONTACTO} días de su aniversario`, dentroDeDias: dias - DIAS_PRIMER_CONTACTO }
    }
    return { accion: 'primer_contacto', motivo: 'le vence pronto y aún no se le ha contactado', dentroDeDias: 0 }
  }
  if (intentos === 1) {
    const falta = Math.max(0, DIAS_RECORDATORIO - diasDesdeUltimo)
    return { accion: 'recordatorio', motivo: 'no ha respondido al primer contacto', dentroDeDias: falta }
  }
  const falta = Math.max(0, DIAS_LLAMADA - diasDesdeUltimo)
  return { accion: 'llamada', motivo: 'no ha respondido a dos contactos: mejor por teléfono', dentroDeDias: falta }
}

// ─── Por dónde se le puede escribir (LSSI art. 21.2) ─────────────────────────
// Por CORREO solo a quien fue cliente nuestro: la LSSI permite la comunicación
// comercial por medios electrónicos sin consentimiento previo únicamente si hubo
// relación contractual y se ofrecen productos similares (y siempre con la baja
// en cada envío). Al resto, teléfono. Un lead con correo y sin teléfono que
// nunca fue cliente no tiene canal PERMITIDO aunque tenga canal — y eso no es
// «sin datos», es «no se le puede escribir»: se cuenta aparte, no se esconde.
// El consentimiento comercial del portal (`portal_consentimiento`, tipo
// `comercial`) también abriría el correo; aún no se cruza aquí.

export type CanalLead = 'telefono_y_correo' | 'solo_telefono' | 'solo_correo' | 'sin_canal_permitido'

export function canalLead(d: { fueCliente: boolean; tieneTelefono: boolean; tieneEmail: boolean }): CanalLead {
  const correo = d.tieneEmail && d.fueCliente
  if (d.tieneTelefono && correo) return 'telefono_y_correo'
  if (d.tieneTelefono) return 'solo_telefono'
  if (correo) return 'solo_correo'
  return 'sin_canal_permitido'
}

/**
 * ¿Se le puede escribir por WhatsApp? WhatsApp es «comunicación electrónica»
 * (LSSI art. 21), el mismo régimen que el correo: sin consentimiento, solo a
 * quien FUE cliente. Un `fueCliente` desconocido (`null`) no abre la puerta.
 * Que el número sea un móvil lo decide la pantalla (`urlWhatsapp`), no esto.
 */
export function puedeWhatsappLead(d: { fueCliente: boolean | null; tieneTelefono: boolean }): boolean {
  return d.fueCliente === true && d.tieneTelefono
}

/**
 * El paso, dicho con el canal que de verdad se puede usar: «primer contacto» a
 * quien no se le puede escribir es una llamada. Con `whatsapp` (Alberto,
 * 23/09/2026: es la vía preferente) el primer contacto y el recordatorio son
 * por WhatsApp antes que por correo.
 */
export function textoPasoLead(paso: { accion: PasoLead['accion']; dentroDeDias: number }, canal: CanalLead, whatsapp = false): string {
  const correo = canal === 'telefono_y_correo' || canal === 'solo_correo'
  const telefono = canal === 'telefono_y_correo' || canal === 'solo_telefono'
  const wa = whatsapp && telefono
  switch (paso.accion) {
    case 'esperar':
      return `Esperar ${paso.dentroDeDias} día(s)`
    case 'primer_contacto':
      return wa ? 'Primer WhatsApp' : correo ? 'Primer correo' : telefono ? 'Primera llamada' : 'Sin canal permitido'
    case 'recordatorio':
      return wa ? 'Recordatorio por WhatsApp' : correo ? 'Recordatorio por correo' : telefono ? 'Volver a llamar' : 'Sin canal permitido'
    case 'llamada':
      return telefono ? 'Llamar' : correo ? 'Sin teléfono: escribir por correo' : 'Sin canal permitido'
    case 'aparcar':
      return 'Proponer aparcar hasta el año que viene'
    case 'tarea':
      return paso.dentroDeDias > 0 ? `Tarea pendiente en ${paso.dentroDeDias} día(s)` : 'Tarea pendiente'
  }
}
