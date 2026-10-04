// Backfill de las columnas de titular de `gastos` YA existentes, con la MISMA regla que el alta
// (`asignarTitular`). Módulo PURO: recibe filas y contexto, devuelve el SQL y el reparto. Lo usa
// `scripts/backfill-gastos-titular.ts` (lee JSON exportado con SELECT; nunca escribe en BD).
//
// El SQL generado:
//   · solo toca filas «sin evaluar» (sociedad_id, titular_fuente y titular_pendiente NULL): no pisa
//     lo manual ni lo que ya escribió el alta tras la migración, y es re-ejecutable;
//   · el negocio va por (sociedad_id, ref_ext), no por uuid: el de la correduría lo crea la
//     migración y su id no se conoce al generar; si faltara, un DO previo aborta la transacción.
import { asignarTitular, type AsignacionTitular, type ContextoTitular } from './asignar-titular.ts'

export interface GastoBackfill {
  id: string
  proveedor: string | null
  nif_proveedor: string | null
  propiedad: string | null
  nif_cliente: string | null
  cliente: string | null
  total: number | null
}

export interface FilaPlan { id: string; total: number; asignacion: AsignacionTitular }
export interface Reparto { clave: string; n: number; eur: number }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const lit = (s: string) => `'${s.replace(/'/g, "''")}'`

export function planBackfillTitular(gastos: GastoBackfill[], ctx: ContextoTitular): FilaPlan[] {
  return gastos.map((g) => ({
    id: g.id,
    total: Number(g.total ?? 0),
    asignacion: asignarTitular({
      proveedor: g.proveedor, nif_proveedor: g.nif_proveedor, propiedad: g.propiedad,
      nif_cliente: g.nif_cliente, cliente: g.cliente,
    }, ctx),
  }))
}

/** Nombre legible del destino para el parte (negocio > sociedad + ámbito > pendiente). */
export function claveReparto(a: AsignacionTitular, ctx: ContextoTitular, nombres: Record<string, string> = {}): string {
  if (a.pendiente) return `PENDIENTE · ${a.pendiente}`
  if (a.negocioId) return nombres[a.negocioId] ?? ctx.negocios.find((n) => n.id === a.negocioId)?.refExt ?? a.negocioId
  const soc = ctx.sociedades.find((s) => s.id === a.sociedadId)?.nombre ?? a.sociedadId
  const ambito = a.fuente.endsWith('_compartida') ? 'pisos (compartido)'
    : a.fuente.endsWith('_personal') ? 'personal'
    : 'sin actividad determinada'
  return `${soc} · ${ambito}`
}

export function repartoBackfill(plan: FilaPlan[], ctx: ContextoTitular, nombres: Record<string, string> = {}): Reparto[] {
  const m = new Map<string, Reparto>()
  for (const f of plan) {
    const clave = claveReparto(f.asignacion, ctx, nombres)
    const r = m.get(clave) ?? { clave, n: 0, eur: 0 }
    r.n++
    r.eur = Math.round((r.eur + f.total) * 100) / 100
    m.set(clave, r)
  }
  return [...m.values()].sort((a, b) => b.eur - a.eur)
}

export function sqlBackfillTitular(plan: FilaPlan[], ctx: ContextoTitular, refsRequeridas: string[] = []): string {
  const out: string[] = ['BEGIN;', '']
  for (const ref of refsRequeridas) {
    out.push(
      `DO $$ BEGIN IF (SELECT count(*) FROM public.negocios WHERE ref_ext = ${lit(ref)}) <> 1 THEN`,
      `  RAISE EXCEPTION 'falta el negocio ${ref.replace(/'/g, "''")} (aplica antes 2026-10-04_gastos_titular.sql)'; END IF; END $$;`,
      '',
    )
  }
  for (const f of plan) {
    if (!UUID.test(f.id)) throw new Error(`id de gasto no válido: ${f.id}`)
    const a = f.asignacion
    let soc = 'NULL', neg = 'NULL'
    if (a.sociedadId) {
      if (!UUID.test(a.sociedadId)) throw new Error(`sociedad no válida: ${a.sociedadId}`)
      soc = `${lit(a.sociedadId)}::uuid`
    }
    if (a.negocioId) {
      const n = ctx.negocios.find((x) => x.id === a.negocioId)
      if (!n?.refExt) throw new Error(`negocio sin ref_ext: ${a.negocioId}`)
      neg = `(SELECT id FROM public.negocios WHERE sociedad_id = ${soc} AND ref_ext = ${lit(n.refExt)})`
    }
    out.push(
      `UPDATE public.gastos SET sociedad_id = ${soc}, negocio_id = ${neg}, ` +
      `titular_fuente = ${a.fuente ? lit(a.fuente) : 'NULL'}, titular_pendiente = ${a.pendiente ? lit(a.pendiente) : 'NULL'}` +
      ` WHERE id = ${lit(f.id)}::uuid AND sociedad_id IS NULL AND titular_fuente IS NULL AND titular_pendiente IS NULL;`,
    )
  }
  out.push('', 'COMMIT;', '')
  return out.join('\n')
}
