// Nº de recibo normalizado EN SQL, con la MISMA regla que `normalizarIdRecibo()` de module-seguros:
// sin ceros a la izquierda y sin el sufijo `-<LETRA>` con que CIMA guarda los recibos de Occident
// (`400000001-K` frente al `400000001` de su correo). Es también la expresión de
// `recibo_devolucion.id_recibo_norm` y de los triggers (migración 2026-10-14b).
//
// Se escribe la expresión ENTERA aquí (no una función SQL) para que el código funcione igual antes y
// después de aplicar la migración.
import { SUFIJO_ID_RECIBO_SQL } from '@central/module-seguros'
import { Prisma } from './generated/asegura-client'

export function idReciboNorm(col: Prisma.Sql): Prisma.Sql {
  return Prisma.sql`regexp_replace(ltrim(${col}, '0'), ${Prisma.raw(`'${SUFIJO_ID_RECIBO_SQL}'`)}, '')`
}

/** `r.id_recibo` normalizado (alias `r` = `poliza_recibos`). */
export const NORM_R_ID_RECIBO = idReciboNorm(Prisma.raw('r.id_recibo'))
