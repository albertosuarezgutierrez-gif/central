// Lectura de lo que `camposEmisionDe` necesita (el hash se queda aquí: no sale de asegura). Ver presupuesto-emision-campos.ts.
import { prisma } from './tenant.ts'
import { hayIpidHuella } from './esquema-bd.ts'
import { registrarErrorCartera } from './error-cartera.ts'
import { camposEmisionDe, type CamposEmision, type FilaEmision } from './presupuesto-emision-campos.ts'

/** Por id de presupuesto. Si no se puede leer (sin la columna o error), TODOS `null`: «no se sabe», nunca «sin IPID». */
export async function leerCamposEmision(correduriaId: string, ids: string[]): Promise<Map<string, CamposEmision>> {
  const m = new Map<string, CamposEmision>()
  if (ids.length === 0) return m
  try {
    if (!(await hayIpidHuella())) return m
    const filas = await prisma.$queryRaw<(FilaEmision & { id: string })[]>`
      select p.id::text as id, p.ipid_huella as "ipidHuella", p.opcion_elegida_id::text as "opcionElegidaId"
      from seguros.presupuesto p
      where p.correduria_id = ${correduriaId}::uuid and p.id = any(${ids}::uuid[])`
    for (const f of filas) m.set(f.id, camposEmisionDe(f))
  } catch (e) {
    registrarErrorCartera('operador/presupuesto/campos-emision', e)
    m.clear()
  }
  return m
}
