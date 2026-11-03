// «Pendiente de ti» de INICIO (27/10/2026): la LECTURA de lo que antes pintaba `/boveda` (firmas de anulación, presupuestos,
// confirmar el contacto, patrimonio). La regla es `pendientesDeTiEnInicio` (`lib/pendiente-de-ti.ts`, pura y con test).
//
// 🔒 La identidad sale de la COOKIE: si la sesión no es la de `identidadId`, `null`. LEER NO ESCRIBE.
// 🚨 Cada fuente por separado (`allSettled`): la que falla queda en `null` y la regla la manda a `sinComprobar` («no hemos
// podido comprobar…»), nunca «nada pendiente». Un fallo NO tumba Inicio. Sin N+1: una lectura por fuente; el único bucle es
// `datosParaContratar` por presupuesto ACEPTADO (0-2 en la práctica), en paralelo, como hacía la bóveda.
import { ETIQUETA_RAMO } from '@central/module-seguros-portal'

import { anulacionesPendientes } from './anulacion-firma'
import { datosParaContratar } from './datos-emision'
import { leerMisDatos } from './mis-datos'
import { patrimonioParaPendientes } from './patrimonio/pendiente-bd'
import { pendientesDeTiEnInicio, type PendientesDeTi } from './pendiente-de-ti'
import { presupuestosPendientesDeIdentidad } from './presupuesto'
import { getIdentidad } from './session'

const RAMO: Record<string, string> = ETIQUETA_RAMO

function ok<T>(r: PromiseSettledResult<T>, fuente: string): T | null {
  if (r.status === 'fulfilled') return r.value
  console.error(`[portal/inicio] «pendiente de ti» · ${fuente} sin comprobar:`, r.reason instanceof Error ? r.reason.message : r.reason)
  return null
}

/** `conPatrimonio`: solo si la sesión tiene la puerta de Patrimonio abierta (si no, no se lee). `null` = no hay sesión. */
export async function pendientesDeTiParaInicio(identidadId: string, conPatrimonio: boolean): Promise<PendientesDeTi | null> {
  const sesion = await getIdentidad()
  if (!sesion || sesion.id !== identidadId) return null

  const [rFirmas, rPresupuestos, rContacto, rPatrimonio] = await Promise.allSettled([
    anulacionesPendientes(identidadId),
    presupuestosPendientesDeIdentidad(identidadId).then((vivos) =>
      vivos === null
        ? null
        : Promise.all(
            vivos.map(async (p) => {
              if (!p.aceptado) return { ...p, faltan: null }
              const d = await datosParaContratar(identidadId, p.id).catch(() => null)
              return { ...p, faltan: d?.estado === 'ok' ? d.faltanCliente : null }
            }),
          ),
    ),
    leerMisDatos(identidadId),
    conPatrimonio ? patrimonioParaPendientes(identidadId) : Promise.resolve(undefined),
  ])

  const firmas = ok(rFirmas, 'firmas')
  const contacto = ok(rContacto, 'contacto')
  return pendientesDeTiEnInicio(
    {
      anulaciones: firmas === null ? null : firmas.anulaciones.length,
      presupuestos: ok(rPresupuestos, 'presupuestos'),
      contactoPorConfirmar:
        contacto === null
          ? null
          : contacto.estado === 'ok'
            ? contacto.confirmacion !== 'vigente'
            : contacto.estado === 'sin_ficha' || contacto.estado === 'varias_fichas'
              ? false
              : null,
      patrimonio: ok(rPatrimonio, 'patrimonio'),
    },
    (r) => (RAMO[r] ?? r).toLowerCase(),
  )
}
