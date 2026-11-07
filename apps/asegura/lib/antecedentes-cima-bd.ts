// Antecedentes de siniestralidad que trae CIMA para el riesgo de auto/moto (07/11/2026). Lectura: solo SELECT.
//
// Regla: solo vale si el cliente tiene historial CIMA = al menos UNA póliza de auto/moto en cartera EN VIGOR
// (`sqlCarteraEnVigor`). Sin ella → `null` (no se sabe; el bot sigue con su supuesto, marcado como supuesto). Con ella, los
// siniestros son los `origen='cima'` (sin fusionar) de las pólizas de auto/moto VIVAS del cliente (también las ya canceladas:
// su siniestralidad cuenta), y el recuento lo hace el helper PURO `siniestrosConCulpaCima` (referencias distintas, ventana de
// 5 años, `null` si algo no se puede afirmar). Un fallo de lectura es `null`, nunca 0.
import { prisma } from '@/lib/tenant'
import { Prisma } from '@prisma/client'
import { siniestrosConCulpaCima, sqlCarteraEnVigor, sqlCarteraViva, type FilaSiniestroCima } from '@central/module-seguros'

export async function siniestrosCimaDeCliente(correduriaId: string, clienteId: string, hoy: Date = new Date()): Promise<number | null> {
  try {
    const [v] = await prisma.$queryRaw<Array<{ n: number }>>`
      select count(*)::int as n from seguros.polizas p
      where p.correduria_id = ${correduriaId}::uuid and p.cliente_id = ${clienteId}::uuid
        and p.tipo::text in ('auto', 'moto') and ${Prisma.raw(sqlCarteraEnVigor('p'))}`
    if (!v || v.n === 0) return null
    const filas = await prisma.$queryRaw<Array<{
      idSiniestroEntidad: string | null; referencia: string | null; tipo: string | null; codigoEntidadDgs: string | null
      posicionCima: string | null; responsabilidadCima: string | null; fechaHora: Date | null
    }>>`
      select s.id_siniestro_entidad as "idSiniestroEntidad", s.referencia, s.tipo, s.codigo_entidad_dgs as "codigoEntidadDgs",
             s.posicion_cima as "posicionCima", s.responsabilidad_cima as "responsabilidadCima", s.fecha_hora as "fechaHora"
      from seguros.siniestros s
      join seguros.polizas p on p.id = s.poliza_id and p.correduria_id = s.correduria_id
      where s.correduria_id = ${correduriaId}::uuid and p.cliente_id = ${clienteId}::uuid
        and s.origen::text = 'cima' and s.fusionado_en_siniestro_id is null
        and p.tipo::text in ('auto', 'moto') and ${Prisma.raw(sqlCarteraViva('p'))}`
    return siniestrosConCulpaCima(filas as FilaSiniestroCima[], hoy)
  } catch (err) {
    console.error('[antecedentes-cima] sin leer:', err instanceof Error ? err.message : err)
    return null
  }
}
