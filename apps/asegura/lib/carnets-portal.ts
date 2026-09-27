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
 * `fichaPropiaDe()` (de `contacto-portal.ts`) resuelve la ficha por
 * `portal_vinculo`: esta puerta tampoco acepta `clienteId`.
 */
import { caducidadCarnet } from '@central/module-seguros'

import { prismaAsegura } from './asegura-db'
import { descifrarCampo } from './cartera-edicion'
import { fichaPropiaDe } from './contacto-portal'

export type CarnetPortal = { id: string; tipo: string; fechaCaducidad: string }

export type ResultadoCarnetsPortal =
  | { estado: 'ok'; carnets: CarnetPortal[] }
  | { estado: 'sin_ficha' }
  | { estado: 'varias_fichas' }
  | { estado: 'error'; causa: string }

/**
 * Los carnés de la ficha vinculada a esa identidad, con su próxima caducidad ya
 * calculada. Un carné cuya fecha de expedición no se puede descifrar se OMITE
 * (se avisa en el log): es un dato ilegible de ESE carné, no motivo para negar
 * los demás. Si lo que no se puede leer es la fecha de nacimiento, no se puede
 * calcular NINGUNO con garantías (la edad decide el tramo de 10/5/3 años) y se
 * devuelve `error`, nunca una lista a medias que finja estar completa.
 */
export async function caducidadesCarnetDeIdentidad(
  correduriaId: string,
  identidadId: string,
): Promise<ResultadoCarnetsPortal> {
  const ficha = await fichaPropiaDe(correduriaId, identidadId)
  if (ficha.estado !== 'ok') return ficha

  try {
    const [cliente, filas] = await Promise.all([
      prismaAsegura().cliente.findFirst({
        where: { id: ficha.clienteId, correduriaId, mergedIntoClienteId: null },
        select: { fechaNacimiento: true },
      }),
      prismaAsegura().clienteCarnetConducir.findMany({
        where: { clienteId: ficha.clienteId, correduriaId },
        select: { id: true, tipo: true, fechaCarnet: true },
      }),
    ])
    if (!cliente) return { estado: 'sin_ficha' }
    if (filas.length === 0) return { estado: 'ok', carnets: [] }

    const fechaNacimiento = descifrarCampo(cliente.fechaNacimiento)
    if (fechaNacimiento === null) {
      console.error(`[carnets-portal] fecha de nacimiento ilegible para el cliente ${ficha.clienteId}`)
      return { estado: 'error', causa: 'fecha_nacimiento_ilegible' }
    }

    const carnets: CarnetPortal[] = []
    for (const f of filas) {
      const fechaCarnet = descifrarCampo(f.fechaCarnet)
      if (fechaCarnet === null) {
        console.warn(`[carnets-portal] fecha de carné ilegible en la fila ${f.id}; se omite`)
        continue
      }
      const r = caducidadCarnet({ fechaCarnet, fechaNacimiento, tipo: f.tipo })
      if (r === null) continue
      carnets.push({ id: f.id, tipo: f.tipo, fechaCaducidad: r.fechaCaducidad })
    }
    return { estado: 'ok', carnets }
  } catch (e) {
    console.error('[carnets-portal] no se pudo leer la ficha:', e instanceof Error ? e.message : e)
    return { estado: 'error', causa: 'ficha_ilegible' }
  }
}
