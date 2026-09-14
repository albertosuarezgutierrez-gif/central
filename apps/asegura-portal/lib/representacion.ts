// Representación societaria (12/09/2026) — decisión de Alberto: «Dueño y
// Administración, empieza a implementar».
//
// La figura que puede actuar en nombre de una empresa es el vínculo YA
// existente en `cliente_relaciones` con tipo `Dueño` o `Administración` hacia
// esa ficha — dato que Alberto ya mantiene desde `/correduria` → Contactos
// (así está cargado, p. ej., Manuel Antonio → GLOBAL 2). No hace falta ningún
// `portal_vinculo` propio a la ficha de la empresa: basta la sesión personal
// ya vinculada (a SU ficha) + esta relación.
//
// 🚨 Esto NO es `APODERAMIENTO` de verdad (ver `autorizacion.ts` del módulo
// puro): solo se usa para decidir si alguien puede invitar EN NOMBRE de una
// empresa, y `ALCANCES_INVITACION` (`ver`/`ver_economico`/`ninguno`) ya
// excluye `partes`/`documentos` para TODAS las invitaciones, sea cual sea el
// otorgante — así que este helper nunca amplía lo que se puede compartir, solo
// dice QUIÉN puede compartirlo.
//
// Los demás tipos del vocabulario (`Empleado/a`, `Socio/a`, `Accionista`) NO
// dan esta capacidad: gestionan el negocio o son dueños de participaciones,
// pero no son la figura que decide a quién se le enseña qué.
import { prisma } from './db'
import { getIdentidad } from './session'

const TIPOS_REPRESENTACION = ['Dueño', 'Administración'] as const

/**
 * ¿Puede esta identidad actuar como apoderado de `empresaClienteId`?
 *
 * Se mira en las DOS direcciones de la relación a propósito — el convenio del
 * repo es «fila A→B = B es <tipo> de A», pero el volcado no siempre lo
 * respeta (ver el aviso de `apps/asegura/CLAUDE.md` sobre `cartera-relaciones.ts`
 * y el caso de Studium) — así que se comprueba el tipo tal cual se escribió,
 * sin asumir en qué sentido quedó la fila.
 */
export async function esRepresentanteDe(identidadId: string, empresaClienteId: string): Promise<boolean> {
  // Defensa en profundidad: aunque el llamador ya resolvió `identidadId` por
  // sesión (`lib/invitaciones.ts`), este fichero no confía a ciegas en el
  // parámetro — vuelve a comprobar contra la cookie antes de tocar la BD.
  const sesion = await getIdentidad()
  if (!sesion || sesion.id !== identidadId) return false

  const vinculos = await prisma.portalVinculo.findMany({
    where: { identidadId },
    select: { clienteId: true },
  })
  const misFichas = vinculos.map((v) => v.clienteId)
  if (misFichas.length === 0) return false

  const relaciones = await prisma.clienteRelacion.findMany({
    where: {
      OR: [
        { clienteAId: { in: misFichas }, clienteBId: empresaClienteId },
        { clienteAId: empresaClienteId, clienteBId: { in: misFichas } },
      ],
    },
    select: { tipoRelacion: true },
  })
  return relaciones.some((r) => (TIPOS_REPRESENTACION as readonly string[]).includes(r.tipoRelacion))
}
