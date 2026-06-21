// ────────────────────────────────────────────────────────────────────────────
// Go / No-Go — PURO. Cruza la ficha del concurso con el perfil de la empresa
// y devuelve un semáforo con las banderas rojas (causas de exclusión o riesgo).
// No decide por el usuario: orienta la decisión de "¿me presento?".
// ────────────────────────────────────────────────────────────────────────────

import type { FichaConcurso, PerfilEmpresa, EvaluacionGoNoGo, BanderaRoja, Semaforo } from './types'

/** Días de margen por debajo de los cuales el plazo de presentación es un riesgo. */
const DIAS_MINIMOS_PRESENTACION = 3

function diasHasta(fechaISO: string | undefined, hoy: Date): number | null {
  if (!fechaISO) return null
  const f = new Date(fechaISO + 'T00:00:00')
  if (isNaN(f.getTime())) return null
  const ms = f.getTime() - new Date(hoy.toDateString()).getTime()
  return Math.round(ms / 86_400_000)
}

/**
 * Evalúa si la empresa puede/debe presentarse.
 *
 * @param ficha   ficha extraída del pliego
 * @param perfil  capacidades acreditables de la empresa licitadora
 * @param hoy     fecha de referencia (inyectable para tests; por defecto, ahora)
 */
export function evaluarGoNoGo(
  ficha: FichaConcurso,
  perfil: PerfilEmpresa = {},
  hoy: Date = new Date(),
): EvaluacionGoNoGo {
  const banderas: BanderaRoja[] = []

  // 1) Solvencia económica: volumen de negocio exigido vs. el de la empresa.
  if (perfil.volumen_negocio_anual !== undefined) {
    for (const s of ficha.solvencia) {
      if (s.ambito === 'economica' && s.importe_minimo !== undefined &&
          perfil.volumen_negocio_anual < s.importe_minimo) {
        banderas.push({
          severidad: 'bloqueante',
          motivo: `Solvencia económica insuficiente: exige ${s.importe_minimo.toLocaleString('es-ES')} € y la empresa declara ${perfil.volumen_negocio_anual.toLocaleString('es-ES')} €`,
        })
      }
    }
  } else if (ficha.solvencia.some(s => s.ambito === 'economica')) {
    banderas.push({ severidad: 'aviso', motivo: 'El pliego exige solvencia económica: confirma que la empresa la acredita' })
  }

  // 2) Plazo de presentación demasiado cerca.
  const dias = diasHasta(ficha.plazos.fin_presentacion, hoy)
  if (dias !== null) {
    if (dias < 0) banderas.push({ severidad: 'bloqueante', motivo: `El plazo de presentación ya venció (${ficha.plazos.fin_presentacion})` })
    else if (dias < DIAS_MINIMOS_PRESENTACION) banderas.push({ severidad: 'aviso', motivo: `Quedan sólo ${dias} día(s) para presentar (${ficha.plazos.fin_presentacion})` })
  }

  // 3) Plazo de ejecución vs. disponibilidad operativa de la empresa.
  if (ficha.plazos.ejecucion_meses !== undefined && perfil.meses_disponibilidad !== undefined &&
      perfil.meses_disponibilidad < ficha.plazos.ejecucion_meses) {
    banderas.push({
      severidad: 'aviso',
      motivo: `El contrato dura ${ficha.plazos.ejecucion_meses} meses y la empresa declara ${perfil.meses_disponibilidad} de disponibilidad`,
    })
  }

  // 4) Garantías: si exige aval y la empresa dice no poder avalar.
  const exigeGarantia = !!(ficha.garantias.provisional_pct || ficha.garantias.definitiva_pct)
  if (exigeGarantia && perfil.puede_avalar === false) {
    banderas.push({ severidad: 'bloqueante', motivo: 'El pliego exige garantía (aval) y la empresa no puede constituirla' })
  }

  // 5) Avisos de la propia extracción (ambigüedades del pliego).
  for (const a of ficha.avisos ?? []) banderas.push({ severidad: 'aviso', motivo: `Revisar: ${a}` })

  const semaforo = calcularSemaforo(banderas)
  return { semaforo, banderas, recomendacion: recomendacion(semaforo, banderas) }
}

function calcularSemaforo(banderas: BanderaRoja[]): Semaforo {
  if (banderas.some(b => b.severidad === 'bloqueante')) return 'rojo'
  if (banderas.some(b => b.severidad === 'aviso')) return 'ambar'
  return 'verde'
}

function recomendacion(semaforo: Semaforo, banderas: BanderaRoja[]): string {
  if (semaforo === 'rojo') return 'No apto: hay causas que te dejarían fuera. Resuélvelas antes de invertir tiempo.'
  if (semaforo === 'ambar') return `Revisar antes de decidir: ${banderas.length} punto(s) de atención.`
  return 'Adelante: no se detectan causas de exclusión con los datos disponibles.'
}
