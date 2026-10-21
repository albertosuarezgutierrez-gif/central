// Aviso por Telegram cuando la cola de revisión de Google Contactos lleva días con pendientes de fichas
// cliente EN VIGOR (21/10/2026: estuvo 16 días atascada sin que nadie se enterase y dejó clientas sin 🟢 ni
// botón de portal). PURO: la consulta y el envío viven en `aviso-cola-google-contactos-ejecutar.ts`.
// Solo cifras, nunca nombres ni datos de contacto.

/** Días que puede esperar una revisión pendiente antes de avisar (se avisa con ≥ este valor). */
export const UMBRAL_DIAS_AVISO_COLA = 3

/** Hora de Madrid a la que sale el aviso: el cron es horario, esta guarda lo deja en UN aviso al día. */
export const HORA_AVISO_COLA = 9

export type FilaPendienteCola = {
  creadoEn: Date
  /**
   * `true` = la ficha tiene alguna póliza en vigor (`esCarteraEnVigor`). `false` = SABIDO que no (sin ficha o sin
   * póliza viva). `null` = no se pudo calcular (no se sabe), NO es «no en vigor».
   */
  enVigor: boolean | null
}

export type AvisoColaGoogle = {
  /** Todas las pendientes de la cola. */
  total: number
  /** Pendientes de ficha EN VIGOR confirmada. */
  enVigor: number
  /** Pendientes con `enVigor` desconocido (no se pudo calcular). */
  sinConfirmar: number
  /** Antigüedad (días enteros) de la más antigua de las que disparan el aviso. */
  masAntigua_dias: number
}

const MS_DIA = 86_400_000

/**
 * `null` = nada que avisar. Dispara si alguna pendiente con `enVigor !== false` lleva ≥ `UMBRAL_DIAS_AVISO_COLA` días.
 * 🚨 `enVigor === null` cuenta como posible en vigor (estado conservador: una falsa alarma cuesta un vistazo; un
 * silencio con clientas sin portal ya costó 16 días). Solo las pendientes SABIDAMENTE no en vigor no avisan.
 */
export function avisoColaGoogle(filas: readonly FilaPendienteCola[], ahora: Date): AvisoColaGoogle | null {
  const candidatas = filas.filter((f) => f.enVigor !== false)
  const antiguedad = (f: FilaPendienteCola) => Math.floor((ahora.getTime() - f.creadoEn.getTime()) / MS_DIA)
  const vencidas = candidatas.filter((f) => antiguedad(f) >= UMBRAL_DIAS_AVISO_COLA)
  if (vencidas.length === 0) return null
  return {
    total: filas.length,
    enVigor: candidatas.filter((f) => f.enVigor === true).length,
    sinConfirmar: candidatas.filter((f) => f.enVigor === null).length,
    masAntigua_dias: Math.max(...vencidas.map(antiguedad)),
  }
}

/** Mensaje en HTML de `tgSend`: solo cifras y el enlace a la pantalla de plataforma. */
export function textoAvisoColaGoogle(a: AvisoColaGoogle, urlPlataforma: string): string {
  const base = urlPlataforma.replace(/\/+$/, '')
  const lineas = [
    '📇 <b>Google Contactos: revisiones sin resolver</b>',
    `${a.total} pendientes (${a.enVigor} de clientes en vigor), la más antigua con ${a.masAntigua_dias} días.`,
  ]
  if (a.sinConfirmar > 0) lineas.push(`⚠️ ${a.sinConfirmar} sin poder confirmar si la ficha está en vigor.`)
  lineas.push('Mientras estén sin resolver, esas fichas no se sincronizan bien.', `${base}/correduria/google-contactos`)
  return lineas.join('\n')
}
