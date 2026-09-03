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
