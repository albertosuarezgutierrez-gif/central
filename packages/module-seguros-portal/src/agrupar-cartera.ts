// En qué CAJÓN va cada titular de la bóveda, puro y sin BD.
//
// ── Por qué existe (07/09/2026) ─────────────────────────────────────────────
//
// Alberto, mirando su portal: «llegará un momento en que un cliente tenga
// acceso a varios clientes a su vez, sobre todo empresa… yo tengo empresa, y
// mis padres, por lo que se tiene que diferenciar bien cuáles son pólizas mías
// personales, cuáles de la empresa y a su vez de cada autorizado».
//
// Hasta hoy la bóveda tenía DOS listas (`propias` y `autorizadas`) y solo la
// segunda distinguía de quién es cada póliza, con un chip por fila. Las
// `propias` salían todas juntas y SIN etiqueta ninguna — y `propias` es un
// array: una identidad puede estar vinculada a varias fichas. O sea que las
// pólizas personales de alguien y las de su sociedad se pintaban en la misma
// lista plana, sin nada que las separase. Es el mismo fallo que ya se arregló
// para las ajenas, un piso más abajo.
//
// ── 🚨 Se agrupa por `clienteId`, JAMÁS por nombre ──────────────────────────
//
// Regla global del monorepo («agrupar personas: por IDENTIDAD, nunca por la
// etiqueta»). Dos fichas distintas con el mismo nombre —un padre y un hijo, o
// una persona y su sociedad unipersonal— son DOS titulares, y fundirlas
// mezclaría sus pólizas en un bloque de aspecto perfectamente normal. Duplicar
// se ve; mezclar no.
//
// ── Lo que este módulo NO decide ────────────────────────────────────────────
//
// Qué campos se sirven de cada póliza (eso es `camposVisibles`/`camposDeAlcances`)
// ni si una autorización está viva (`autorizacionVigente`). Aquí solo se decide
// en qué bloque se pinta un titular que YA se ha resuelto.

import type { TipoOtorgante } from './autorizacion.ts'

/** Los tres cajones, en el orden en que se pintan. */
export const GRUPOS_CARTERA = ['mias', 'empresas', 'autorizadas'] as const
export type GrupoCartera = (typeof GRUPOS_CARTERA)[number]

/**
 * El título de cada bloque.
 *
 * «Tus seguros» y no «Míos» porque la pantalla habla de tú al cliente, y
 * «Seguros de tus empresas» en plural porque puede tener varias sociedades —
 * el nombre de cada una va en su propia cabecera.
 */
export const TITULO_GRUPO: Record<GrupoCartera, string> = {
  mias: 'Tus seguros',
  empresas: 'Seguros de tus empresas',
  autorizadas: 'Seguros que te han autorizado a ver',
}

/**
 * Lo mínimo que hace falta saber de un titular para colocarlo. Deliberadamente
 * NO incluye sus pólizas: agrupar no es leer la cartera, y así el cepo de este
 * módulo se escribe sin montar una póliza entera.
 */
export type TitularAgrupable = {
  /** 🚨 La identidad del titular. Es la clave de agrupación; el nombre no lo es. */
  clienteId: string
  /** `true` = ficha de la propia identidad (`portal_vinculo`). `false` = ajena, por autorización. */
  propia: boolean
  /**
   * Persona física o jurídica.
   *
   * ⚠️ Quien construye esto ya ha colapsado el `NULL` de la BD hacia `fisica`
   * (el lado restrictivo, que es el que decide los alcances). Aquí eso hace que
   * una ficha de tipo desconocido caiga en «Tus seguros» en vez de inventarle
   * una empresa a nadie, que es el error que sí se vería.
   */
  tipoPersona: TipoOtorgante
}

/**
 * En qué bloque va este titular.
 *
 * 🚨 Una ficha AJENA va siempre a `autorizadas`, sea sociedad o no: la empresa
 * de otro que te ha dado acceso no es «tu empresa». Confundirlas pondría las
 * pólizas de un tercero bajo un título que dice que son tuyas.
 */
export function grupoDeTitular(t: TitularAgrupable): GrupoCartera {
  if (!t.propia) return 'autorizadas'
  return t.tipoPersona === 'juridica' ? 'empresas' : 'mias'
}

export type BloqueCartera<T extends TitularAgrupable> = {
  grupo: GrupoCartera
  titulo: string
  titulares: T[]
  /**
   * Si cada titular de este bloque necesita su nombre como cabecera.
   *
   * En `mias` con un solo titular el nombre es ruido: la persona ya sabe cómo
   * se llama y el título del bloque lo dice. En cuanto hay dos —o el bloque es
   * de empresas o de terceros— el nombre ES la información que separa una
   * póliza de otra.
   */
  conNombre: boolean
}

/**
 * Reparte los titulares en bloques, en el orden de `GRUPOS_CARTERA` y **sin los
 * bloques vacíos**: una sección con un título y nada debajo se lee como una
 * avería, no como «aquí no hay nada».
 *
 * Conserva el orden de entrada dentro de cada bloque (el de `portal_vinculo` es
 * por fecha de creación, así que la ficha con la que entró primero sale
 * primero) y NO fusiona titulares distintos aunque compartan nombre.
 */
export function agruparCartera<T extends TitularAgrupable>(
  titulares: readonly T[],
): BloqueCartera<T>[] {
  const bloques: BloqueCartera<T>[] = []
  for (const grupo of GRUPOS_CARTERA) {
    const suyos = titulares.filter((t) => grupoDeTitular(t) === grupo)
    if (suyos.length === 0) continue
    bloques.push({
      grupo,
      titulo: TITULO_GRUPO[grupo],
      titulares: suyos,
      conNombre: grupo !== 'mias' || suyos.length > 1,
    })
  }
  return bloques
}
