// De QUIÉN es el libro de comisiones. Extraído de `app/api/cron/cima-liq/route.ts` (03/11/2026) para
// que el lector de liquidaciones PDF (`liquidacion-doc-db.ts`) escriba en la MISMA cuenta que el cron.
//
// 🚨 Era `SELECT id FROM cuentas LIMIT 1` sin orden: desde el 20/09/2026 escribía en una cuenta SIN
// bancos. Ahora: las cuentas con acceso a la correduría (`CORREDURIA_EMAILS`), y entre ellas la que
// recibe los abonos de seguros. Sin la lista no se escribe nada (fail-closed).
import { prisma } from '@/lib/db'
import { ENV_LISTA_CORREDURIA, listaCorreduria } from '@/lib/correduria-acceso'

export type CuentaLibro =
  | { ok: true; cuentaId: string; abonos: number }
  | { ok: false; motivo: string }

export async function cuentaDelLibro(): Promise<CuentaLibro> {
  const lista = listaCorreduria()
  if (lista === null) {
    return { ok: false, motivo: `falta ${ENV_LISTA_CORREDURIA}: no se sabe de quién es el libro, no se escribe nada` }
  }
  const cuenta = await prisma.$queryRaw<Array<{ id: string; abonos: number }>>`
    SELECT c.id, (SELECT count(*) FROM movimientos_bancarios mb JOIN cuentas_bancarias cb ON cb.id = mb.cuenta_bancaria_id
                  WHERE cb.cuenta_id = c.id AND mb.destino = 'seguros' AND mb.importe > 0
                    AND coalesce(mb.duplicado_estado, '') <> 'ignorado')::int AS abonos
    FROM cuentas c
    WHERE lower(c.email) = ANY(${lista}::text[])
    ORDER BY abonos DESC, c.created_at, c.id
    LIMIT 1`
  if (!cuenta.length) {
    return { ok: false, motivo: `ninguna cuenta casa con ${ENV_LISTA_CORREDURIA} (¿errata en la lista?): no se ha podido cuadrar nada` }
  }
  return { ok: true, cuentaId: cuenta[0].id, abonos: cuenta[0].abonos }
}
