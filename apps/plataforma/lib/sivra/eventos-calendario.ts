// lib/sivra/eventos-calendario.ts — el calendario de Sevilla que NO puede caducar.
//
// POR QUÉ (27/08/2026). El motor SÍ conoce la Semana Santa: vive en el mapa `EVENTS` de
// `lib/pricing-calendar.ts`, que `eventFactor()` consulta y que el `apply` combina por MAX con
// `pricing_eventos_auto`. 🚨 Escrito así de claro porque yo mismo me equivoqué al diagnosticar:
// miré la TABLA de eventos, vi Semana Santa 2027 vacía y concluí que el motor no la conocía. Es
// falso. Antes de afirmar que al motor le falta una fecha hay que mirar las DOS fuentes.
//
// El problema real es otro, y el propio código lo anticipa: `EVENTS` es un mapa ESCRITO A MANO que
// hay que extender cada año, y `EVENTS_LAST_DATE` existe justamente «para que el calendario de
// eventos NO caduque en silencio». Medido ese día:
//
//     EVENTS: 118 entradas, de 2026-03-29 a 2027-05-02
//     horizonte de tarificación: 365 días → hoy llega a 2027-08-27
//     → el motor ya tarifica 117 días MÁS ALLÁ del final del calendario
//     eventFactor('2028-04-13')  (Jueves Santo de 2028)  =  1.0
//
// Y lo que cuesta llegar tarde está medido, no supuesto. Las entradas de 2027 se añadieron el
// 17/06/2026 (commit 8a8e007f). Busto Reform vendió:
//
//     25-28 mar a 141€/noche   el 14/06/2026   ← 3 días ANTES de que el calendario llegara a 2027
//     22-24 mar a 155€/noche   el 15/06/2026   ← 2 días antes
//
// En cuanto el calendario cubrió 2027, el motor reaccionó como debía: el 24-mar pasó de 180€ a
// 216€, 210€, 298€ y 503€ entre el 17 y el 29 de junio. No falló el motor — faltaba el dato, y
// faltaba porque alguien tenía que escribirlo a mano.
//
// Este módulo quita esa dependencia para lo que se puede calcular.
//
// ─── LA LÍNEA QUE SEPARA LO CALCULADO DE LO SUPUESTO ────────────────────────────────────────────
//
//   · **DERIVADO** (`derivado: true`) — Semana Santa. La Pascua se calcula con el algoritmo
//     gregoriano anónimo (Meeus/Butcher) y de ahí los ocho días. Es aritmética: vale para cualquier
//     año sin que nadie la escriba. Verificada contra 2026 (5-abr) y 2027 (28-mar).
//
//   · **DE TABLA** (`derivado: false`) — Feria de Abril y demás. NO se derivan. 🚨 Es deliberado: la
//     Feria se movía «dos semanas después de Pascua» con alumbrado en lunes, y ese encaje ha
//     cambiado. El propio `pricing-calendar.ts` guarda la cicatriz — el 31/07/2026 hubo que corregir
//     la Feria 2027, estimada una semana TARDE, que tarificaba de Feria una semana normal Y dejaba
//     los días reales sin suelo de evento. Derivarla con una regla obsoleta repetiría eso. Van año a
//     año, y el año que no está se DECLARA como hueco (`aniosSinDatos`) en vez de inventarse.
//
// ─── LOS FACTORES NO SON MÍOS ───────────────────────────────────────────────────────────────────
// La curva de abajo es EXACTAMENTE la que Alberto ya tiene en `EVENTS` para 2027, día por día. No se
// reinventa: se generaliza a cualquier año. Así, el día que el mapa caduque, el motor sigue viendo
// la misma forma que veía antes y no cambia de criterio a mitad de camino.
//
// Observación que NO se aplica sola: la curva pica en VIERNES Santo (3,20) y la noche que de verdad
// se vende para la Madrugá es la del JUEVES (la madrugada es del viernes). Da casi igual en la
// práctica —`eventFactor` capa a 2,5 y ambos días llegan al tope—, pero si algún día se sube el
// techo, ese medio punto está en el día de después. Queda anotado, no corregido: la curva es de
// Alberto y este módulo no es el sitio para discutirla.
//
// Módulo PURO (sin BD ni `@/`), testeable con `node --test`.

/** Techo duro, el mismo que honra `eventos-impacto.ts`. Nada sale de aquí por encima. */
export const FACTOR_MAX = 2.5

export type NocheCalendario = {
  /** YYYY-MM-DD */
  fecha: string
  /** Nombre ESTABLE: es parte de la clave del upsert `(fuente, nombre, rate_date)`. */
  nombre: string
  factor: number
  tipo: 'festival' | 'congreso' | 'deporte' | 'otro'
  /** true = calculado desde la Pascua · false = fecha tomada de la tabla anual. */
  derivado: boolean
}

// ─── Pascua ─────────────────────────────────────────────────────────────────────────────────────

/**
 * Domingo de Resurrección del año dado, en el calendario gregoriano (algoritmo anónimo, Meeus).
 * Devuelve `YYYY-MM-DD`. Aritmética pura: ni zonas horarias ni `Date`.
 */
export function domingoDePascua(anio: number): string {
  const a = anio % 19
  const b = Math.floor(anio / 100)
  const c = anio % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const mes = Math.floor((h + l - 7 * m + 114) / 31)
  const dia = ((h + l - 7 * m + 114) % 31) + 1
  return `${anio}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`
}

/** Suma días a una fecha `YYYY-MM-DD` sin tocar husos: se opera en UTC puro. */
function sumarDias(iso: string, dias: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const t = Date.UTC(y, m - 1, d) + dias * 86400000
  const f = new Date(t)
  return `${f.getUTCFullYear()}-${String(f.getUTCMonth() + 1).padStart(2, '0')}-${String(f.getUTCDate()).padStart(2, '0')}`
}

// ─── Semana Santa ───────────────────────────────────────────────────────────────────────────────
//
// Los ocho días, con los factores TAL CUAL están en `EVENTS` para 2027 (Ramos 2,20 → Viernes Santo
// 3,20). El offset es respecto al Domingo de Resurrección. `EVENTS` no incluye el Viernes de
// Dolores y aquí tampoco: sumar un día por mi cuenta sería cambiar la curva de Alberto, no
// generalizarla.
//
// Los valores >2,5 se guardan crudos y se capan al emitir, igual que hace `eventFactor()`: si algún
// día sube el techo, la forma de la curva ya está aquí y no hay que volver a escribirla.
const SEMANA_SANTA: { offset: number; dia: string; factor: number }[] = [
  { offset: -7, dia: 'Domingo de Ramos', factor: 2.20 },
  { offset: -6, dia: 'Lunes Santo', factor: 2.30 },
  { offset: -5, dia: 'Martes Santo', factor: 2.40 },
  { offset: -4, dia: 'Miércoles Santo', factor: 2.50 },
  { offset: -3, dia: 'Jueves Santo (Madrugá)', factor: 3.00 },
  { offset: -2, dia: 'Viernes Santo', factor: 3.20 },
  { offset: -1, dia: 'Sábado Santo', factor: 2.80 },
  { offset: 0, dia: 'Domingo de Resurrección', factor: 2.50 },
]

/** Las noches de Semana Santa del año dado. 100% derivadas de la Pascua. */
export function semanaSanta(anio: number): NocheCalendario[] {
  const pascua = domingoDePascua(anio)
  // Con una Pascua muy temprana (25 de marzo es el mínimo posible) el Domingo de Ramos cae en la
  // segunda quincena de marzo, siempre dentro del mismo año. Aun así el consumidor filtra por
  // VENTANA y no por año, así que un desbordamiento futuro no perdería noches.
  return SEMANA_SANTA.map((n) => ({
    fecha: sumarDias(pascua, n.offset),
    nombre: `Semana Santa ${anio} — ${n.dia}`,
    factor: Math.min(n.factor, FACTOR_MAX),
    tipo: 'festival' as const,
    derivado: true,
  }))
}

// ─── Fechas de tabla ────────────────────────────────────────────────────────────────────────────
//
// 🚨 Aquí NO se deriva nada. Cada entrada es una fecha CONFIRMADA para ese año concreto, día a día.
// Al añadir un año se comprueban las fechas en la fuente oficial y se anotan; lo que no esté, se
// declara como hueco.
type Fijo = {
  anio: number
  nombre: string
  /** fecha `YYYY-MM-DD` → factor. Día a día: una Feria no pesa lo mismo el lunes que el sábado. */
  dias: Record<string, number>
  /**
   * Etiqueta legible por día. Opcional, pero piénsatelo antes de omitirla: el nombre completo es la
   * CLAVE del upsert (`ON CONFLICT (fuente, nombre, rate_date)`), así que cambiarlo DESPUÉS de la
   * primera siembra no renombra nada — crea filas nuevas y deja las viejas empujando el precio para
   * siempre. Sin etiqueta se cae a «12 de abril», que es correcto y estable.
   */
  etiquetas?: Record<string, string>
  tipo: NocheCalendario['tipo']
}

const FIJOS: Fijo[] = [
  // Feria de Abril 2027: fechas OFICIALES 13-18 abr, alumbrado la noche del lunes 12. Factores
  // copiados uno a uno de `EVENTS` (no promediados: el sábado y el domingo de Feria pesan 3,20 y el
  // último día baja a 2,60). Sembrarla NO cambia nada en 2027 —`EVENTS` ya la tiene y el motor toma
  // el MAX—; está aquí para el día que el mapa caduque.
  { anio: 2027, nombre: 'Feria de Abril 2027', dias: {
    '2027-04-12': 2.50, '2027-04-13': 2.60, '2027-04-14': 2.80,
    '2027-04-15': 3.00, '2027-04-16': 3.20, '2027-04-17': 3.20, '2027-04-18': 2.60,
  }, etiquetas: {
    // Días de la semana COMPROBADOS, no supuestos: el 12 de abril de 2027 es lunes, así que el
    // alumbrado cae esa noche y la feria corre de martes a domingo.
    '2027-04-12': 'noche del alumbrado', '2027-04-13': 'martes de feria',
    '2027-04-14': 'miércoles de feria', '2027-04-15': 'jueves de feria',
    '2027-04-16': 'viernes de feria', '2027-04-17': 'sábado de feria',
    '2027-04-18': 'domingo de feria',
  }, tipo: 'festival' },
]

/** Años del rango para los que la tabla NO tiene ninguna entrada. Un hueco declarado, no un cero. */
function aniosSinTabla(anios: number[]): number[] {
  return anios.filter((a) => !FIJOS.some((f) => f.anio === a))
}

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

/** «2027-04-12» → «12 de abril». Respaldo del nombre cuando el fijo no trae etiqueta. */
function diaLegible(fecha: string): string {
  const [, m, d] = fecha.split('-')
  const mes = MESES[Number(m) - 1]
  return mes ? `${Number(d)} de ${mes}` : fecha
}

function expandir(f: Fijo): NocheCalendario[] {
  return Object.entries(f.dias)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([fecha, factor]) => ({
      fecha,
      nombre: `${f.nombre} — ${f.etiquetas?.[fecha] ?? diaLegible(fecha)}`,
      factor: Math.min(factor, FACTOR_MAX),
      tipo: f.tipo,
      derivado: false,
    }))
}

// ─── Salida ─────────────────────────────────────────────────────────────────────────────────────

export type Calendario = {
  noches: NocheCalendario[]
  /** Años tocados por la ventana sin ninguna fecha de tabla. El cron lo canta; no se rellena a ojo. */
  aniosSinDatos: number[]
}

/**
 * Todas las noches de calendario entre dos fechas (ambas inclusive), ordenadas.
 * `desde`/`hasta` en `YYYY-MM-DD`.
 */
export function calendarioEntre(desde: string, hasta: string): Calendario {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(desde) || !/^\d{4}-\d{2}-\d{2}$/.test(hasta) || hasta < desde) {
    return { noches: [], aniosSinDatos: [] }
  }
  const y0 = Number(desde.slice(0, 4))
  const y1 = Number(hasta.slice(0, 4))
  const anios: number[] = []
  for (let y = y0; y <= y1; y++) anios.push(y)

  const noches: NocheCalendario[] = []
  for (const y of anios) {
    noches.push(...semanaSanta(y))
    for (const f of FIJOS.filter((x) => x.anio === y)) noches.push(...expandir(f))
  }
  return {
    noches: noches.filter((n) => n.fecha >= desde && n.fecha <= hasta).sort((a, b) => a.fecha.localeCompare(b.fecha)),
    aniosSinDatos: aniosSinTabla(anios),
  }
}

/** Parte legible para la respuesta y el latido. Una siembra muda no se distingue de un cron caído. */
export function detalleCalendario(c: Calendario): string {
  if (c.noches.length === 0) return '0 noches de calendario en la ventana'
  const der = c.noches.filter((n) => n.derivado).length
  const tab = c.noches.length - der
  const hueco = c.aniosSinDatos.length
    ? ` · ⚠️ sin fechas de tabla para ${c.aniosSinDatos.join(', ')} (Feria/Bienal/SICAB de esos años NO sembradas)`
    : ''
  return `📅 ${c.noches.length} noche(s): ${der} derivadas de la Pascua · ${tab} de tabla${hueco}`
}
