// Genera `prisma/sql/2026-10-04_gastos_titular_backfill.sql` con la MISMA regla que el alta
// (`asignarTitular`). NO toca la BD: lee dos JSON exportados con SELECT y escribe SQL por stdout
// (el reparto por destino sale por stderr). El SQL se pega después con el gate de DDL/datos.
//
// Uso (DESPUÉS de aplicar 2026-10-04_gastos_titular.sql, para que el contexto traiga `estado` y el
// negocio de la correduría):
//   1) gastos.json   ← SELECT json_agg(json_build_object('id', id::text, 'proveedor', proveedor,
//        'nif_proveedor', nif_proveedor, 'propiedad', propiedad, 'total', total::float8,
//        'nif_cliente', raw_extraction->>'nif_cliente', 'cliente', raw_extraction->>'cliente'))
//      FROM gastos WHERE sociedad_id IS NULL AND titular_fuente IS NULL AND titular_pendiente IS NULL;
//   2) contexto.json ← SELECT json_build_object(
//        'sociedades', (SELECT json_agg(json_build_object('id', id::text, 'nombre', nombre, 'cif', cif, 'estado', estado))
//                       FROM sociedades WHERE cuenta_id = '<cuenta del buzón>'),
//        'negocios',  (SELECT json_agg(json_build_object('id', n.id::text, 'sociedadId', n.sociedad_id::text,
//                       'refExt', n.ref_ext, 'app', n.app, 'nombre', n.nombre))
//                       FROM negocios n JOIN sociedades s ON s.id = n.sociedad_id WHERE s.cuenta_id = '<cuenta>'));
//   3) node scripts/backfill-gastos-titular.ts gastos.json contexto.json > prisma/sql/2026-10-04_gastos_titular_backfill.sql
//
// 🚨 Multi-tenant: el contexto es el de UNA cuenta (la del buzón de facturas, como en el alta).
import { readFileSync } from 'node:fs'
import { planBackfillTitular, repartoBackfill, sqlBackfillTitular, type GastoBackfill } from '../lib/agente-facturas/backfill-titular.ts'
import { REF_NEGOCIO_CORREDURIA, type ContextoTitular } from '../lib/agente-facturas/asignar-titular.ts'

const [fGastos, fCtx] = process.argv.slice(2)
if (!fGastos || !fCtx) { console.error('Uso: node scripts/backfill-gastos-titular.ts gastos.json contexto.json'); process.exit(2) }

const gastos = JSON.parse(readFileSync(fGastos, 'utf8')) as GastoBackfill[]
const raw = JSON.parse(readFileSync(fCtx, 'utf8')) as { sociedades?: ContextoTitular['sociedades']; negocios?: (ContextoTitular['negocios'][number] & { nombre?: string })[] }
const ctx: ContextoTitular = { sociedades: raw.sociedades ?? [], negocios: raw.negocios ?? [] }
if (ctx.sociedades.some((s) => !s.estado)) { console.error('El contexto no trae sociedades.estado: ¿está aplicada la migración?'); process.exit(2) }

const nombres = Object.fromEntries((raw.negocios ?? []).map((n) => [n.id, n.nombre ?? n.id]))
const plan = planBackfillTitular(gastos, ctx)

process.stdout.write([
  `-- ⛔ GENERADO por scripts/backfill-gastos-titular.ts (${new Date().toISOString().slice(0, 10)}). Gate de datos en prod:`,
  '-- revisar con segundo par de ojos antes de pegar. Re-ejecutable: solo toca filas sin evaluar.',
  '',
  sqlBackfillTitular(plan, ctx, [REF_NEGOCIO_CORREDURIA]),
].join('\n'))

const eur = (n: number) => n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: 'always' } as Intl.NumberFormatOptions) + '€'
console.error(`Reparto previsto (${plan.length} gastos):`)
for (const r of repartoBackfill(plan, ctx, nombres)) console.error(`  ${r.clave}: ${r.n} · ${eur(r.eur)}`)
