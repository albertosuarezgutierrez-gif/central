// ────────────────────────────────────────────────────────────────────────────
// Siniestros NUEVOS de la cartera: la regla pura del aviso a Alberto.
//
// De dónde sale (dictado de Alberto, 05/09/2026):
//
//   «Los siniestros, mejor intentar que llamen a la compañía. Nosotros nos
//    enteraremos por CIMA, me avisas y llamo para ver cómo va y hacerle
//    seguimiento.»
//
// O sea, la cadena es: el cliente llama a su aseguradora y abre el parte → la
// compañía nos lo manda por CIMA → entra en `seguros.siniestros` → **y ahí se
// acababa todo**. Nadie avisaba a Alberto, así que el seguimiento —lo único
// que la correduría aporta en un siniestro— dependía de que él abriera la ficha
// del cliente por casualidad.
//
// 🚨 Lo que este aviso NO puede decir, y es la trampa de este dominio: un
// siniestro que llega por CIMA **ya está abierto en la compañía**. Es lo
// CONTRARIO del parte del portal del cliente (`apps/asegura-portal`), donde
// «enviado» NO es «comunicado» y hay que abrirlo a mano. Confundirlos aquí
// mandaría a Alberto a comunicar algo que la entidad ya está tramitando, y
// —peor— sugeriría que el cliente está desprotegido cuando no lo está. Aquí la
// acción es UNA: **llamar al cliente para hacerle seguimiento.**
//
// Y lo que tampoco sale: tramitador y perito. Son gestión interna (regla de
// visibilidad del 03/09/2026) y no hacen falta para coger el teléfono. No están
// ni en el tipo de entrada: la forma más barata de que un dato no se filtre a
// un aviso es que el aviso no lo reciba nunca.
// ────────────────────────────────────────────────────────────────────────────

/**
 * Un siniestro tal y como lo necesita este aviso, y NADA más.
 *
 * 🚨 El eje del «nuevo» es `entradoEn` (cuándo entró en NUESTRA base), no
 * `ocurridoEn` (cuándo pasó). No son lo mismo ni de lejos: medido el 05/09/2026
 * sobre las 67 filas reales, hay siniestros ocurridos en agosto de 2025 que
 * CIMA nos mandó en junio de 2026. Si la marca de agua fuera la fecha del
 * hecho, un siniestro viejo que la compañía nos manda hoy —justo el que Alberto
 * no conoce— quedaría por debajo de la marca y no sonaría jamás.
 */
export interface SiniestroEntrante {
  id: string
  /** ISO. Cuándo entró en nuestra base. Es el eje de la marca de agua. */
  entradoEn: string
  /** `YYYY-MM-DD` de cuándo OCURRIÓ. `null` = la compañía no lo informa. */
  ocurridoEn: string | null
  /** Nombre del cliente. `null` = no consta; NUNCA se rellena con un genérico. */
  cliente: string | null
  /** Para enlazar a su ficha. `null` = no se puede enlazar, y se dice. */
  clienteId: string | null
  compania: string | null
  poliza: string | null
  /** La referencia del siniestro en la compañía, si consta. */
  referencia: string | null
}

/**
 * Hasta dónde se avisó la última vez.
 *
 * `ids` son los siniestros ya avisados que entraron EXACTAMENTE en `instante`.
 * Existe porque la consulta al puerto es INCLUSIVA (`>= instante`): con un `>`
 * estricto, dos filas grabadas en el mismo instante harían que la segunda se
 * perdiera para siempre. Es el desempate de la marca de agua, y por eso la
 * clave de la deduplicación es el **id del siniestro**, no su fecha — que es
 * además lo que hace que una re-emisión de CIMA (misma fila, `updated_at`
 * nuevo) no vuelva a sonar: su `entradoEn` no cambia.
 */
export interface MarcaSiniestros {
  instante: string
  ids: readonly string[]
}

export type DecisionSiniestros =
  /**
   * Primera pasada: no consta marca previa. Se ANCLA y no se avisa de nada
   * anterior — el día del estreno no puede salir un Telegram con los 67
   * siniestros del volcado. `anteriores` es cuántos se dejan atrás, y se dice
   * en el latido: «no había marca» y «no ha entrado ninguno» son cosas
   * distintas y no pueden leerse igual.
   */
  | { avisar: false; motivo: 'primera_vez'; anteriores: number; marca: MarcaSiniestros }
  /** Se ha mirado y no ha entrado ninguno nuevo. La marca NO se toca. */
  | { avisar: false; motivo: 'sin_novedades' }
  /**
   * Hay que avisar. `marca` es la que se guardará **solo si el Telegram sale**
   * (ver `TOPE_AVISO_SINIESTROS` y la regla de abajo): cubre exactamente los
   * `nuevos` de esta tanda, ni uno más.
   */
  | { avisar: true; motivo: 'avisado'; nuevos: SiniestroEntrante[]; restantes: number; marca: MarcaSiniestros }

/**
 * Cuántos siniestros caben en un aviso.
 *
 * Los siniestros llegan a rachas: cuando se desatasca la ingesta de CIMA, un
 * día puede traer los de varias semanas. Un Telegram con cuarenta entradas no
 * se lee, y truncarlo mientras la marca de agua avanza por TODOS convertiría a
 * los no nombrados en clientes que nadie va a llamar. Así que lo que se corta
 * es la TANDA, no el mensaje: la marca avanza solo hasta el último incluido y
 * la pasada siguiente recoge el resto.
 */
export const TOPE_AVISO_SINIESTROS = 20

function fechaMax(lista: readonly SiniestroEntrante[]): string {
  return lista.reduce((max, s) => (s.entradoEn > max ? s.entradoEn : max), lista[0]!.entradoEn)
}

/** Marca que cubre EXACTAMENTE esta lista: su instante mayor + los ids de ese instante. */
function marcaDe(lista: readonly SiniestroEntrante[]): MarcaSiniestros {
  const instante = fechaMax(lista)
  return { instante, ids: lista.filter(s => s.entradoEn === instante).map(s => s.id) }
}

/** ¿Está este siniestro por encima de la marca? El empate lo rompe el id. */
function esNuevo(s: SiniestroEntrante, marca: MarcaSiniestros): boolean {
  if (s.entradoEn > marca.instante) return true
  if (s.entradoEn < marca.instante) return false
  return !marca.ids.includes(s.id)
}

/**
 * ¿Hay que avisar hoy, y de qué?
 *
 * `siniestros` es lo que ha devuelto el puerto para `>= marca.instante` (o la
 * cartera entera en la primera pasada). Esta función NO decide si la marca se
 * guarda: solo dice cuál sería. **Guardarla es cosa de quien mande el Telegram,
 * y solo si el envío ha salido** — una marca que avanza con el aviso fallido es
 * exactamente cómo se pierde un siniestro para siempre sin que nada falle.
 *
 * `hoy` solo se usa cuando la cartera está VACÍA en la primera pasada: hay que
 * anclar en algún sitio, y anclar en «ahora» hace que el primer siniestro que
 * llegue de verdad sí suene. Dejarlo sin marca lo convertiría en «anterior» y
 * lo perdería.
 */
export function decidirSiniestrosNuevos(e: {
  marca: MarcaSiniestros | null
  siniestros: readonly SiniestroEntrante[]
  hoy: Date
  tope?: number
}): DecisionSiniestros {
  const orden = [...e.siniestros].sort((a, b) =>
    a.entradoEn === b.entradoEn ? a.id.localeCompare(b.id) : a.entradoEn < b.entradoEn ? -1 : 1,
  )

  if (e.marca === null) {
    return {
      avisar: false,
      motivo: 'primera_vez',
      anteriores: orden.length,
      marca: orden.length > 0 ? marcaDe(orden) : { instante: e.hoy.toISOString(), ids: [] },
    }
  }

  const marca = e.marca
  const nuevos = orden.filter(s => esNuevo(s, marca))
  if (nuevos.length === 0) return { avisar: false, motivo: 'sin_novedades' }

  const tope = Math.max(1, e.tope ?? TOPE_AVISO_SINIESTROS)
  const tanda = nuevos.slice(0, tope)
  return { avisar: true, motivo: 'avisado', nuevos: tanda, restantes: nuevos.length - tanda.length, marca: marcaDe(tanda) }
}

// ── Los textos ──────────────────────────────────────────────────────────────

/** `YYYY-MM-DD` → `dd/mm/aaaa`. Cualquier otra cosa se devuelve tal cual. */
function fechaEs(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso
}

/** Una línea del aviso: quién, con quién, qué póliza, cuándo y con qué referencia. */
function lineaSiniestro(s: SiniestroEntrante): string {
  const quien = s.cliente ?? 'cliente sin nombre en la ficha'
  const con = s.compania ?? 'compañía no informada'
  const poliza = s.poliza ? ` · póliza ${s.poliza}` : ' · póliza no informada'
  // «no informada» NO es «no hay»: la compañía puede no mandarla. Se dice, no
  // se rellena con un hueco mudo ni con un 0.
  const cuando = s.ocurridoEn ? ` · ocurrió el ${fechaEs(s.ocurridoEn)}` : ' · fecha del hecho no informada'
  const ref = s.referencia ? ` · ref. ${s.referencia}` : ''
  return `• <b>${quien}</b> — ${con}${poliza}${cuando}${ref}`
}

/**
 * El Telegram.
 *
 * 🚨 El texto dice explícitamente que el siniestro YA está abierto en la
 * compañía y que lo que toca es LLAMAR al cliente. No puede insinuar que haya
 * que abrirlo, comunicarlo ni que esté sin comunicar: eso es el parte del
 * portal, no esto. Hay cepo en el test.
 */
export function textoAvisoSiniestros(nuevos: readonly SiniestroEntrante[], restantes = 0): string {
  const titulo = nuevos.length === 1
    ? '🚨 <b>Siniestro nuevo en la cartera</b>'
    : `🚨 <b>${nuevos.length} siniestros nuevos en la cartera</b>`
  const cola = restantes > 0
    ? `\n\nY ${restantes} más esperando: entran en el aviso de mañana, ninguno se pierde.`
    : ''
  return (
    `${titulo}\n` +
    'Han entrado por CIMA, así que <b>ya están abiertos en la compañía</b>: el cliente dio el parte.\n\n' +
    nuevos.map(lineaSiniestro).join('\n') +
    cola +
    '\n\n📞 Lo que toca es <b>llamar al cliente</b> para hacerle seguimiento y preguntar cómo va.'
  )
}

/**
 * La línea del latido.
 *
 * Los cuatro desenlaces se dicen distinto A PROPÓSITO: «no se ha podido mirar»
 * NO es «hoy no ha entrado ninguno», y «primera pasada» tampoco. Colapsarlos
 * dejaría un cliente sin su llamada con el vigía en verde.
 */
export function detalleSiniestros(
  d: DecisionSiniestros | { avisar: false; motivo: 'sin_datos'; causa?: string | null },
): string {
  if (d.motivo === 'sin_datos') {
    return `siniestros nuevos: NO se ha podido mirar${d.causa ? ` (${d.causa})` : ''}` +
      ' — esto NO significa que no haya entrado ninguno'
  }
  if (d.motivo === 'primera_vez') {
    return `siniestros nuevos: primera pasada, marca puesta en ${d.marca.instante}` +
      ` · ${d.anteriores} anterior(es) NO avisados a propósito (no se manda el histórico)`
  }
  if (d.motivo === 'sin_novedades') return 'siniestros nuevos: ninguno (comprobado)'
  return `siniestros nuevos: ${d.nuevos.length} avisado(s)` +
    (d.restantes > 0 ? ` · ${d.restantes} para la próxima pasada` : '')
}

// ── Serialización de la marca (vive en el `detalle` del latido) ──────────────
//
// Mismo truco que `correduria-ingesta`: el estado de máquina va delante,
// separado del texto humano por ` · `, para no necesitar una tabla nueva.

const SEP = ' · '

/** `<instante>|<id,id,…>` + ` · ` + el texto humano. */
export function serializarMarca(marca: MarcaSiniestros, detalle: string): string {
  return `${marca.instante}|${marca.ids.join(',')}${SEP}${detalle}`
}

/**
 * Lee la marca del `detalle` guardado. `null` = no consta.
 *
 * 🚨 Un `detalle` ilegible (formato viejo, texto a mano) se lee como `null` =
 * «primera vez», que ancla sin avisar. Es lo conservador en la dirección
 * correcta: no manda el histórico y a partir de ahí ya lleva la cuenta.
 */
export function leerMarca(detalle: string | null | undefined): MarcaSiniestros | null {
  if (typeof detalle !== 'string') return null
  const cabeza = detalle.split(SEP)[0] ?? ''
  const corte = cabeza.indexOf('|')
  if (corte < 0) return null
  const instante = cabeza.slice(0, corte)
  if (Number.isNaN(new Date(instante).getTime())) return null
  const ids = cabeza.slice(corte + 1).split(',').map(s => s.trim()).filter(s => s !== '')
  return { instante, ids }
}
