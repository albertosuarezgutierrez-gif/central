// ¿Está aplicada `prisma/sql/2026-10-04_gastos_titular.sql`? El código se despliega ANTES que el
// DDL (gate de 2 ojos), así que lo que escribe columnas nuevas pregunta primero aquí.
//
// Una consulta a information_schema por proceso: el «sí» se cachea para siempre (una columna no
// desaparece en caliente); el «no» y el error, 5 minutos (para enterarse sin redeploy cuando se
// aplique). Un error de lectura cuenta como «no»: ante la duda se inserta como siempre.
import { prisma } from '@/lib/db'
import { Prisma } from '@prisma/client'
import { esquemaCompleto, type ColumnaEsquema } from './esquema-titular-puro'

const TTL_NO_MS = 5 * 60_000
let cache: { ok: boolean; hasta: number } | null = null

export async function esquemaTitularAplicado(): Promise<boolean> {
  const ahora = Date.now()
  if (cache && (cache.ok || ahora < cache.hasta)) return cache.ok
  let ok = false
  try {
    const cols = await prisma.$queryRaw<ColumnaEsquema[]>(Prisma.sql`
      SELECT table_name AS tabla, column_name AS columna FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name IN ('gastos', 'sociedades')
    `)
    ok = esquemaCompleto(cols)
  } catch (e) {
    console.error('[esquema-titular] no se pudo leer information_schema:', e)
  }
  cache = { ok, hasta: ahora + TTL_NO_MS }
  return ok
}
