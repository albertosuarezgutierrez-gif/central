// Los AVISOS de la campana: qué tiene pendiente la persona que ha entrado, en
// una sola lista, con un enlace al sitio donde cada cosa se resuelve.
//
// Esto es PURO a propósito: recibe lo que ya leyeron `lib/autorizaciones.ts` y
// `lib/obligaciones.ts` (cada uno con su frontera de identidad) y no toca la BD.
// Así el test lo rompe a mano sin Prisma, y la ruta `/api/avisos` no decide nada.
//
// 🚨 Un aviso NO se acepta desde aquí ni desde la campana. La autorización se
// acepta en `/autorizaciones`, con su alcance y su texto delante; la obligación
// se mira en el calendario. La campana ENSEÑA y ENLAZA. Duplicar el «aceptar»
// en dos pantallas es cómo se acaba aceptando sin leer.
//
// 🚨 Y tres desenlaces para el número, ninguno es «0» por defecto. Si una de las
// dos fuentes no se ha podido leer, «no tienes avisos» es una mentira sobre la
// que el cliente decide no mirar. Es la regla del `CLAUDE.md` de la raíz (dato
// que NO hay ≠ dato que NO se ha mirado), un piso más abajo.
import { entraEnVentana, type EstadoAutorizacion } from '@central/module-seguros-portal'

export const TIPOS_AVISO = ['autorizacion_pendiente', 'autorizacion_sin_aceptar', 'obligacion_en_ventana'] as const
export type TipoAviso = (typeof TIPOS_AVISO)[number]

export type Aviso = {
  tipo: TipoAviso
  /** El id de la fila de origen, para que la pantalla tenga `key` estable. */
  id: string
  titulo: string
  detalle: string
  /** A dónde lleva: SIEMPRE la pantalla donde se resuelve, nunca una acción. */
  href: string
}

export const FUENTES_AVISO = ['autorizaciones', 'obligaciones'] as const
export type FuenteAviso = (typeof FUENTES_AVISO)[number]

/** Lo mínimo que la campana necesita de una autorización; el resto de `AutorizacionVista` no se mira. */
export type AutorizacionParaAviso = {
  id: string
  estado: EstadoAutorizacion
  otorganteNombre: string | null
  autorizadoNombre: string | null
}

/** Lo mínimo de una obligación del calendario. */
export type ObligacionParaAviso = {
  id: string
  titulo: string
  fechaAccionable: Date
}

export type EntradaAvisos = {
  /** `null` = esa fuente NO se ha podido leer. No es lo mismo que `{ otorgadas: [], recibidas: [] }`. */
  autorizaciones: { otorgadas: AutorizacionParaAviso[]; recibidas: AutorizacionParaAviso[] } | null
  /** `null` = no se ha podido leer. `[]` = leído, no hay. */
  obligaciones: ObligacionParaAviso[] | null
  hoy: Date
}

export type Avisos = {
  avisos: Aviso[]
  /** Las fuentes que fallaron. Vacío = todo leído; con algo, el número lleva `+`. */
  fuentesIlegibles: FuenteAviso[]
  /** Lo que pinta el globo de la campana. `null` = sin globo (todo leído y nada pendiente). */
  globo: string | null
}

/** A dónde manda cada tipo. Un mapa, no un `switch` en la pantalla: el que añada un tipo lo ve aquí. */
export const HREF_POR_TIPO: Record<TipoAviso, string> = {
  autorizacion_pendiente: '/autorizaciones',
  autorizacion_sin_aceptar: '/autorizaciones',
  // El `#` es el `id` del titular del calendario en `boveda/Calendario.tsx`.
  obligacion_en_ventana: '/boveda#calendario-titulo',
}

const FECHA = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'long', timeZone: 'UTC' })

/**
 * El texto del globo. Tres desenlaces, y «0» no es uno de ellos:
 *  · todas las fuentes leídas y `n` pendientes → `n` (o sin globo si `n` = 0);
 *  · alguna fuente ilegible → `n+` (hay AL MENOS `n`; puede haber más);
 *  · ninguna legible → `!` (no se sabe nada).
 */
export function textoGlobo(n: number, ilegibles: number, fuentes: number): string | null {
  if (fuentes > 0 && ilegibles >= fuentes) return '!'
  if (ilegibles > 0) return `${n}+`
  return n > 0 ? String(n) : null
}

export function avisosDe(x: EntradaAvisos): Avisos {
  const avisos: Aviso[] = []
  const fuentesIlegibles: FuenteAviso[] = []

  if (x.autorizaciones === null) {
    fuentesIlegibles.push('autorizaciones')
  } else {
    // Las que me han concedido y aún no he aceptado: es lo que la campana
    // existe para enseñar. Hasta el 08/09/2026 solo se veía entrando en la
    // pestaña «Quién me ve», y quien no entraba no se enteraba.
    for (const a of x.autorizaciones.recibidas) {
      if (a.estado !== 'pendiente') continue
      avisos.push({
        tipo: 'autorizacion_pendiente',
        id: a.id,
        titulo: `${a.otorganteNombre ?? 'Alguien'} te ha dado acceso a sus seguros`,
        detalle: 'Falta que lo aceptes para poder verlos.',
        href: HREF_POR_TIPO.autorizacion_pendiente,
      })
    }
    // El espejo: las que YO concedí y la otra persona no ha aceptado. «La
    // persona invitada» cuando no es cliente: de ella no hay ficha ni nombre, y
    // la pantalla no inventa uno.
    for (const a of x.autorizaciones.otorgadas) {
      if (a.estado !== 'pendiente') continue
      avisos.push({
        tipo: 'autorizacion_sin_aceptar',
        id: a.id,
        titulo: `${a.autorizadoNombre ?? 'La persona invitada'} aún no ha aceptado tu acceso`,
        detalle: 'Hasta que acepte no ve nada. Puedes recordárselo o retirarlo.',
        href: HREF_POR_TIPO.autorizacion_sin_aceptar,
      })
    }
  }

  if (x.obligaciones === null) {
    fuentesIlegibles.push('obligaciones')
  } else {
    for (const o of x.obligaciones) {
      // La ventana la decide el módulo (7 días antes de la fecha ACCIONABLE, que
      // ya lleva descontado el preaviso del art. 22 LCS). No se reimplementa.
      if (!entraEnVentana({ fechaAccionable: o.fechaAccionable, hoy: x.hoy })) continue
      avisos.push({
        tipo: 'obligacion_en_ventana',
        id: o.id,
        titulo: o.titulo,
        detalle: `Puedes actuar hasta el ${FECHA.format(o.fechaAccionable)}.`,
        href: HREF_POR_TIPO.obligacion_en_ventana,
      })
    }
  }

  return {
    avisos,
    fuentesIlegibles,
    globo: textoGlobo(avisos.length, fuentesIlegibles.length, FUENTES_AVISO.length),
  }
}
