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
import { descifrarCampo } from './cartera-edicion'
import { agruparCarnetsPorTitular, fichasLegiblesDeCarnets, type CarnetDeFicha, type TitularCarnets } from './carnets-titulares'
import { vinculosDeIdentidad } from './contacto-portal'

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
 * Los carnés de las fichas vinculadas a esa identidad, por titular, con su próxima caducidad ya
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
