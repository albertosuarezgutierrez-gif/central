// El muro de actividad de la cartera: qué se considera un evento, cómo se
// rotula y cuál de ellos exige mirar una póliza.
//
// Vive en el módulo compartido porque lo necesitan las DOS apps: `apps/asegura`
// para construir la consulta y `apps/plataforma` para pintar los filtros y los
// rótulos. Es la misma razón que `filtro-cartera.ts`: con una lista por app, la
// pantalla acaba ofreciendo un filtro que el puerto no entiende y eso devuelve
// cero resultados sin un solo error.
//
// ─── La regla que gobierna este fichero ─────────────────────────────────────
// 🚨 **De un evento solo se afirma lo que su FUENTE demuestra.** Las tablas
// `portal_*` las escribe el cliente al usar la intranet, así que de ellas sí se
// puede decir «lo hizo él». `historial_interno` NO tiene autor estructurado —la
// columna `actor_user_id` existe y nadie la escribe, el autor viaja dentro del
// texto—, así que sus filas se muestran como lo que son: una anotación de la
// ficha, con su texto entero, que ya nombra a quien la hizo. Inventar un autor
// para que todas las filas tengan uno sería el «no lo sé disfrazado de valor»
// que prohíbe `CLAUDE.md`, y encima sobre la pregunta más delicada de esta
// pantalla: quién tocó qué.

/**
 * De dónde sale la certeza sobre el autor del evento.
 *
 *  · `cliente` — lo escribió él entrando en el portal. Fuente: una tabla
 *    `portal_*`, o una anotación cuyo texto lo compuso el propio portal (los
 *    prefijos de `@central/module-seguros-portal`, que son constantes
 *    compartidas y no una heurística sobre el texto).
 *  · `ficha` — una anotación de `historial_interno` cuyo autor no consta como
 *    dato. NO significa «lo hizo la correduría»: significa que aquí no se sabe
 *    y que la respuesta está en el texto de la propia anotación.
 */
export type OrigenActividad = 'cliente' | 'ficha'

/** Los eventos que el muro sabe pintar. */
export type TipoActividad =
  | 'acceso'
  | 'acceso_fallido'
  | 'direccion'
  | 'sugerencia'
  | 'parte'
  | 'poliza_declarada'
  | 'supresion'
  | 'invitacion'
  | 'ficha'

type Definicion = {
  v: TipoActividad
  label: string
  origen: OrigenActividad
  /**
   * Por qué esto no es una notificación sino trabajo. `null` = es información.
   * Se pinta junto al evento; que lo diga la fila y no un manual es la
   * diferencia entre un muro que se lee y uno que se usa.
   */
  riesgo: string | null
}

/**
 * Los tipos, con su rótulo y su consecuencia. El orden es el de importancia
 * para el corredor, no el cronológico: se usa para los desplegables.
 *
 * 🚨 `direccion` lleva aviso porque **el domicilio es factor de tarifa en hogar
 * y en auto**. Un cliente que se muda y cuya compañía no se entera tiene un
 * problema el día del siniestro, y el rastro de que lo avisó está justo aquí.
 * Pintarlo como una notificación más —al lado de una sugerencia— es perder la
 * única señal que hay.
 */
export const ACTIVIDADES: readonly Definicion[] = [
  {
    v: 'supresion',
    label: 'Pidió que se borren sus datos',
    origen: 'cliente',
    riesgo: 'Corre un plazo legal de un mes (art. 17 RGPD).',
  },
  {
    v: 'direccion',
    label: 'Cambió su dirección de contacto',
    origen: 'cliente',
    riesgo: 'El domicilio tarifica en hogar y auto: revisa si afecta a alguna de sus pólizas.',
  },
  { v: 'parte', label: 'Abrió un parte de siniestro', origen: 'cliente', riesgo: 'Hay alguien esperando respuesta.' },
  {
    v: 'acceso_fallido',
    label: 'Pidió el código y no llegó a entrar',
    origen: 'cliente',
    riesgo: 'O no le llegó el correo, o caducó: comprueba antes de que lo deje.',
  },
  { v: 'poliza_declarada', label: 'Subió una póliza de otra compañía', origen: 'cliente', riesgo: null },
  { v: 'sugerencia', label: 'Escribió una sugerencia', origen: 'cliente', riesgo: null },
  { v: 'acceso', label: 'Entró en la intranet', origen: 'cliente', riesgo: null },
  { v: 'invitacion', label: 'Se le invitó a la intranet', origen: 'ficha', riesgo: null },
  { v: 'ficha', label: 'Anotación en la ficha', origen: 'ficha', riesgo: null },
]

const POR_TIPO = new Map<string, Definicion>(ACTIVIDADES.map((a) => [a.v, a]))

/** `null` si el tipo no se reconoce — que es distinto de «no tiene rótulo». */
export function definicionActividad(tipo: string): Definicion | null {
  return POR_TIPO.get(tipo) ?? null
}

/** El rótulo, cayendo al propio valor para que un tipo nuevo se VEA en vez de desaparecer. */
export function etiquetaActividad(tipo: string): string {
  return POR_TIPO.get(tipo)?.label ?? tipo
}

/**
 * Lo que hay que hacer con este evento, o `null` si solo hay que saberlo.
 *
 * Un tipo desconocido devuelve `null` a propósito: no se inventa una alarma
 * sobre algo que esta versión del código no sabe leer.
 */
export function riesgoActividad(tipo: string): string | null {
  return POR_TIPO.get(tipo)?.riesgo ?? null
}

/** Un evento del muro. `clienteId` es `null` cuando la identidad no está casada con ninguna ficha. */
export type EventoActividad = {
  id: string
  tipo: TipoActividad | string
  /** ISO 8601 en UTC. */
  fecha: string
  clienteId: string | null
  /** Cómo se llama esa ficha, o `null` si el evento no tiene ficha detrás (un lead del portal). */
  cliente: string | null
  /** El texto tal cual se guardó. En las anotaciones de ficha es donde consta el autor. */
  texto: string | null
}

// ─── El filtro ───────────────────────────────────────────────────────────────

/** Qué se está mirando. `todo` incluye las anotaciones de ficha; `cliente`, solo lo del portal. */
export type QuienActividad = 'todo' | 'cliente'

export const VENTANAS_ACTIVIDAD: readonly { v: number; label: string }[] = [
  { v: 1, label: 'Hoy' },
  { v: 7, label: '7 días' },
  { v: 30, label: '30 días' },
  { v: 90, label: '90 días' },
]

export const DIAS_ACTIVIDAD_DEFECTO = 30
export const POR_PAGINA_ACTIVIDAD = 50
export const POR_PAGINA_ACTIVIDAD_MAX = 200

export type FiltroActividad = { quien: QuienActividad; dias: number; pagina: number }

/**
 * Lee el filtro de unos parámetros de URL y **declara lo que ha descartado**.
 *
 * Misma regla que `parseFiltroCartera`: un valor que no se reconoce no se
 * ignora. Ignorar `?dias=abc` convierte «lo de hoy» en «los últimos 30 días»
 * sin que nada lo diga, y esa es justo la respuesta que más se parece a haber
 * funcionado.
 */
export function parseFiltroActividad(p: URLSearchParams): { filtro: FiltroActividad; descartados: string[] } {
  const descartados: string[] = []

  const quienCrudo = p.get('quien')
  let quien: QuienActividad = 'todo'
  if (quienCrudo != null && quienCrudo !== '') {
    if (quienCrudo === 'todo' || quienCrudo === 'cliente') quien = quienCrudo
    else descartados.push(`quien=${quienCrudo}`)
  }

  const diasCrudo = p.get('dias')
  let dias = DIAS_ACTIVIDAD_DEFECTO
  if (diasCrudo != null && diasCrudo !== '') {
    const n = Number(diasCrudo)
    if (Number.isInteger(n) && VENTANAS_ACTIVIDAD.some((v) => v.v === n)) dias = n
    else descartados.push(`dias=${diasCrudo}`)
  }

  const pagCrudo = p.get('pagina')
  let pagina = 1
  if (pagCrudo != null && pagCrudo !== '') {
    const n = Number(pagCrudo)
    if (Number.isInteger(n) && n >= 1) pagina = n
    else descartados.push(`pagina=${pagCrudo}`)
  }

  return { filtro: { quien, dias, pagina }, descartados }
}

// ─── El embudo ───────────────────────────────────────────────────────────────

/**
 * Cuántos de los clientes de la casa han llegado a cada escalón de la intranet.
 *
 * 🚨 **Cada campo es `number | null`, y `null` NO es 0.** `0 invitados` es «lo
 * he contado y no hay ninguno»; `null` es «esa cuenta no se pudo hacer». Se
 * deciden cosas distintas con cada uno —invitar gente, o arreglar la consulta—
 * y colapsarlos pintaría un embudo perfectamente creíble sobre nada.
 */
export type EmbudoPortal = {
  /** Clientes de cartera viva (`esCarteraViva`), que es la única definición de «cliente» de la casa. */
  clientes: number | null
  /** De esos, a cuántos se les puede escribir. Sin correo no hay intranet: se entra por código al email. */
  conEmail: number | null
  /** Cuántos tienen ya una identidad del portal casada con su ficha. */
  invitados: number | null
  /** Cuántos han entrado alguna vez. */
  hanEntrado: number | null
  /** Cuántos han entrado en los últimos 30 días. */
  activos30: number | null
}

export type PasoEmbudo = {
  clave: keyof EmbudoPortal
  label: string
  /** Qué significa que este número sea bajo. */
  ayuda: string
}

export const PASOS_EMBUDO: readonly PasoEmbudo[] = [
  { clave: 'clientes', label: 'Clientes', ayuda: 'Pólizas vivas de CIMA. Los leads del volcado no cuentan.' },
  { clave: 'conEmail', label: 'Con correo', ayuda: 'A los demás no se les puede invitar: se entra por código al correo.' },
  { clave: 'invitados', label: 'Con acceso', ayuda: 'Tienen una identidad del portal casada con su ficha.' },
  { clave: 'hanEntrado', label: 'Han entrado', ayuda: 'Alguna vez, desde que existe el registro de accesos.' },
  { clave: 'activos30', label: 'Activos 30d', ayuda: 'Han entrado en los últimos 30 días.' },
]

/**
 * El escalón donde más gente se queda por el camino, que es donde vale la pena
 * trabajar. `null` cuando faltan cuentas: sin los dos extremos de un salto no se
 * puede decir cuál es el peor, y decir uno cualquiera sería mandar a trabajar al
 * sitio equivocado.
 */
export function mayorCaidaEmbudo(e: EmbudoPortal): { desde: PasoEmbudo; hasta: PasoEmbudo; pierde: number } | null {
  let peor: { desde: PasoEmbudo; hasta: PasoEmbudo; pierde: number } | null = null
  for (let i = 0; i < PASOS_EMBUDO.length - 1; i++) {
    const a = e[PASOS_EMBUDO[i].clave]
    const b = e[PASOS_EMBUDO[i + 1].clave]
    if (a == null || b == null) continue
    const pierde = a - b
    if (pierde <= 0) continue
    if (peor === null || pierde > peor.pierde) peor = { desde: PASOS_EMBUDO[i], hasta: PASOS_EMBUDO[i + 1], pierde }
  }
  return peor
}

/**
 * Cuántos de estos eventos son posteriores a la última vez que se miró.
 *
 * `desde` nulo (nunca se ha mirado, o el navegador no lo guardó) devuelve
 * `null`, no `eventos.length`: «no sé cuándo miraste» y «todo esto es nuevo»
 * son cosas distintas, y la segunda pintaría un aviso de novedades cada vez que
 * alguien abre la pantalla en un navegador limpio.
 */
export function nuevosDesde(eventos: readonly { fecha: string }[], desde: string | null): number | null {
  if (desde == null || desde === '') return null
  const t = Date.parse(desde)
  if (Number.isNaN(t)) return null
  return eventos.filter((e) => {
    const f = Date.parse(e.fecha)
    return !Number.isNaN(f) && f > t
  }).length
}
