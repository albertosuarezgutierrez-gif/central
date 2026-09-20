// Qué cuenta como CARTERA VIVA (docs/CORREDURIA-CRM-VISION.md, regla 2).
//
// La regla de Alberto es «lo que entra por CIMA es cliente actual; el resto son
// leads», y hasta ahora se implementaba como `polizas.import_ref IS NULL`: el
// volcado histórico de junio/2026 llegó con `import_ref` (`intranet:` y
// `asegura_app:`) y lo que baja de CIMA no lo lleva.
//
// 🚨 Ese filtro tiene un agujero MEDIDO (03/09/2026). Cuando la ingesta de CIMA
// trae una póliza que YA existía en el volcado, no crea fila nueva: encuentra la
// vieja, la actualiza… y le deja su `import_ref` de 2017. Resultado: una póliza
// que CIMA mantiene al día —con su suplemento de agosto y vencimiento en 2027—
// contaba como lead. Caso fundacional: la `3021700291186` de Reale (C0613), que
// dejaba a Reale con «0 pólizas vivas» y escondía a un cliente entero.
//
// La marca de que la ingesta ha tocado la fila es `eiac_xml_hash`: lo escribe el
// pipeline EIAC y NADA más lo escribe. Medido sobre la cartera entera: las 109
// pólizas con `import_ref IS NULL` lo tienen las 109, y solo 1 fila del volcado
// lo tiene. Por eso la regla correcta es la UNIÓN de dos preguntas distintas:
//
//   · `import_ref IS NULL`      → nació fuera del volcado (CIMA, o la emitimos
//                                 nosotros y está pendiente de que CIMA la traiga).
//   · `eiac_xml_hash IS NOT NULL` → la ingesta de CIMA la ha escrito alguna vez,
//                                 venga de donde venga.
//
// Los dos brazos hacen falta: quitar el primero perdería lo que emitimos nosotros
// (que aún no tiene hash), y quitar el segundo es el agujero que se arregla aquí.
//
// ⚠️ `import_ref = ''` NO es cartera viva: es el valor de cajón que se cuela por
// `IS NULL`, `??` y `COALESCE` (regla global «el "no lo sé" disfrazado de valor»).
// Hoy no hay ninguna fila así y esto es la red para que siga siendo verdad.
//
// ─── Dos preguntas, no una (19/09/2026) ─────────────────────────────────────
// «Viva» responde DE DÓNDE viene la póliza (CIMA la trae o la mantiene); NO
// responde si está EN VIGOR. Medido el 19/09/2026: de las 157 pólizas vivas,
// **47 están `cancelada`**, y 28 clientes solo tenían canceladas — y salían en
// «Cartera viva» como clientes (Kartenbrot: una póliza, cancelada, vencida en
// 2025) y con «6 póliza(s) viva(s)» quien tenía 4 en vigor y 2 canceladas.
// Alberto (19/09/2026): «si es cancelada es leads». Por eso CLIENTE se deriva
// de `esCarteraEnVigor()` = viva Y estado vigente (`POLIZA_ESTADOS_VIGENTES`,
// la lista del CRM de origen: el enum tiene DIEZ valores y un `<> 'cancelada'`
// se queda corto). `esCarteraViva()` sigue existiendo para lo que pregunta por
// el ORIGEN (gemelas del volcado, siniestros, qué enseña el portal).

import { POLIZA_ESTADOS_VIGENTES, esEstadoVigente } from './vigencia.ts'

/** Lo mínimo que hace falta saber de una póliza para decidir si es cartera viva. */
export type EntradaCarteraViva = {
  importRef: string | null | undefined
  eiacXmlHash: string | null | undefined
}

/**
 * `true` si la póliza es cartera VIVA (la que entra o se mantiene por CIMA, más
 * lo que hemos emitido nosotros y está pendiente de confirmación).
 */
export function esCarteraViva(p: EntradaCarteraViva): boolean {
  if (p.eiacXmlHash != null && p.eiacXmlHash !== '') return true
  return p.importRef == null
}

/** `true` si la póliza es volcado histórico = LEAD. Complementario exacto. */
export function esVolcadoHistorico(p: EntradaCarteraViva): boolean {
  return !esCarteraViva(p)
}

/**
 * El mismo criterio como `where` de Prisma, para no reescribirlo en cada consulta.
 * Combínalo con el resto del filtro dentro de un `AND`, nunca al lado de otro `OR`
 * suelto:  `where: { AND: [{ correduriaId }, WHERE_CARTERA_VIVA] }`.
 */
export const WHERE_CARTERA_VIVA = {
  OR: [{ importRef: null }, { NOT: { eiacXmlHash: null } }],
}

/** El complementario, para listar el volcado histórico. */
export const WHERE_VOLCADO_HISTORICO = {
  AND: [{ NOT: { importRef: null } }, { eiacXmlHash: null }],
}

/**
 * El mismo criterio en SQL crudo, para las consultas que no pasan por Prisma.
 * `alias` es el de la tabla `polizas` en esa consulta (`p` casi siempre).
 */
export function sqlCarteraViva(alias = 'p'): string {
  return `(${alias}.import_ref is null or ${alias}.eiac_xml_hash is not null)`
}

/** El complementario en SQL crudo. */
export function sqlVolcadoHistorico(alias = 'p'): string {
  return `(${alias}.import_ref is not null and ${alias}.eiac_xml_hash is null)`
}

// ─── Cartera EN VIGOR = viva Y estado vigente ────────────────────────────────

/** Lo que hace falta para decidir si una póliza cuenta como CLIENTE de hoy. */
export type EntradaCarteraEnVigor = EntradaCarteraViva & {
  /** `estado_poliza` de la BD. `null`/`undefined` = no vigente (no se supone). */
  estado: string | null | undefined
}

/**
 * `true` si la póliza es cartera viva (origen CIMA) Y está en un estado que
 * sigue en juego. Es la pregunta «¿este cliente es cliente HOY?»: la que
 * decide el grupo viva/leads del listado, el recuento de pólizas vivas y
 * quién entra en «clientes sin canal». Una cancelada de CIMA es un ex-cliente,
 * no un cliente (`estado-cliente.ts` ya lo decía; el listado no lo aplicaba).
 */
export function esCarteraEnVigor(p: EntradaCarteraEnVigor): boolean {
  if (!esCarteraViva(p)) return false
  return p.estado != null && esEstadoVigente(p.estado)
}

/** Lo que NO es cartera en vigor: volcado histórico O cancelada/no vigente de CIMA. */
export function esCarteraNoEnVigor(p: EntradaCarteraEnVigor): boolean {
  return !esCarteraEnVigor(p)
}

/** El mismo criterio como `where` de Prisma. Combínalo dentro de un `AND`. */
export const WHERE_CARTERA_EN_VIGOR = {
  AND: [WHERE_CARTERA_VIVA, { estado: { in: [...POLIZA_ESTADOS_VIGENTES] } }],
}

const SQL_ESTADOS_VIGENTES = POLIZA_ESTADOS_VIGENTES.map((e) => `'${e}'`).join(', ')

/** El mismo criterio en SQL crudo. `alias` es el de `polizas`. */
export function sqlCarteraEnVigor(alias = 'p'): string {
  return `(${sqlCarteraViva(alias)} and ${alias}.estado::text in (${SQL_ESTADOS_VIGENTES}))`
}

/** El complementario exacto en SQL crudo. `is not true` y no `not (…)`: con
 *  `estado` NULL el `in (…)` da NULL y `not NULL` sigue siendo NULL, así que esa
 *  fila no caería en NINGÚN grupo; con `is not true` cae en leads, igual que
 *  `esCarteraNoEnVigor` en TS. (La columna es NOT NULL hoy; es la red.) */
export function sqlCarteraNoEnVigor(alias = 'p'): string {
  return `(${sqlCarteraEnVigor(alias)} is not true)`
}
