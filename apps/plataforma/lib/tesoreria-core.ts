// Lógica PURA de tesorería (Fase 5): detecta movimientos recurrentes y proyecta el
// saldo a futuro. Sin red ni BD → testeable con `node --test`. La E/S (Prisma) vive
// en lib/tesoreria.ts.

export type MovTes = { fecha: string; importe: number; concepto: string }

export type Recurrente = {
  clave: string
  concepto: string
  importeMedio: number     // con signo (negativo = gasto)
  intervaloDias: number
  ultimaFecha: string      // 'YYYY-MM-DD'
  ocurrencias: number
  signo: 1 | -1
}

export type Proyeccion = { dias: number; entradas: number; salidas: number; proyectado: number }

const DIA = 86_400_000
const dias = (a: string, b: string) => Math.round((Date.parse(a) - Date.parse(b)) / DIA)

function mediana(xs: number[]): number {
  if (xs.length === 0) return 0
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

// Clave normalizada de un concepto: minúsculas, sin dígitos ni tokens largos (refs),
// para agrupar "RECIBO ESCUELA INFANTIL 0123" con "RECIBO ESCUELA INFANTIL 0456".
export function normalizarConcepto(c: string): string {
  return c.toLowerCase()
    .replace(/[0-9]+/g, ' ')
    .replace(/[^a-záéíóúñ ]+/gi, ' ')
    .split(/\s+/).filter(w => w.length >= 3).slice(0, 4).join(' ')
    .trim()
}

// Detecta movimientos que se repiten con periodicidad estable (≥3 veces, intervalo
// mediano ≤ ~95 días). Devuelve uno por patrón (gasto o ingreso recurrente).
export function detectarRecurrentes(movs: MovTes[]): Recurrente[] {
  const grupos = new Map<string, MovTes[]>()
  for (const m of movs) {
    const clave = normalizarConcepto(m.concepto)
    if (!clave || m.importe === 0) continue
    const k = `${m.importe >= 0 ? '+' : '-'}${clave}`
    ;(grupos.get(k) ?? grupos.set(k, []).get(k)!).push(m)
  }

  const out: Recurrente[] = []
  for (const [k, items] of grupos) {
    if (items.length < 3) continue
    const orden = [...items].sort((a, b) => Date.parse(a.fecha) - Date.parse(b.fecha))
    const intervalos: number[] = []
    for (let i = 1; i < orden.length; i++) intervalos.push(dias(orden[i].fecha, orden[i - 1].fecha))
    const intervalo = mediana(intervalos)
    if (intervalo < 20 || intervalo > 95) continue   // ni diario ni esporádico

    const signo: 1 | -1 = k[0] === '+' ? 1 : -1
    out.push({
      clave: k.slice(1),
      concepto: orden[orden.length - 1].concepto.trim(),
      importeMedio: mediana(orden.map(m => m.importe)),
      intervaloDias: Math.round(intervalo),
      ultimaFecha: orden[orden.length - 1].fecha,
      ocurrencias: orden.length,
      signo,
    })
  }
  return out.sort((a, b) => Math.abs(b.importeMedio) - Math.abs(a.importeMedio))
}

// Proyecta el saldo a `dias` vista sumando las próximas ocurrencias de cada recurrente.
export function proyectar(saldoActual: number, recurrentes: Recurrente[], diasVista: number, hoy: string): Proyeccion {
  let entradas = 0, salidas = 0
  const limite = Date.parse(hoy) + diasVista * DIA
  for (const r of recurrentes) {
    let t = Date.parse(r.ultimaFecha) + r.intervaloDias * DIA
    while (t <= limite) {
      if (t > Date.parse(hoy)) {
        if (r.importeMedio >= 0) entradas += r.importeMedio
        else salidas += -r.importeMedio
      }
      t += r.intervaloDias * DIA
    }
  }
  return { dias: diasVista, entradas, salidas, proyectado: saldoActual + entradas - salidas }
}
