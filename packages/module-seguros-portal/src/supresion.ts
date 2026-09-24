/**
 * La **solicitud de supresión (art. 17 RGPD)** del portal.
 *
 * 🚨 Lo que este fichero NO hace, y es la mitad del diseño: **no borra nada**.
 *
 * El art. 17.3 excluye la supresión cuando el tratamiento es necesario «para el
 * cumplimiento de una obligación legal» (b) o «para la formulación, el ejercicio
 * o la defensa de reclamaciones» (e). Una correduría tiene las dos: la normativa
 * de seguros y la de prevención del blanqueo obligan a conservar la
 * documentación de la mediación durante años, y del contrato pueden derivarse
 * responsabilidades después.
 *
 * Así que las dos salidas fáciles están mal:
 *
 * - Un botón «Borrar mi cuenta» que **de verdad borre** destruye documentación
 *   que la ley obliga a guardar, y encima lo hace irreversible.
 * - Un botón que diga «borrado» y **deje los datos** es una mentira al
 *   interesado, y de las que se descubren solas.
 *
 * Lo que sí es obligatorio y es lo que se construye: **recibir la solicitud,
 * acusarla, y contestar en UN MES** (art. 12.3) diciendo con nombres qué se
 * borra y qué se conserva, con su base legal (art. 12.4 — la negativa parcial
 * hay que motivarla, no basta con callar).
 *
 * PENDIENTE_REVISION_LEGAL: los plazos concretos de conservación por categoría
 * los fija el asesor; aquí se declara la BASE, no el número de años, justo para
 * no publicar una cifra que nadie ha verificado.
 */

/** Estados de una solicitud. `resuelta_parcial` es el caso NORMAL, no el raro. */
export const ESTADOS_SUPRESION = [
  'recibida',
  'en_curso',
  'resuelta_total',
  'resuelta_parcial',
  'denegada',
  'retirada',
] as const
export type EstadoSupresion = (typeof ESTADOS_SUPRESION)[number]

/** Un mes desde la recepción (art. 12.3). Se cuenta en días para no pelear con los meses. */
export const DIAS_RESPUESTA = 30

/**
 * Prórroga del art. 12.3: dos meses más, y **hay que avisar dentro del primer
 * mes** explicando por qué. Prorrogar en silencio incumple igual que no
 * contestar.
 */
export const DIAS_PRORROGA = 60

export type SolicitudSupresion = {
  recibidaEn: Date
  estado: EstadoSupresion
  prorrogadaEn?: Date | null
  resueltaEn?: Date | null
}

/** Fecha límite para contestar. Con prórroga, tres meses desde la recepción. */
export function fechaLimite(s: SolicitudSupresion): Date {
  const dias = s.prorrogadaEn ? DIAS_RESPUESTA + DIAS_PRORROGA : DIAS_RESPUESTA
  return new Date(s.recibidaEn.getTime() + dias * 24 * 60 * 60 * 1000)
}

export type EstadoPlazo =
  /** Resuelta: el reloj ya no corre. */
  | 'resuelta'
  | 'en_plazo'
  /** Quedan 7 días o menos. */
  | 'urgente'
  /** Pasado el mes (o los tres) sin contestar. */
  | 'vencido'

export const DIAS_AVISO = 7

/**
 * En qué punto del plazo está. Es lo que ordena la cola del corredor: aquí lo
 * que manda es el reloj legal, no el orden de llegada.
 */
export function estadoPlazo(s: SolicitudSupresion, ahora: Date): EstadoPlazo {
  if (s.estado === 'resuelta_total' || s.estado === 'resuelta_parcial' || s.estado === 'denegada' || s.estado === 'retirada') {
    return 'resuelta'
  }
  const limite = fechaLimite(s)
  if (ahora.getTime() > limite.getTime()) return 'vencido'
  const quedan = (limite.getTime() - ahora.getTime()) / (24 * 60 * 60 * 1000)
  return quedan <= DIAS_AVISO ? 'urgente' : 'en_plazo'
}

/** Días que faltan (negativo si ya venció). Para pintarlo sin recalcular fuera. */
export function diasRestantes(s: SolicitudSupresion, ahora: Date): number {
  return Math.floor((fechaLimite(s).getTime() - ahora.getTime()) / (24 * 60 * 60 * 1000))
}

/**
 * Qué se puede borrar y qué no, con el porqué. Va **en el acuse**, no solo en
 * la respuesta final: quien pide que le borren tiene derecho a saber desde el
 * primer momento que parte de sus datos van a seguir ahí, y por qué.
 */
export type Alcance = {
  que: string
  /** `suprimible` = se borra. `conservado` = no se puede, y se dice el motivo. */
  trato: 'suprimible' | 'conservado'
  motivo: string
}

export const ALCANCE_SUPRESION: readonly Alcance[] = [
  {
    que: 'Tu acceso al portal y la huella de tu correo',
    trato: 'suprimible',
    motivo: 'Es tuyo y no sostiene ninguna obligación nuestra: se borra y dejas de poder entrar.',
  },
  {
    que: 'Los bienes y las pólizas que declaraste tú en el portal',
    trato: 'suprimible',
    motivo: 'Los aportaste tú y no forman parte del expediente de mediación.',
  },
  {
    que: 'Los documentos que subiste al portal',
    trato: 'suprimible',
    motivo: 'Salvo los que se hayan incorporado a un expediente de póliza o de siniestro.',
  },
  {
    que: 'Las pólizas contratadas y su documentación',
    trato: 'conservado',
    motivo:
      'Obligación legal de conservación de la documentación de la mediación (art. 17.3.b RGPD) y necesidad para la defensa de reclamaciones mientras puedan derivarse responsabilidades del contrato (art. 17.3.e).',
  },
  {
    que: 'Los partes de siniestro y su tramitación',
    trato: 'conservado',
    motivo:
      'Forman parte de la gestión del siniestro ante la entidad y del ejercicio o defensa de reclamaciones (art. 17.3.e RGPD).',
  },
  {
    que: 'Los datos exigidos por la prevención del blanqueo de capitales',
    trato: 'conservado',
    motivo: 'Obligación legal específica con su propio plazo (art. 17.3.b RGPD).',
  },
  {
    que: 'La constancia de que se te informó y de esta misma solicitud',
    trato: 'conservado',
    motivo:
      'Obligación legal de poder acreditar que se cumplieron los deberes de información y que se atendió tu derecho (art. 17.3.b RGPD, en relación con el art. 5.2), y necesidad para defender esa actuación si se cuestiona (art. 17.3.e). Borrarla dejaría sin acreditar justo lo que te protege.',
  },
]

/** Lo que de verdad se borrará. Se calcula, no se escribe a mano en la pantalla. */
export function loQueSeSuprime(): readonly Alcance[] {
  return ALCANCE_SUPRESION.filter((a) => a.trato === 'suprimible')
}

export function loQueSeConserva(): readonly Alcance[] {
  return ALCANCE_SUPRESION.filter((a) => a.trato === 'conservado')
}

/**
 * ¿Se puede registrar una solicitud nueva?
 *
 * Una pendiente bloquea otra: pedirlo cinco veces no acelera nada y multiplica
 * los relojes legales sobre el mismo caso. Una ya resuelta **no** bloquea:
 * alguien puede volver a pedirlo más adelante, cuando el motivo de conservación
 * haya decaído.
 */
export function puedeRegistrar(previas: readonly SolicitudSupresion[]): boolean {
  return !previas.some((s) => s.estado === 'recibida' || s.estado === 'en_curso')
}

/** Motivo para no dejar registrar otra, para que la pantalla lo diga en vez de fallar. */
export const YA_PENDIENTE =
  'Ya tienes una solicitud en curso. Te contestaremos en el plazo de un mes desde que la recibimos.'
