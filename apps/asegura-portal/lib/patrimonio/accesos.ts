// PATRIMONIO (22/10/2026) — QUIÉN ve el patrimonio de QUÉ titular. Adaptador con BD de la regla pura
// `nivelesPatrimonio` / `puede` de `@central/module-patrimonio` (`src/acceso.ts`), a imagen de `accesosFlota()`.
//
// 🚨 La frontera es UNA: toda lectura o escritura de `prisma.portalPatrimonio*` parte de
// `accesosPatrimonio(identidadId)`, resuelto desde la COOKIE (`getIdentidad()`, defensa en profundidad: si la
// sesión no es la de `identidadId`, nada) y desde `portal_vinculo` de ESA identidad. El titular, inmueble o
// contrato que llegue en la URL o el cuerpo NUNCA consulta: se busca DENTRO de lo ya resuelto
// (`titularPermitido`) y lo que no está es 404, nunca 403. Sin RLS que rescate un olvido (el rol
// `prisma_asegura_portal` no tiene BYPASSRLS ni RLS en estas tablas): una consulta sin el `titularId`
// autorizado devuelve el patrimonio de cualquiera y no falla nada. Cepo:
// `test/regression-portal-patrimonio-aislamiento.test.ts`.
//
// Lo que el puro NO puede saber y por eso se decide AQUÍ (hallazgo de revisión del paso 2: el puro da `total`
// a toda ficha que reciba en `vinculadas`):
//  1. Solo cuentan los vínculos que dicen que esta identidad ES la persona de la ficha: nivel que opera
//     (`gestionar`/`administrar`, `puedeAutorizar`, el mismo umbral que flota y la representación). Un vínculo
//     `tarjeta`/`completo` no lo dice.
//  2. Fuera los vínculos `origen='corredor'`: son la vista TEMPORAL de Alberto mirando como el cliente
//     (`lib/vista-corredor.ts`), no una persona dueña de nada. Y una sesión de vista de corredor no abre el
//     patrimonio en absoluto (mismo efecto, por dos lados).
//  3. Esos mismos vínculos —y solo esos— alimentan el Dueño (`empresasDeFichas`) y las autorizaciones dadas
//     a una FICHA de esta identidad: lo dudoso cae FUERA (fail-closed).
//  4. `fichasVivas`: solo fichas de la cartera activas y sin fusionar. Una fusionada o dada de baja no abre
//     nada, venga de la fuente que venga.
//
// Las claves del mapa son el `cliente_id` de la ficha del titular (`portal_patrimonio_titular.cliente_id`,
// UNIQUE). Un titular ARCHIVADO (`archivado_en`) lo filtra quien lee filas de `portal_patrimonio_titular`
// (`lib/patrimonio/lectura.ts` deja el mapeo; la consulta lleva `archivadoEn: null`).
import { NIVELES, accesoPatrimonioPorModulo, puedeAutorizar, type Nivel } from '@central/module-seguros-portal'
import {
  ALCANCE_PATRIMONIO_GESTION,
  ALCANCE_PATRIMONIO_TOTAL,
  nivelesPatrimonio,
  type NivelPatrimonio,
} from '@central/module-patrimonio'

import { prisma } from '../db'
import { empresasDeFichas } from '../representacion'
import { getIdentidad } from '../session'

export type AccesosPatrimonio = Map<string, NivelPatrimonio>

/** Los dos alcances de `portal_autorizacion` que abren el patrimonio (NO están en `ALCANCES` de la bóveda). */
const ALCANCES_PATRIMONIO = [ALCANCE_PATRIMONIO_GESTION, ALCANCE_PATRIMONIO_TOTAL]

function nivelDe(v: string): Nivel {
  return (NIVELES as readonly string[]).includes(v) ? (v as Nivel) : 'tarjeta'
}

/**
 * Los titulares (por `cliente_id` de su ficha) cuyo patrimonio ve ESTA identidad, con su nivel. Vacío si la
 * sesión no es la de `identidadId` (no se confía a ciegas en el parámetro) o es una vista de corredor.
 */
export async function accesosPatrimonio(identidadId: string): Promise<AccesosPatrimonio> {
  const sesion = await getIdentidad()
  if (!sesion || sesion.id !== identidadId) return new Map()
  if (sesion.corredor) return new Map()

  // La única frontera: los vínculos de ESTA identidad.
  const vinculos = await prisma.portalVinculo.findMany({
    where: { identidadId },
    select: { clienteId: true, nivel: true, origen: true },
  })
  // Reglas 1 y 2: solo los que dicen que esta identidad ES la persona de la ficha.
  const queOperan = vinculos.filter((v) => v.origen !== 'corredor' && puedeAutorizar(nivelDe(v.nivel)))
  const propias = [...new Set(queOperan.map((v) => v.clienteId))]

  const [deDueno, autorizaciones] = await Promise.all([
    // Regla 3: el Dueño, desde los mismos vínculos filtrados.
    empresasDeFichas(queOperan),
    // Solo las que me alcanzan A MÍ: por una ficha mía (de las que operan) o por mi identidad.
    prisma.portalAutorizacion.findMany({
      where: {
        alcance: { in: ALCANCES_PATRIMONIO },
        revocadoEn: null,
        OR: [
          { autorizadoIdentidadId: identidadId },
          ...(propias.length > 0 ? [{ autorizadoClienteId: { in: propias } }] : []),
        ],
      },
      select: { otorganteClienteId: true, alcance: true, polizaId: true, aceptadoEn: true, caducaEn: true, revocadoEn: true },
    }),
  ])

  const candidatas = [...new Set([...propias, ...deDueno, ...autorizaciones.map((a) => a.otorganteClienteId)])]
  if (candidatas.length === 0) return new Map()
  // Regla 4: solo fichas VIVAS (activas y sin fusionar).
  const vivas = await prisma.cliente.findMany({
    where: { id: { in: candidatas }, mergedIntoClienteId: null, activo: true },
    select: { id: true },
  })
  const porCartera = nivelesPatrimonio({
    vinculadas: propias,
    dueno: deDueno,
    autorizaciones,
    fichasVivas: new Set(vivas.map((f) => f.id)),
    hoy: new Date(),
  })
  if (porCartera.size === 0) return porCartera
  // 25/10/2026: además de la póliza viva, el módulo `alquileres` activo de ESTA identidad (regla única, pura:
  // `accesoPatrimonioPorModulo`). Quien ya tiene inmuebles creados conserva el acceso mientras no se le retire.
  const [filas, conInmuebles] = await Promise.all([
    prisma.portalModulo
      .findMany({ where: { identidadId, modulo: 'alquileres' }, select: { modulo: true, estado: true } })
      .catch((e) => {
        console.error('[portal/patrimonio] no se pudo leer portal_modulo (acceso cerrado):', e instanceof Error ? e.message : e)
        return null
      }),
    prisma.portalPatrimonioInmueble
      .count({ where: { archivadoEn: null, titular: { clienteId: { in: [...porCartera.keys()] } } } })
      .then((n) => n > 0)
      .catch(() => null),
  ])
  const abre = accesoPatrimonioPorModulo({ titulares: porCartera.size, filas, tieneInmuebles: conInmuebles })
  return abre ? porCartera : new Map()
}

/**
 * El titular pedido (URL/cuerpo) SOLO si está dentro de los accesos ya resueltos. `null` = no existe o no es
 * suyo: la ruta contesta 404 en los dos casos, a propósito.
 */
export function titularPermitido(pedido: unknown, accesos: AccesosPatrimonio): string | null {
  if (typeof pedido !== 'string' || pedido === '') return null
  return accesos.has(pedido) ? pedido : null
}
