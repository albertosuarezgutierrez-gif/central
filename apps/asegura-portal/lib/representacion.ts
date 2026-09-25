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
import { empresasDelDueno, NIVELES, puedeAutorizar, RELACION_DUENO, type FichaDueno, type Nivel } from '@central/module-seguros-portal'

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

/**
 * Las EMPRESAS de las que son dueñas estas fichas (25/09/2026). Ver la cabecera de
 * `dueno-empresa.ts` del módulo: solo `Dueño`, la empresa tiene que ser jurídica explícita, viva y
 * de la MISMA correduría que la ficha del dueño.
 *
 * 🚨 Recibe las fichas YA resueltas por quien llama (`portal_vinculo` filtrado por la identidadId de
 * la sesión, o por la del cron) y NO llama a `getIdentidad()`: la usa también el cron de avisos, que
 * corre sin cookie. No escribe nada: el acceso se deriva en cada lectura, y por eso desaparece en
 * cuanto Alberto borra la relación.
 */
/** `nivel` es `text` con CHECK en la BD. Un valor fuera del vocabulario cae al nivel MÁS bajo. */
function nivelDeVinculo(v: string): Nivel {
  return (NIVELES as readonly string[]).includes(v) ? (v as Nivel) : 'tarjeta'
}

export async function empresasDeFichas(
  fichas: readonly { clienteId: string; nivel: string }[],
): Promise<string[]> {
  // Mismo umbral que para autorizar (`gestionar`/`administrar`): la bóveda y /autorizaciones
  // deciden con UNA regla quién es dueño (revisión #3616).
  const misFichas = fichas.filter((f) => puedeAutorizar(nivelDeVinculo(f.nivel))).map((f) => f.clienteId)
  if (misFichas.length === 0) return []
  const relaciones = await prisma.clienteRelacion.findMany({
    where: {
      tipoRelacion: RELACION_DUENO,
      OR: [{ clienteAId: { in: misFichas } }, { clienteBId: { in: misFichas } }],
    },
    select: { clienteAId: true, clienteBId: true, tipoRelacion: true },
  })
  if (relaciones.length === 0) return []
  const ids = [...new Set(relaciones.flatMap((r) => [r.clienteAId, r.clienteBId]))]
  // Solo fichas VIVAS entran en el mapa: una fusionada o inactiva (la propia o la empresa) no abre
  // nada. La correduría se compara por PAR (dueño↔empresa) dentro de `empresasDelDueno`.
  const filas = await prisma.cliente.findMany({
    where: { id: { in: ids }, mergedIntoClienteId: null, activo: true },
    select: { id: true, tipoPersona: true, correduriaId: true },
  })
  const fichaPor = new Map<string, FichaDueno>(
    filas.map((f) => [
      f.id,
      {
        tipo: f.tipoPersona === 'juridica' ? 'juridica' : f.tipoPersona === 'fisica' ? 'fisica' : null,
        correduriaId: f.correduriaId,
      },
    ]),
  )
  return empresasDelDueno(misFichas, relaciones, fichaPor)
}
