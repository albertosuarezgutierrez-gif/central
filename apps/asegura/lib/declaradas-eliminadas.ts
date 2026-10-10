/**
 * Las pólizas que el cliente APORTA en el portal se quitan con borrado LÓGICO
 * (`seguros.portal_poliza_declarada.eliminada_en`, 10/10/2026): la fila sigue, con fecha.
 *
 * 🚨 Toda lectura de `portalPolizaDeclarada` en esta app lleva `DECLARADA_VIVA` (o, en SQL
 * crudo, `SQL_DECLARADA_VIVA`). Una que lo olvide manda al corredor leads y revisiones anuales
 * de pólizas que la persona quitó, y nada falla. La única excepción es el export RGPD, que
 * enseña TAMBIÉN las eliminadas (derecho de acceso) marcándolas. Lo vigila
 * `test/regression-asegura-declaradas-eliminadas.test.ts`, que mira CADA llamada.
 *
 * Espejo del portal: `apps/asegura-portal/lib/declaradas-eliminadas.ts`.
 */
import { Prisma } from './generated/asegura-client'

/** Se ESPARCE dentro del `where`: `{ identidadId, ...DECLARADA_VIVA }`. */
export const DECLARADA_VIVA = { eliminadaEn: null } satisfies Prisma.PortalPolizaDeclaradaWhereInput

/**
 * Marca EXPLÍCITA de «aquí se leen también las eliminadas». Solo el export RGPD (derecho de
 * acceso) puede usarla; el guardián falla si aparece en otro fichero.
 */
export const DECLARADA_CON_ELIMINADAS = {} satisfies Prisma.PortalPolizaDeclaradaWhereInput

/** Para SQL crudo; `alias` es el de la tabla en el `from`/`join` (`d`). */
export function sqlDeclaradaViva(alias: string): Prisma.Sql {
  if (!/^[a-z_][a-z0-9_]*$/i.test(alias)) throw new Error('alias SQL no válido')
  return Prisma.raw(`${alias}.eliminada_en is null`)
}
