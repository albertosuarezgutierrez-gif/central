import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { getPlantilla, listarPlantillas, type DatosPlantilla } from '@central/legal-templates'
import { subirDocumento } from '@/lib/documental'
import { ACTOR_GESTOR } from '@/lib/carpetas'
import { textoConvenio } from '@/lib/empresa'

export { listarPlantillas }

/**
 * El gestor genera un documento legal desde una plantilla versionada y lo añade al expediente del
 * empleado (queda listo para "Solicitar firma"). Se rellena con los datos de empresa/trabajador.
 */
export async function generarDesdePlantilla(empresaId: string, empleadoId: string, plantillaId: string) {
  const p = getPlantilla(plantillaId)
  if (!p) throw new Error('Plantilla no encontrada')
  const rows = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT e.nombre, e.dni, emp.nombre AS empresa, emp.convenio_codigo, emp.convenio_nombre
    FROM rrhh.empleados e JOIN rrhh.empresas emp ON emp.id = e.empresa_id
    WHERE e.id = ${empleadoId}::uuid AND e.empresa_id = ${empresaId}::uuid LIMIT 1`)
  if (!rows[0]) throw new Error('Empleado no encontrado')
  const datos: DatosPlantilla = {
    empresa: rows[0].empresa,
    trabajador: rows[0].nombre,
    dni: rows[0].dni,
    fecha: new Date().toLocaleDateString('es-ES'),
    convenio: textoConvenio({ convenio_codigo: rows[0].convenio_codigo, convenio_nombre: rows[0].convenio_nombre }),
  }
  const html = p.render(datos)
  const bytes = new TextEncoder().encode(html).slice().buffer as ArrayBuffer
  const nombre = `${p.titulo} v${p.version}.html`
  return subirDocumento(empresaId, empleadoId, ACTOR_GESTOR, {
    carpeta: p.carpeta, nombre, tipo: 'text/html', tamano: bytes.byteLength, bytes,
  })
}
