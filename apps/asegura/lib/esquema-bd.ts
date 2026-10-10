// Instancia real de `esquema-opcional.ts` contra la BD (schema `seguros`). Ver ese fichero.
import { prisma } from './tenant.ts'
import { crearEsquemaOpcional, type ElementoEsquema } from './esquema-opcional.ts'

async function consultar(e: ElementoEsquema): Promise<boolean> {
  if (e.tipo === 'tabla') {
    const f = await prisma.$queryRaw<{ ok: boolean }[]>`select to_regclass(${'seguros.' + e.tabla}) is not null as ok`
    return f[0]?.ok === true
  }
  const f = await prisma.$queryRaw<{ ok: boolean }[]>`
    select exists (select 1 from information_schema.columns
                    where table_schema = 'seguros' and table_name = ${e.tabla} and column_name = ${e.columna}) as ok`
  return f[0]?.ok === true
}

export const esquema = crearEsquemaOpcional({ consultar })

export const hayBotVersion = () => esquema.existeColumna('tarificacion_trabajos', 'bot_version')
export const hayPasos = () => esquema.existeTabla('tarificacion_trabajo_pasos')
