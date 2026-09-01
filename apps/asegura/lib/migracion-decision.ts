/**
 * ¿Cuándo se considera que la cartera «ya está aquí»? — LÓGICA PURA, sin BD.
 *
 * Vive aparte de `estado-migracion.ts` por el mismo motivo que `tenant-ambito.ts`
 * vive aparte de `tenant.ts`: la regla se puede probar sin Prisma ni red, y lo
 * que se equivocó fue la REGLA, no la consulta.
 *
 * ─── El fallo que originó este fichero (01/09/2026) ─────────────────────────
 * `estadoMigracion()` contaba TABLAS. El volcado dejó el DDL —53 tablas— con
 * CERO filas, así que «hay tablas» pasó a `true`, el ámbito de correduría saltó
 * de `pendiente` a **`sin-asignar`**, y la pantalla afirmaba «tu cuenta no está
 * vinculada a ninguna correduría» —una ausencia COMPROBADA— sobre una cartera de
 * 32.600 fichas que existe y está viva.
 *
 * O sea: el código escrito para no confundir «no se sabe» con «no hay» cometía
 * exactamente esa confusión un nivel más abajo. **Migrado es que haya DATOS**;
 * tener las tablas es tener el sitio donde ponerlos.
 *
 * ─── Por qué se cuentan CORREDURÍAS y no clientes ───────────────────────────
 * Es el dato que de verdad hace falta: sin una fila en `seguros.corredurias` no
 * hay a qué vincular la cuenta, y el ámbito seguiría siendo «pendiente» aunque
 * hubiera un millón de clientes. Y además no toca datos personales — contar
 * `clientes` sin filtro sería contar los de TODAS las corredurías, que con
 * BYPASSRLS es justo lo que el resto de la app tiene prohibido.
 */

export type EstadoMigracion = {
  migrado: boolean
  /** Tablas del schema. Se conserva para poder EXPLICAR el estado, no para decidirlo. */
  tablas: number
  /** Filas en `seguros.corredurias`. `0` con tablas > 0 = DDL puesto, datos no. */
  corredurias: number
  error: boolean
}

export function decidirMigracion(d: {
  tablas: number
  corredurias: number
  error: boolean
}): EstadoMigracion {
  // Un fallo de lectura NUNCA se degrada a «no hay»: se dice que no se sabe. Y
  // el recuento que venga de una consulta fallida no se propaga: no es de fiar.
  if (d.error) return { migrado: false, tablas: d.tablas, corredurias: 0, error: true }
  return { migrado: d.corredurias > 0, tablas: d.tablas, corredurias: d.corredurias, error: false }
}

/** Qué decir en pantalla. Nunca afirma una ausencia que no se ha comprobado. */
export function explicarMigracion(e: EstadoMigracion): string {
  if (e.error) return 'No se ha podido comprobar si la cartera está aquí. No lo leas como que no hay.'
  if (e.migrado) return ''
  if (e.tablas === 0) return 'La cartera todavía no se ha traído: el schema «seguros» está vacío.'
  return (
    `El schema «seguros» tiene ${e.tablas} tablas pero ninguna correduría: está el sitio, ` +
    'no los datos. Esto NO significa que la correduría no tenga cartera.'
  )
}
