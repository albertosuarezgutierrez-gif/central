// lib/sivra/eventos-calendario.ts — las fechas de Sevilla que NO hay que salir a buscar.
//
// POR QUÉ (27/08/2026). Las cuatro fuentes de `pricing_eventos_auto` —websearch, agente, prensa,
// ticketmaster— comparten un defecto: descubren un evento cuando ALGUIEN LO PUBLICA. Y lo que más
// dinero mueve en Sevilla no se publica: se sabe desde siempre.
//
// Medido ese día contra producción, Semana Santa 2027 (21→28 de marzo) NO TENÍA NI UNA FILA en la
// tabla de eventos. Lo único que había en esa semana era un Sevilla-Elche. Consecuencia, con las
// reservas reales delante:
//
//     Busto Reform   20-22 mar   139€/noche   reservado el 21/06/2026
//     Busto Reform   22-24 mar   155€/noche   reservado el 15/06/2026
//     Busto Reform   25-28 mar   141€/noche   reservado el 14/06/2026   ← la MADRUGÁ
//     Luxury Busto   20-27 mar   330€/noche   reservado el 23/06/2026
//
// Busto Reform vendió la noche de la Madrugá a 141€, que es 0,97× su precio de un marzo corriente:
// el motor no sabía que esa semana era Semana Santa, así que la tarificó como marzo. Los cuatro
// contratos se cerraron en junio de 2026, NUEVE MESES antes. Ninguna mejora de cadencia del cron
// habría llegado a tiempo — cuando el evento se «descubre» ya se vendió.
//
// Lo que sí llega a tiempo es un calendario que no dependa de que nadie publique nada.
//
// ─── LA LÍNEA QUE SEPARA LO CALCULADO DE LO SUPUESTO ────────────────────────────────────────────
// Este módulo hace DOS cosas distintas y no las mezcla, porque la confianza que merecen es distinta:
//
//   · **DERIVADO** (`derivado: true`) — Semana Santa. La Pascua se calcula con el algoritmo
//     gregoriano anónimo (Meeus/Butcher) y de ahí salen los ocho días. Es aritmética: vale para
//     cualquier año, sin mirar nada. Verificado contra 2026 (5-abr) y 2027 (28-mar).
//
//   · **DE TABLA** (`derivado: false`) — Feria de Abril, Bienal de Flamenco, SICAB, Maratón. Estas
//     NO se derivan. 🚨 Es deliberado: la Feria se movía «dos semanas después de Pascua» con
//     alumbrado en lunes, y el Ayuntamiento ha cambiado ese encaje varias veces en los últimos años
//     (alumbrado en sábado, feria de domingo a sábado…). Derivarla con una regla que ya no se cumple
//     pondría un ×2,5 en la semana equivocada, que es peor que no ponerlo: mueve el precio de siete
//     noches buenas y deja las de verdad a precio de abril normal. Van por tabla, año a año, y el
//     año que no esté en la tabla se DECLARA como hueco (`aniosSinDatos`) en vez de inventarse.
//
// Regla del repo aplicada a un calendario: un año sin datos es «no lo sé», no «no hay Feria».
//
// ─── LOS FACTORES SON UNA PROPUESTA, NO UN HECHO ────────────────────────────────────────────────
// Los multiplicadores de abajo son el reparto que propongo, no una medición. Aguas abajo pasan por
// el mercado real de la fecha (si hay comparables, mandan ellos), por el techo de mercado y por el
// raíl de ±%/día — igual que los de `eventos-impacto.ts`. Cambiarlos es editar esta tabla.
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
// El día que se tarifica es la NOCHE DE ENTRADA. La Madrugá es la madrugada del Viernes Santo, así
// que la noche que se vende es la del JUEVES SANTO: por eso el pico está en `-4` (Pascua menos
// cuatro días) y no en el Viernes.
//
// El Viernes de Dolores (`-8`) entra a propósito con un factor bajo: la ciudad empieza a llenarse
// el viernes anterior a Ramos, y esa noche se vende como si fuera un viernes de marzo cualquiera.
const SEMANA_SANTA: { offset: number; dia: string; factor: number }[] = [
  { offset: -8, dia: 'Viernes de Dolores', factor: 1.35 },
  { offset: -7, dia: 'Domingo de Ramos', factor: 1.80 },
  { offset: -6, dia: 'Lunes Santo', factor: 1.70 },
  { offset: -5, dia: 'Martes Santo', factor: 1.80 },
  { offset: -4, dia: 'Miércoles Santo', factor: 2.00 },
  { offset: -3, dia: 'Jueves Santo (Madrugá)', factor: 2.50 },
  { offset: -2, dia: 'Viernes Santo', factor: 2.00 },
  { offset: -1, dia: 'Sábado Santo', factor: 1.60 },
  { offset: 0, dia: 'Domingo de Resurrección', factor: 1.30 },
]

/** Las noches de Semana Santa del año dado. 100% derivadas de la Pascua. */
export function semanaSanta(anio: number): NocheCalendario[] {
  const pascua = domingoDePascua(anio)
  // El Sábado de Pasión cae ocho días antes de Pascua, así que un año con Pascua muy temprana puede
  // meter noches en el año anterior. Se emiten igual: el consumidor filtra por ventana, no por año.
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
// 🚨 Aquí NO se deriva nada. Cada entrada es una fecha CONFIRMADA para ese año concreto. Al añadir
// un año, se comprueban las fechas en la fuente oficial y se anotan; lo que no esté, se declara.
//
// `hasta` es INCLUSIVO y es la última noche de entrada que se tarifica.
type Fijo = {
  anio: number
  nombre: string
  desde: string
  hasta: string
  factor: number
  tipo: NocheCalendario['tipo']
}

const FIJOS: Fijo[] = [
  // Feria de Abril 2027: fechas oficiales 13-18 abr, alumbrado la noche del 12. Coinciden con la
  // fila que ya metió el agente a mano en `pricing_eventos_auto` (factor 2,50), así que sembrar
  // esta NO cambia nada en 2027 — el motor combina por MAX(factor). Está aquí para que 2028 y
  // siguientes no dependan de que alguien se acuerde.
  { anio: 2027, nombre: 'Feria de Abril 2027', desde: '2027-04-12', hasta: '2027-04-18', factor: 2.50, tipo: 'festival' },
]

/** Años del rango para los que la tabla NO tiene ninguna entrada. Un hueco declarado, no un cero. */
function aniosSinTabla(anios: number[]): number[] {
  return anios.filter((a) => !FIJOS.some((f) => f.anio === a))
}

function expandir(f: Fijo): NocheCalendario[] {
  const out: NocheCalendario[] = []
  let cur = f.desde
  // Tope de seguridad: una entrada mal escrita (`hasta` anterior a `desde`, o un rango absurdo) no
  // puede colgar el cron ni sembrar mil noches.
  for (let i = 0; i < 31 && cur <= f.hasta; i++) {
    out.push({
      fecha: cur,
      nombre: `${f.nombre} — ${cur}`,
      factor: Math.min(f.factor, FACTOR_MAX),
      tipo: f.tipo,
      derivado: false,
    })
    cur = sumarDias(cur, 1)
  }
  return out
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
