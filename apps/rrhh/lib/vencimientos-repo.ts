// Adaptador Prisma del cron de vencimiento de contratos. Recorre TODAS las empresas (es un cron), pero cada fila lleva su
// `empresa_id` y el aviso se escribe con el de SU contrato (nunca mezcla empresas). Idempotente por el índice único
// `avisos_clave_idempotencia_uq` (migración 0033): el INSERT … ON CONFLICT DO NOTHING reserva la fila.
// 🚨 Solo intranet (aviso en /e): NO manda email ni push (regla del monorepo: nada sale a terceros sin OK explícito).
import { prisma } from './prisma'
import { Prisma } from '@prisma/client'
import { avisosDeHoy, textoAvisoVencimiento, type ContratoVencible } from './vencimientos'

export async function ejecutarAvisosVencimiento(hoy: string): Promise<{ revisados: number; creados: number; repetidos: number }> {
  const rows = await prisma.$queryRaw<{ id: string; empresa_id: string; empleado_id: string; fecha_fin: string | null }[]>(Prisma.sql`
    SELECT c.id::text AS id, c.empresa_id::text AS empresa_id, c.empleado_id::text AS empleado_id, c.fecha_fin::text AS fecha_fin
    FROM rrhh.contratos_laborales c
    JOIN rrhh.empleados e ON e.id = c.empleado_id AND e.empresa_id = c.empresa_id
    WHERE c.activo AND c.fecha_fin IS NOT NULL
      AND c.fecha_fin BETWEEN ${hoy}::date AND (${hoy}::date + 30)
      AND e.estado = 'activo'`)
  const contratos: ContratoVencible[] = rows.map(r => ({ contratoId: r.id, empresaId: r.empresa_id, empleadoId: r.empleado_id, fechaFin: r.fecha_fin }))
  let creados = 0
  let repetidos = 0
  for (const a of avisosDeHoy(contratos, hoy)) {
    const t = textoAvisoVencimiento({ fechaFin: a.fechaFin, dias: a.dias })
    const ins = await prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
      INSERT INTO rrhh.avisos (empresa_id, empleado_id, tipo, titulo, cuerpo, creado_por, clave_idempotencia)
      VALUES (${a.empresaId}::uuid, ${a.empleadoId}::uuid, 'vencimiento_contrato', ${t.titulo}, ${t.cuerpo}, 'cron', ${a.clave})
      ON CONFLICT (empresa_id, clave_idempotencia) WHERE clave_idempotencia IS NOT NULL DO NOTHING
      RETURNING id`)
    if (ins[0]) creados++
    else repetidos++
  }
  return { revisados: contratos.length, creados, repetidos }
}
