import type {
  TurnoFichaje, LimitesJornada, ResumenJornadaEmpleado, ExcesoJornada,
  AvisoDescanso, ResumenHorasExtra, PuntoSerieJornada,
} from './types'

export const LIMITES_DEFECTO: LimitesJornada = {
  jornada_max_diaria: 9,
  jornada_max_semanal: 40,
  descanso_min_entre_jornadas: 12,
  descanso_semanal_horas: 35,
  tope_extra_anual: 80,
}

const round2 = (n: number) => Math.round(n * 100) / 100

// Horas de un turno: usa horas_totales si está; si no, calcula salida-entrada.
function horasTurno(t: TurnoFichaje): number {
  if (t.horas_totales != null) return Number(t.horas_totales)
  if (!t.salida_at) return 0
  return (new Date(t.salida_at).getTime() - new Date(t.entrada_at).getTime()) / 3_600_000
}

// Clave ISO-8601 de semana 'YYYY-Www' (semana empieza en lunes; jueves manda).
export function isoWeek(fecha: string): string {
  const d = new Date(fecha + 'T00:00:00Z')
  const day = (d.getUTCDay() + 6) % 7 // lunes = 0
  d.setUTCDate(d.getUTCDate() - day + 3) // jueves de esa semana ISO
  const firstThu = new Date(Date.UTC(d.getUTCFullYear(), 0, 4))
  const firstThuDay = (firstThu.getUTCDay() + 6) % 7
  const week = 1 + Math.round((d.getTime() - firstThu.getTime()) / 86_400_000 / 7 + (3 - firstThuDay) / 7)
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
}

const key = (t: TurnoFichaje) => t.camarero_id ?? '__sin__'

// Solo turnos cerrados (con salida) entran en el cómputo legal.
function cerrados(turnos: TurnoFichaje[]): TurnoFichaje[] {
  return turnos.filter(t => !!t.salida_at)
}

function agrupar(turnos: TurnoFichaje[]): Map<string, TurnoFichaje[]> {
  const m = new Map<string, TurnoFichaje[]>()
  for (const t of cerrados(turnos)) {
    const k = key(t)
    const arr = m.get(k) ?? []
    arr.push(t)
    m.set(k, arr)
  }
  return m
}

// Registro de jornada por empleado: días, horas, media, horas/semana y excesos legales.
export function resumenJornada(
  turnos: TurnoFichaje[],
  limites: LimitesJornada = LIMITES_DEFECTO,
): ResumenJornadaEmpleado[] {
  const out: ResumenJornadaEmpleado[] = []
  for (const [, arr] of agrupar(turnos)) {
    const horasPorDia = new Map<string, number>()
    const horasPorSemana: Record<string, number> = {}
    let total = 0
    for (const t of arr) {
      const h = horasTurno(t)
      total += h
      horasPorDia.set(t.fecha, (horasPorDia.get(t.fecha) ?? 0) + h)
      const w = isoWeek(t.fecha)
      horasPorSemana[w] = (horasPorSemana[w] ?? 0) + h
    }
    const excesos: ExcesoJornada[] = []
    for (const [dia, h] of horasPorDia) {
      if (h > limites.jornada_max_diaria) {
        excesos.push({ tipo: 'dia', clave: dia, horas: round2(h), limite: limites.jornada_max_diaria })
      }
    }
    for (const w of Object.keys(horasPorSemana)) {
      if (horasPorSemana[w] > limites.jornada_max_semanal) {
        excesos.push({ tipo: 'semana', clave: w, horas: round2(horasPorSemana[w]), limite: limites.jornada_max_semanal })
      }
    }
    const dias = horasPorDia.size
    out.push({
      camarero_id: arr[0].camarero_id,
      camarero_nombre: arr[0].camarero_nombre,
      dias_trabajados: dias,
      horas_totales: round2(total),
      media_diaria: dias ? round2(total / dias) : 0,
      horas_por_semana: Object.fromEntries(
        Object.entries(horasPorSemana).map(([k, v]) => [k, round2(v)]),
      ),
      excesos,
    })
  }
  return out.sort((a, b) => b.horas_totales - a.horas_totales)
}

// Serie de horas por fecha por empleado (para sparkline / detalle / export).
export function detalleJornada(turnos: TurnoFichaje[]): Record<string, PuntoSerieJornada[]> {
  const out: Record<string, PuntoSerieJornada[]> = {}
  for (const [k, arr] of agrupar(turnos)) {
    const porFecha = new Map<string, number>()
    for (const t of arr) porFecha.set(t.fecha, (porFecha.get(t.fecha) ?? 0) + horasTurno(t))
    out[k] = [...porFecha.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([fecha, horas]) => ({ fecha, horas: round2(horas) }))
  }
  return out
}

// Descanso mínimo entre jornadas (12h por defecto). Devuelve los incumplimientos.
export function chequearDescansos(
  turnos: TurnoFichaje[],
  limites: LimitesJornada = LIMITES_DEFECTO,
): AvisoDescanso[] {
  const avisos: AvisoDescanso[] = []
  for (const [, arr] of agrupar(turnos)) {
    const ord = [...arr].sort(
      (a, b) => new Date(a.entrada_at).getTime() - new Date(b.entrada_at).getTime(),
    )
    for (let i = 1; i < ord.length; i++) {
      const prev = ord[i - 1]
      const cur = ord[i]
      if (!prev.salida_at) continue
      const gap = (new Date(cur.entrada_at).getTime() - new Date(prev.salida_at).getTime()) / 3_600_000
      if (gap >= 0 && gap < limites.descanso_min_entre_jornadas) {
        avisos.push({
          camarero_id: cur.camarero_id,
          camarero_nombre: cur.camarero_nombre,
          tipo: 'entre_jornadas',
          fecha: cur.fecha,
          horas: round2(gap),
          minimo: limites.descanso_min_entre_jornadas,
        })
      }
    }
  }
  return avisos
}

// Horas extra (turnos tipo 'extra') por empleado + control del tope anual.
export function horasExtra(
  turnos: TurnoFichaje[],
  limites: LimitesJornada = LIMITES_DEFECTO,
): ResumenHorasExtra[] {
  const out: ResumenHorasExtra[] = []
  for (const [, arr] of agrupar(turnos)) {
    const extra = arr.filter(t => t.tipo === 'extra').reduce((s, t) => s + horasTurno(t), 0)
    if (extra <= 0) continue
    out.push({
      camarero_id: arr[0].camarero_id,
      camarero_nombre: arr[0].camarero_nombre,
      horas_extra: round2(extra),
      tope_anual: limites.tope_extra_anual,
      supera_tope: extra > limites.tope_extra_anual,
    })
  }
  return out
}
