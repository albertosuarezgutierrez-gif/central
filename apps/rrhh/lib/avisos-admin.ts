// Adaptador Prisma de `rrhh.avisos_admin` (migración 0027): deja un aviso en el panel del responsable
// cuando un correo de rrhh no sale. La decisión (motivo, dedupe 6 h, texto) es PURA en `avisos-admin-reglas.ts`.
// 🚨 NUNCA lanza (un fallo aquí no puede tumbar el envío ni la petición) y NUNCA recibe código ni clave.
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { debeAvisar, motivoFallo, textoAvisoEnvio, type CanalEnvio } from '@/lib/avisos-admin-reglas'

export type FalloEnvio = {
  empresaId: string
  /** null = aviso a los responsables (no hay empleado). */
  empleadoId: string | null
  canal: CanalEnvio
  /** ¿Había transporte de correo? false → «sin proveedor»; true y falló → «error del servidor». */
  hayTransporte: boolean
  /** Si faltan, se leen de la ficha (filtrando por empresa). */
  nombre?: string | null
  email?: string | null
  /** No avisar si el empleado no tiene email (entonces no hubo nada que enviar). */
  soloSiHayEmail?: boolean
}

export async function registrarFalloEnvio(f: FalloEnvio): Promise<void> {
  try {
    let { nombre, email } = f
    if (f.empleadoId && (nombre == null || email == null)) {
      const r = await prisma.$queryRaw<{ nombre: string; email: string | null }[]>(Prisma.sql`
        SELECT TRIM(CONCAT(nombre, ' ', COALESCE(apellidos, ''))) AS nombre, email FROM rrhh.empleados
        WHERE id = ${f.empleadoId}::uuid AND empresa_id = ${f.empresaId}::uuid LIMIT 1`)
      nombre = nombre ?? r[0]?.nombre ?? null
      email = email ?? r[0]?.email ?? null
    }
    if (f.soloSiHayEmail && !email) return
    const ult = await prisma.$queryRaw<{ creado_at: Date }[]>(Prisma.sql`
      SELECT max(creado_at) AS creado_at FROM rrhh.avisos_admin
      WHERE empresa_id = ${f.empresaId}::uuid AND canal = ${f.canal} AND tipo = 'envio_fallido'
        AND empleado_id IS NOT DISTINCT FROM ${f.empleadoId}::uuid`)
    if (!debeAvisar(ult[0]?.creado_at ?? null)) return
    const motivo = motivoFallo(f.hayTransporte)
    const texto = textoAvisoEnvio({ canal: f.canal, motivo, nombre, email })
    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO rrhh.avisos_admin (empresa_id, empleado_id, tipo, canal, motivo, texto)
      VALUES (${f.empresaId}::uuid, ${f.empleadoId}::uuid, 'envio_fallido', ${f.canal}, ${motivo}, ${texto})`)
  } catch (e) {
    console.error('[avisos-admin] no se pudo registrar el aviso', e instanceof Error ? e.message : e)
  }
}

export type AvisoAdmin = { id: string; texto: string; creado_at: string }

/** Fallos de los últimos 7 días SIN ver, de LA empresa de la sesión. */
export async function listarAvisosAdmin(empresaId: string): Promise<AvisoAdmin[]> {
  try {
    return await prisma.$queryRaw<AvisoAdmin[]>(Prisma.sql`
      SELECT id::text AS id, texto, creado_at::text AS creado_at FROM rrhh.avisos_admin
      WHERE empresa_id = ${empresaId}::uuid AND visto_at IS NULL AND creado_at >= now() - interval '7 days'
      ORDER BY creado_at DESC LIMIT 20`)
  } catch (e) {
    console.error('[avisos-admin] no se pudo leer', e instanceof Error ? e.message : e)
    return []
  }
}

/** «Marcar como visto»: solo los de esa empresa. */
export async function marcarAvisosAdminVistos(empresaId: string, ids?: string[]): Promise<number> {
  return prisma.$executeRaw(Prisma.sql`
    UPDATE rrhh.avisos_admin SET visto_at = now()
    WHERE empresa_id = ${empresaId}::uuid AND visto_at IS NULL
      ${ids?.length ? Prisma.sql`AND id = ANY(${ids}::uuid[])` : Prisma.empty}`)
}
