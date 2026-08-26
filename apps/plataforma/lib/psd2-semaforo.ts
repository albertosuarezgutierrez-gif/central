// lib/psd2-semaforo.ts — decisión PURA del estado del feed bancario PSD2 (Enable Banking)
// que pinta /banca. Tres estados, nunca dos: un feed que lleva días sin traer nada no es un
// feed sano aunque el cron devuelva 200 (caso fundacional 11→16/08/2026: 6 días a cero con la
// sesión viva). Calibración: en 120 días de histórico real el hueco medio fue ~1 día, pero hubo
// huecos legítimos de hasta 10 (BBVA ****1175) — a los 3 días se pide atención SIN alarmar
// (un fin de semana ya son 2-3 días sin apuntes), a los 6 se da por roto. El texto del estado
// «atención» no debe afirmar que un hueco así «nunca había pasado»: es mentira y confunde
// (queja de Alberto 23/08/2026 con el banner del domingo tras un jueves con movimientos).

export type NivelFeed = 'ok' | 'atencion' | 'roto'

export type EstadoFeed = {
  nivel: NivelFeed
  titular: string
  detalles: string[]
  // Avisos INFORMATIVOS del último sync (prefijo ℹ️). Van APARTE de `detalles` porque se
  // muestran SIEMPRE, también en verde: son limitaciones reales del feed («solo hay datos
  // desde X») que en un panel «todo ok» quedarían invisibles — y un hueco no declarado se
  // lee como «no hubo movimientos».
  notas: string[]
}

const DIA_MS = 24 * 3600 * 1000
// valid_until que pide iniciarAuth() al crear el consentimiento (lib/enablebanking.ts).
export const CONSENT_DIAS = 89
// Margen para re-vincular sin quedarse a oscuras.
export const CONSENT_AVISO_DIAS = 10
export const DIAS_ATENCION = 3
export const DIAS_ROTO = 6

export function diasEntre(aISO: string, bISO: string): number {
  return Math.round((Date.parse(bISO.slice(0, 10)) - Date.parse(aISO.slice(0, 10))) / DIA_MS)
}

export function fechaCaducidadConsent(consentCreadaISO: string): string {
  return new Date(Date.parse(consentCreadaISO.slice(0, 10)) + CONSENT_DIAS * DIA_MS).toISOString().slice(0, 10)
}

function fmtDDMM(iso: string): string {
  const [, m, d] = iso.split('-')
  return `${d}/${m}`
}

const ACCION = 'Re-vincula el banco desde «➕ Añadir → Conectar banco» (pide firmar en tu banco).'

// Un aviso con prefijo ℹ️ es INFORMATIVO: describe una limitación con la que el feed SIGUE
// funcionando (p. ej. «el banco rechazó la ventana de 89 días»). No es un fallo y por tanto
// no pone el semáforo en rojo ni dispara la alarma del cron. Los demás son fallos.
// Tampoco manda Telegram por su cuenta (ver el cron psd2-sync): una limitación permanente sin
// acción posible repetida cada mañana es ruido, y el sitio donde sí hace falta verla —porque
// dice desde cuándo hay datos de verdad— es /banca, que la pinta en permanencia.
export function esNota(aviso: string): boolean {
  return aviso.startsWith('ℹ️')
}

export function partirAvisos(avisos: string[] | null): { criticos: string[]; notas: string[] } {
  const todos = avisos ?? []
  return { criticos: todos.filter(a => !esNota(a)), notas: todos.filter(esNota) }
}

export function semaforoFeed(p: {
  hoyISO: string
  // Último movimiento psd2 importado (el más reciente entre todas las cuentas del feed).
  ultimoMovISO: string | null
  // ultimo_avisos del último sync; null = el sync aún no reporta (fila anterior al cambio) —
  // NO equivale a «sin avisos»: en ese caso decide solo la frescura.
  avisos: string[] | null
  // created_at de la conexión MÁS ANTIGUA vinculada (la primera en caducar).
  consentCreadaISO: string
}): EstadoFeed {
  const diasMov = p.ultimoMovISO == null ? null : diasEntre(p.ultimoMovISO, p.hoyISO)
  const caducaISO = fechaCaducidadConsent(p.consentCreadaISO)
  const caducaEn = CONSENT_DIAS - diasEntre(p.consentCreadaISO, p.hoyISO)
  const lineaConsent = caducaEn > 0
    ? `Consentimiento del banco hasta el ${fmtDDMM(caducaISO)} (${caducaEn} día${caducaEn === 1 ? '' : 's'}).`
    : `El consentimiento del banco caducó el ${fmtDDMM(caducaISO)}.`

  // Los avisos con prefijo ℹ️ son INFORMATIVOS (p. ej. «ventana de 89 días rechazada, importado
  // desde X» — el feed FUNCIONA con ventana corta, caso Kutxabank 17/08/2026): se muestran pero
  // no ponen el semáforo en rojo ni piden re-vincular. Solo los avisos de FALLO son críticos.
  const { criticos, notas } = partirAvisos(p.avisos)
  const conNotas = (e: Omit<EstadoFeed, 'notas'>): EstadoFeed => ({ ...e, notas })

  if (caducaEn <= 0) {
    return conNotas({ nivel: 'roto', titular: 'Consentimiento bancario CADUCADO — el banco ya no entrega datos', detalles: [lineaConsent, ACCION] })
  }
  if (criticos.length > 0) {
    return conNotas({ nivel: 'roto', titular: 'El banco no está entregando movimientos', detalles: [...criticos, ACCION] })
  }
  if (diasMov == null) {
    // Sin movimientos importados nunca: no se sabe si el feed funciona — no se afirma que sí.
    return conNotas({ nivel: 'atencion', titular: 'Conectado, pero sin movimientos importados todavía', detalles: [lineaConsent] })
  }
  if (diasMov >= DIAS_ROTO) {
    return conNotas({
      nivel: 'roto',
      titular: `${diasMov} días sin movimientos nuevos del banco`,
      detalles: [`Último movimiento: ${fmtDDMM(p.ultimoMovISO!.slice(0, 10))}. Demasiado hueco para ser un parón normal de estas cuentas — lo más probable es que el feed esté roto.`, lineaConsent, ACCION],
    })
  }
  if (diasMov >= DIAS_ATENCION) {
    return conNotas({
      nivel: 'atencion',
      titular: `${diasMov} días sin movimientos nuevos del banco`,
      detalles: [`Último movimiento: ${fmtDDMM(p.ultimoMovISO!.slice(0, 10))}. La conexión no reporta fallos: lo más probable es que sean días sin operaciones (fin de semana, festivos). Solo si llega a ${DIAS_ROTO} días se dará el feed por roto.`, lineaConsent],
    })
  }
  if (caducaEn <= CONSENT_AVISO_DIAS) {
    return conNotas({
      nivel: 'atencion',
      titular: `El consentimiento del banco caduca en ${caducaEn} día${caducaEn === 1 ? '' : 's'}`,
      detalles: [lineaConsent, ACCION],
    })
  }
  return conNotas({
    nivel: 'ok',
    titular: diasMov === 0 ? 'Banco al día — hay movimientos de hoy' : `Banco al día — último movimiento hace ${diasMov} día${diasMov === 1 ? '' : 's'}`,
    detalles: [lineaConsent],
  })
}
