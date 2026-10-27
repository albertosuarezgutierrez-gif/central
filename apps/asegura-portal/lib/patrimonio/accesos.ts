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
  puedeAutorizarPatrimonio,
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
 * Reglas 1, 2 y 3: las fichas de las que ESTA identidad es la persona (vínculo que opera, sin la vista de corredor) y las
 * sociedades de las que es Dueño, desde esos mismos vínculos. La única frontera: `portal_vinculo` de ESTA identidad. NO mira la
 * sesión (lo hace quien llama) ni si la ficha está viva (regla 4, también de quien llama).
 */
async function titularesPropios(identidadId: string): Promise<{ propias: string[]; deDueno: string[] }> {
  // 🚨 Las MISMAS reglas 1-3 que `accesosPatrimonio` (su cepo vigila las dos copias con el mismo texto).
  const vinculos = await prisma.portalVinculo.findMany({
    where: { identidadId },
    select: { clienteId: true, nivel: true, origen: true },
  })
  const queOperan = vinculos.filter((v) => v.origen !== 'corredor' && puedeAutorizar(nivelDe(v.nivel)))
  const propias = [...new Set(queOperan.map((v) => v.clienteId))]
  const deDueno = await empresasDeFichas(queOperan)
  return { propias, deDueno: [...deDueno] }
}

/**
 * 🚨 AUTORIZAR A UN TERCERO (27/10/2026): los titulares cuyo patrimonio puede ceder ESTA identidad. Solo el propio titular o el
 * Dueño (`puedeAutorizarPatrimonio`), NUNCA por nivel: quien entra por una autorización `patrimonio_total` lo VE todo pero no
 * aparece aquí, así que no reautoriza a un cuarto. Además el titular tiene que estar abierto en `accesosPatrimonio` (misma sesión,
 * módulo activo, ficha viva). Cepo: `test/regression-portal-patrimonio-autorizar.test.ts`.
 */
export async function titularesAutorizables(identidadId: string): Promise<string[]> {
  const sesion = await getIdentidad()
  if (!sesion || sesion.id !== identidadId || sesion.corredor) return []
  const [mapa, { propias, deDueno }] = await Promise.all([accesosPatrimonio(identidadId), titularesPropios(identidadId)])
  const fuentes = { vinculadas: propias, dueno: deDueno, fichasVivas: new Set(mapa.keys()) }
  return [...mapa.keys()].filter((id) => mapa.get(id) === 'total' && puedeAutorizarPatrimonio(fuentes, id))
}

export type FichaTitular = { nombre: string | null; correduriaId: string }

/**
 * Nombre y correduría de los titulares pedidos, SOLO de los que ESTA identidad ya ve (`accesosPatrimonio`): un id que no está
 * dentro no se lee. Para pintar «el patrimonio de María» y para sellar la correduría de una invitación.
 */
export async function fichasDeTitulares(identidadId: string, pedidos: readonly string[]): Promise<Map<string, FichaTitular>> {
  const abiertos = await accesosPatrimonio(identidadId)
  const ids = [...new Set(pedidos)].filter((id) => abiertos.has(id))
  if (ids.length === 0) return new Map()
  const filas = await prisma.cliente.findMany({
    where: { id: { in: ids }, mergedIntoClienteId: null, activo: true },
    select: { id: true, nombre: true, apellidos: true, correduriaId: true },
  })
  return new Map(
    filas.map((f) => {
      const n = `${f.nombre} ${f.apellidos}`.trim()
      return [f.id, { nombre: n === '' ? null : n, correduriaId: f.correduriaId }]
    }),
  )
}

/**
 * ¿Sigue siendo `identidadId` titular de `clienteId`? SIN sesión a propósito: lo pregunta la ACEPTACIÓN de una invitación, que
 * hace OTRA persona (el invitado) cuando quien invitó ya no está mirando. Si María perdió el vínculo entre invitar y que José
 * acepte, la invitación ya no abre nada (fail-closed).
 */
export async function esTitularPatrimonio(identidadId: string, clienteId: string): Promise<boolean> {
  const { propias, deDueno } = await titularesPropios(identidadId)
  if (!propias.includes(clienteId) && !deDueno.includes(clienteId)) return false
  const viva = await prisma.cliente.findFirst({
    where: { id: clienteId, mergedIntoClienteId: null, activo: true },
    select: { id: true },
  })
  return puedeAutorizarPatrimonio(
    { vinculadas: propias, dueno: deDueno, fichasVivas: new Set(viva ? [viva.id] : []) },
    clienteId,
  )
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
