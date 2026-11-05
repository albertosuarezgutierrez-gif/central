// Calendario por modelo y periodo + ciclo de vida de una declaración (borrador → revisado por gestor → presentado manualmente). PURO, reloj inyectado.
//
// Plazos [Probable: calendario general AEAT para año natural; los que caen en sábado, domingo o festivo se trasladan al siguiente día hábil y
// aquí NO se modela; el asesor los valida]. Coinciden con `vencimientosFiscalesDelAnio` (avisos F2): un test lo vigila.
//   · trimestrales 303, 111, 115, 130, 349: 1T → 20/04 · 2T → 20/07 · 3T → 20/10 · 4T → 30/01 del año siguiente
//   · 390: 30/01 · 180 y 190: 31/01 · 347: último día de febrero (todos del año siguiente al ejercicio)
// AVISO LEGAL: la presentación la hace el titular o su gestor con certificado digital. Este software solo prepara el borrador y registra
// que se presentó (fecha y referencia del justificante como texto): NUNCA envía nada a la AEAT.
import { ErrorContable } from '../partida/dinero.ts'
import { aFechaISO, diasEntre } from '../analisis/periodos.ts'
import { esModeloAnual, type CalculoModelo, type ModeloAeat, type PeriodoModelo } from './comun.ts'

export const AVISO_PRESENTACION = 'La presentación la hace el titular o su gestor con certificado digital. Este programa solo prepara el borrador y guarda la fecha y la referencia del justificante.'

const iso = (a: number, m: number, d: number) => `${a}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
const ultimoFeb = (a: number) => new Date(Date.UTC(a, 2, 0)).getUTCDate()

/** Fecha límite de presentación (ISO) del modelo para el ejercicio y periodo. Lanza si la combinación no existe (p. ej. 303 anual). */
export function vencimientoModelo(modelo: ModeloAeat, anio: number, periodo: PeriodoModelo): string {
  if (esModeloAnual(modelo)) {
    if (periodo !== '0A') throw new ErrorContable('periodo_invalido', `el modelo ${modelo} es anual (0A)`)
    if (modelo === '390') return iso(anio + 1, 1, 30)
    if (modelo === '347') return iso(anio + 1, 2, ultimoFeb(anio + 1))
    return iso(anio + 1, 1, 31) // 180, 190
  }
  switch (periodo) {
    case '1T': return iso(anio, 4, 20)
    case '2T': return iso(anio, 7, 20)
    case '3T': return iso(anio, 10, 20)
    case '4T': return iso(anio + 1, 1, 30)
    default: throw new ErrorContable('periodo_invalido', `el modelo ${modelo} es trimestral (1T-4T)`)
  }
}

/** Modelos que corresponden a la forma de la empresa (el 130 solo a autónomos). */
export function modelosDeForma(forma: 'sociedad' | 'autonomo'): ModeloAeat[] {
  const comunes: ModeloAeat[] = ['303', '390', '111', '115', '190', '180', '347', '349']
  return forma === 'autonomo' ? [...comunes, '130'] : comunes
}

export type PlazoModelo = { modelo: ModeloAeat; anio: number; periodo: PeriodoModelo; vencimiento: string; diasRestantes: number }

/**
 * Plazos que vencen desde hoy hasta dentro de `horizonteDias` (por defecto un año), ordenados. El reloj viene de fuera (`hoy`).
 * Recorre los ejercicios `hoy-1 … hoy` (un 4T/anual del ejercicio anterior vence ahora).
 */
export function proximosPlazos(hoy: Date, forma: 'sociedad' | 'autonomo', horizonteDias = 365): PlazoModelo[] {
  const h = aFechaISO(hoy)
  const a = hoy.getUTCFullYear()
  const salida: PlazoModelo[] = []
  for (const anio of [a - 1, a]) {
    for (const modelo of modelosDeForma(forma)) {
      const periodos: PeriodoModelo[] = esModeloAnual(modelo) ? ['0A'] : ['1T', '2T', '3T', '4T']
      for (const periodo of periodos) {
        const vencimiento = vencimientoModelo(modelo, anio, periodo)
        const dias = diasEntre(h, vencimiento)
        if (dias >= 0 && dias <= horizonteDias) salida.push({ modelo, anio, periodo, vencimiento, diasRestantes: dias })
      }
    }
  }
  return salida.sort((x, y) => x.diasRestantes - y.diasRestantes || (x.modelo < y.modelo ? -1 : 1))
}

// ── Ciclo de vida ───────────────────────────────────────────────────────────────────────────────────────────────

export type EstadoDeclaracion = 'borrador' | 'revisado' | 'presentado'
export const ESTADOS_DECLARACION: readonly EstadoDeclaracion[] = ['borrador', 'revisado', 'presentado']
export const esEstadoDeclaracion = (v: unknown): v is EstadoDeclaracion => typeof v === 'string' && (ESTADOS_DECLARACION as readonly string[]).includes(v)

const PERMITIDAS: Readonly<Record<EstadoDeclaracion, readonly EstadoDeclaracion[]>> = {
  borrador: ['revisado'],
  revisado: ['borrador', 'presentado'], // el gestor puede devolverlo a borrador (cambian los datos)
  presentado: [], // definitivo: una corrección es una declaración COMPLEMENTARIA nueva, no se edita
}
export const puedeTransitar = (de: EstadoDeclaracion, a: EstadoDeclaracion) => PERMITIDAS[de].includes(a)

/** Problemas por los que un cálculo NO puede pasar a «revisado» (vacía = puede). */
export function problemasParaRevisar(c: Pick<CalculoModelo, 'noSoportado' | 'resultado' | 'modelo'>): string[] {
  const p: string[] = []
  if (c.noSoportado.length) p.push(`contiene casos no soportados: ${c.noSoportado.join('; ')}`)
  if (c.resultado === null && !['190', '180', '347', '349', '390'].includes(c.modelo) && c.noSoportado.length === 0) p.push('resultado no calculable')
  return p
}

export type DatosPresentacion = { fechaPresentacion: string; /** Referencia del justificante (texto: nº de justificante/CSV). Nunca se guarda el fichero. */ justificante: string }
const JUSTIFICANTE = /^[A-Za-z0-9 ./_\-]{3,60}$/

/** Valida la presentación manual: fecha ISO real, no futura (reloj inyectado), y justificante como referencia de texto. */
export function problemasPresentacion(d: DatosPresentacion, hoy: Date): string[] {
  const p: string[] = []
  const f = d?.fechaPresentacion
  if (typeof f !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(f) || new Date(`${f}T00:00:00Z`).toISOString().slice(0, 10) !== f) p.push('la fecha de presentación no es válida')
  else if (f > aFechaISO(hoy)) p.push('la fecha de presentación no puede ser futura')
  if (typeof d?.justificante !== 'string' || !JUSTIFICANTE.test(d.justificante.trim())) p.push('el justificante es una referencia de texto de 3 a 60 caracteres (letras, números, espacio . / _ -)')
  return p
}

export type EstadoModeloPeriodo = { estado: EstadoDeclaracion | 'sin_calcular'; version: number; presentadoEl: string | null; justificante: string | null }
