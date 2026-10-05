// Ejecuta los botones de duplicado de gastos (gdup_ok / gdup_del) que decide `planDup`.
//
// ⛔ Sin enganchar al webhook de Telegram todavía: hoy ningún aviso EMITE `callbackDup` (ver
// anomalia-callbacks.ts). Cuando se emita, el webhook necesita un bloque gemelo del de PREFIJO_IVA:
// autorización por TELEGRAM_CHAT_ID → `interpretarDup` → `ejecutarBotonDup` → `tgAnswerCallback`.
import { prisma } from '@/lib/db'
import { Prisma } from '@prisma/client'
import { claveNoDuplicado, planDup, respuestaDup, type AccionDup } from './anomalia-callbacks'
import { esquemaTitularAplicado } from './esquema-titular'

export async function ejecutarBotonDup(dec: { accion: AccionDup; id: string }): Promise<string> {
  const plan = planDup(dec, dec.accion === 'del' ? await esquemaTitularAplicado() : true)
  let filas = 0
  if (plan.tipo === 'descartar') {
    // Solo si sigue vigente: dos pulsaciones no pisan la fecha ni el motivo del primer descarte.
    filas = await prisma.$executeRaw(Prisma.sql`
      UPDATE gastos SET descartado_at = now(), descartado_motivo = ${plan.motivo}, updated_at = now()
      WHERE id = ${plan.id}::uuid AND descartado_at IS NULL
    `)
  } else if (plan.tipo === 'marcar_no_duplicado') {
    filas = await prisma.$executeRaw(Prisma.sql`
      UPDATE gastos
      SET raw_extraction = jsonb_set(coalesce(raw_extraction, '{}'::jsonb), ${[claveNoDuplicado]}::text[], 'true'::jsonb, true),
          updated_at = now()
      WHERE id = ${plan.id}::uuid
    `)
  }
  return respuestaDup(plan, filas)
}
