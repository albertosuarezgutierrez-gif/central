// La cuenta del widget «¿Cuándo tienes que decidir?» de `/gestor-de-seguros`.
// Pura, sin fecha implícita, para que se pueda comprobar.
//
// 🚨 Es un GANCHO, no un gestor: no guarda nada, no pide registro, no manda
// nada a ningún servidor. Lo que hace es enseñar la única cuenta que la gente
// no hace —vencimiento − 30 días— sobre lo que la persona teclea, y decirle
// cuántas de sus pólizas tienen esa fecha cerca. El paso siguiente es crear
// su área, y eso lo hace ella.
//
// La aritmética es la MISMA que la del portal (`fechaAccionable()` de
// `@central/module-seguros-portal`: 30 días en UTC, nunca «un mes» con
// `setMonth`), pero esta app NO puede importar ese paquete —no lo declara, y
// traerlo arrastraría `@central/module-seguros` con la cartera entera al
// bundle de una web pública—, así que se repite aquí la constante con su
// test. Si el preaviso cambiara de 30 días, cambian los dos sitios.

export const DIAS_PREAVISO = 30
const MS_DIA = 86_400_000

export type LineaVencimiento = {
  /** Etiqueta libre: «Coche», «Casa», «Salud de los niños»… */
  etiqueta: string
  /** Vencimiento `AAAA-MM-DD`, o `''` si aún no lo ha puesto. */
  vence: string
}

export type ResultadoLinea = {
  etiqueta: string
  vence: Date | null
  /** Último día para comunicar la no renovación (vence − 30 días). */
  limite: Date | null
  /** Días desde `hoy` hasta `limite`. Negativo = ya pasó. */
  dias: number | null
  estado: 'sin_fecha' | 'pasado' | 'urgente' | 'proximo' | 'lejos'
}

function diaUtc(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
}

/** `AAAA-MM-DD` → medianoche UTC, o `null` si no es una fecha real. */
export function parsearFecha(iso: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim())
  if (!m) return null
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
  // «2026-02-31» construye un 3 de marzo sin avisar: se rechaza comparando.
  if (d.getUTCMonth() !== Number(m[2]) - 1 || d.getUTCDate() !== Number(m[3])) return null
  return d
}

export function calcularLinea(linea: LineaVencimiento, hoy: Date): ResultadoLinea {
  const vence = parsearFecha(linea.vence)
  if (!vence) return { etiqueta: linea.etiqueta, vence: null, limite: null, dias: null, estado: 'sin_fecha' }
  const limite = new Date(vence.getTime() - DIAS_PREAVISO * MS_DIA)
  const dias = Math.round((limite.getTime() - diaUtc(hoy).getTime()) / MS_DIA)
  const estado: ResultadoLinea['estado'] = dias < 0 ? 'pasado' : dias <= 30 ? 'urgente' : dias <= 90 ? 'proximo' : 'lejos'
  return { etiqueta: linea.etiqueta, vence, limite, dias, estado }
}

export function resumirLineas(lineas: readonly LineaVencimiento[], hoy: Date) {
  const resultados = lineas.map((l) => calcularLinea(l, hoy))
  const conFecha = resultados.filter((r) => r.estado !== 'sin_fecha')
  return {
    resultados,
    conFecha: conFecha.length,
    /** Las que hay que decidir en los próximos 90 días (contando las urgentes). */
    proximas: conFecha.filter((r) => r.estado === 'urgente' || r.estado === 'proximo').length,
    urgentes: conFecha.filter((r) => r.estado === 'urgente').length,
    pasadas: conFecha.filter((r) => r.estado === 'pasado').length,
  }
}

export function fechaCorta(d: Date): string {
  return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
}
