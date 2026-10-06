/**
 * Caducidades de carné de conducir de la persona detrás de una identidad del
 * portal — para el puerto ESTRECHO `GET /api/portal/carnets`.
 *
 * ─── Por qué vive aquí y no en el portal ─────────────────────────────────────
 * `cliente_carnets_conducir.fecha_carnet` y `clientes.fecha_nacimiento` van
 * CIFRADOS con `PII_ENCRYPTION_KEY`, y el rol del portal
 * (`prisma_asegura_portal`, sin BYPASSRLS) no la tiene. Esta app sí, así que
 * calcula aquí con `caducidadCarnet()` de `@central/module-seguros` y solo
 * cruza el puente el RESULTADO — tipo de carné y fecha de caducidad ya
 * calculada — nunca las dos fechas de origen. Mismo patrón que
 * `reparosDeMisDatos()`/`leerSitio()` con la dirección.
 *
 * Las fichas salen de `portal_vinculo` (`vinculosDeIdentidad()`): esta puerta
 * tampoco acepta `clienteId`. Con VARIAS fichas vinculadas ya no contesta
 * `varias_fichas`: devuelve los carnés AGRUPADOS POR TITULAR
 * (`carnets-titulares.ts`), nunca mezclados en una lista sin dueño.
 */
import { caducidadCarnet } from '@central/module-seguros'

import { prismaAsegura } from './asegura-db'
import { borrarCarnet, descifrarCampo, guardarCarnet } from './cartera-edicion'
import {
  destinoCarnet,
  resultadoDeDestinoAjeno,
  traducirResultadoCarnet,
  type OperacionCarnetPortal,
  type ResultadoCarnetPortalEscritura,
} from './carnets-portal-reglas'
import { agruparCarnetsPorTitular, fichasLegiblesDeCarnets, type CarnetDeFicha, type TitularCarnets } from './carnets-titulares'
import { vinculosDeIdentidad } from './contacto-portal'
import type { VinculoPortal } from './ficha-de-poliza'

export type { CarnetPortal, TitularCarnets } from './carnets-titulares'

/**
 * Contrato del puente (compatible con el portal anterior):
 *  - `ok`: UN titular. Lleva `carnets` (lista plana, como siempre) y además `titulares` (uno).
 *  - `varios_titulares`: más de uno. Solo `titulares`, sin lista plana: un portal antiguo no conoce este
 *    estado y lo trata como «no se ha podido mirar» (lo mismo que hacía con `varias_fichas`), en vez de
 *    pintar como «tu carné» el de otra persona.
 *  - `sin_ficha`: la identidad no tiene ninguna ficha vinculada (o ninguna existe ya).
 */
export type ResultadoCarnetsPortal =
  | { estado: 'ok'; carnets: TitularCarnets['carnets']; titulares: TitularCarnets[] }
  | { estado: 'varios_titulares'; titulares: TitularCarnets[] }
  | { estado: 'sin_ficha' }
  | { estado: 'error'; causa: string }

/**
 * Los carnés de las fichas vinculadas a esa identidad CON nivel que opera, por titular, con su próxima caducidad ya
 * calculada. Un carné cuya fecha de expedición no se puede descifrar se OMITE (se avisa en el log): es un
 * dato ilegible de ESE carné, no motivo para negar los demás. Si lo que no se puede leer es la fecha de
 * nacimiento de una ficha CON carnés, no se puede calcular ninguno de ella con garantías (la edad decide
 * el tramo de 10/5/3 años) y se devuelve `error` entero, nunca una lista a medias que finja estar completa.
 */
export async function caducidadesCarnetDeIdentidad(
  correduriaId: string,
  identidadId: string,
): Promise<ResultadoCarnetsPortal> {
  let ids: string[]
  try {
    ids = fichasLegiblesDeCarnets(await vinculosDeIdentidad(correduriaId, identidadId))
  } catch (e) {
    console.error('[carnets-portal] no se pudieron leer los vínculos:', e instanceof Error ? e.message : e)
    return { estado: 'error', causa: 'vinculos_ilegibles' }
  }
  if (ids.length === 0) return { estado: 'sin_ficha' }

  try {
    const [clientes, filas] = await Promise.all([
      prismaAsegura().cliente.findMany({
        where: { id: { in: ids }, correduriaId, mergedIntoClienteId: null },
        select: { id: true, nombre: true, apellidos: true, tipoPersona: true, fechaNacimiento: true },
      }),
      prismaAsegura().clienteCarnetConducir.findMany({
        where: { clienteId: { in: ids }, correduriaId },
        select: { id: true, clienteId: true, tipo: true, fechaCarnet: true },
      }),
    ])
    if (clientes.length === 0) return { estado: 'sin_ficha' }
    clientes.sort((a, b) => a.id.localeCompare(b.id))

    const nacimiento = new Map<string, string | null>()
    const calculados: CarnetDeFicha[] = []
    for (const f of filas) {
      const cliente = clientes.find((c) => c.id === f.clienteId)
      if (!cliente) continue // ficha fusionada o fuera de las vinculadas: no se cuelga de nadie
      if (!nacimiento.has(cliente.id)) nacimiento.set(cliente.id, descifrarCampo(cliente.fechaNacimiento))
      const fechaNacimiento = nacimiento.get(cliente.id) ?? null
      if (fechaNacimiento === null) {
        console.error(`[carnets-portal] fecha de nacimiento ilegible para el cliente ${cliente.id}`)
        return { estado: 'error', causa: 'fecha_nacimiento_ilegible' }
      }
      const fechaCarnet = descifrarCampo(f.fechaCarnet)
      if (fechaCarnet === null) {
        console.warn(`[carnets-portal] fecha de carné ilegible en la fila ${f.id}; se omite`)
        continue
      }
      const r = caducidadCarnet({ fechaCarnet, fechaNacimiento, tipo: f.tipo })
      if (r === null) continue
      calculados.push({ clienteId: f.clienteId, id: f.id, tipo: f.tipo, fechaCaducidad: r.fechaCaducidad })
    }

    const titulares = agruparCarnetsPorTitular(
      clientes.map((c) => ({
        id: c.id,
        nombre: `${c.nombre} ${c.apellidos}`.trim(),
        tipoPersona: c.tipoPersona === null ? null : String(c.tipoPersona),
      })),
      calculados,
    )
    if (titulares.length > 1) return { estado: 'varios_titulares', titulares }
    return { estado: 'ok', carnets: titulares[0]?.carnets ?? [], titulares }
  } catch (e) {
    console.error('[carnets-portal] no se pudo leer la ficha:', e instanceof Error ? e.message : e)
    return { estado: 'error', causa: 'ficha_ilegible' }
  }
}

/**
 * El CLIENTE escribe uno de sus carnés desde el portal (alta, cambio o baja). Reglas en
 * `carnets-portal-reglas.ts`; la escritura es la MISMA del corredor (`guardarCarnet`/`borrarCarnet`:
 * `revisarCarnet`, fecha cifrada, uno por tipo, `historial_interno`), con origen `portal`.
 *
 * 🚨 La ficha la propone el portal (`fichaId`) pero la DECIDE esta función contra `portal_vinculo`: solo una
 * ficha vinculada con nivel que opera. En cambio/baja el dueño del carné se lee de BD y tiene que ser esa
 * ficha; `guardarCarnet`/`borrarCarnet` vuelven a filtrar por `cliente_id`, así que esto decide la ficha,
 * no sustituye esa guarda.
 */
export async function escribirCarnetPortal(
  correduriaId: string,
  op: OperacionCarnetPortal,
): Promise<ResultadoCarnetPortalEscritura> {
  let vinculos: VinculoPortal[]
  try {
    vinculos = await vinculosDeIdentidad(correduriaId, op.identidadId)
  } catch (e) {
    console.error('[carnets-portal] no se pudieron leer los vínculos:', e instanceof Error ? e.message : e)
    return { estado: 'error', causa: 'vinculos_ilegibles' }
  }

  let duenoCarnet: string | null = null
  let tipoPersonaDestino: string | null = null
  try {
    if (op.accion === 'alta') {
      const c = await prismaAsegura().cliente.findFirst({
        where: { id: op.fichaId, correduriaId, mergedIntoClienteId: null },
        select: { tipoPersona: true },
      })
      tipoPersonaDestino = c?.tipoPersona == null ? null : String(c.tipoPersona)
    } else {
      const k = await prismaAsegura().clienteCarnetConducir.findFirst({
        where: { id: op.id, correduriaId },
        select: { clienteId: true },
      })
      duenoCarnet = k?.clienteId ?? null
    }
  } catch (e) {
    console.error('[carnets-portal] no se pudo leer el destino:', e instanceof Error ? e.message : e)
    return { estado: 'error', causa: 'destino_ilegible' }
  }

  const d = destinoCarnet({ accion: op.accion, vinculos, fichaId: op.fichaId, duenoCarnet, tipoPersonaDestino })
  if (d.estado === 'sin_ficha') return { estado: 'sin_ficha' }
  if (d.estado === 'ajena') {
    if (d.motivo !== 'sin_dueno') console.warn(`[carnets-portal] identidad ${op.identidadId}: ${op.accion} de carné rechazado (${d.motivo})`)
    return resultadoDeDestinoAjeno(d.motivo)
  }

  const origen = { origen: 'portal', identidadId: op.identidadId } as const
  const actor = 'el cliente, desde el portal'
  const r =
    op.accion === 'baja'
      ? await borrarCarnet(correduriaId, d.clienteId, { id: op.id, actor, origen })
      : await guardarCarnet(correduriaId, d.clienteId, {
          ...(op.accion === 'cambio' ? { id: op.id } : {}),
          tipo: op.tipo,
          fecha: op.fecha,
          actor,
          origen,
        })
  return traducirResultadoCarnet(r)
}
