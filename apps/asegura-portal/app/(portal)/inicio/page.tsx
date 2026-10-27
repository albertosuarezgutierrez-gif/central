import { redirect } from 'next/navigation'

import { nombreDePila } from '@central/module-seguros'

import { flotaParaInicio } from '@/lib/flota'
import { flotaImpideTodoAlDia } from '@/lib/flota-inicio'
import { resumenInicio } from '@/lib/inicio'
import { pendientesDeTiParaInicio } from '@/lib/inicio-extra'
import { patrimonioParaInicio } from '@/lib/patrimonio/gastos-bd'
import { puertaDeSesion } from '@/lib/puertas-portal'
import { getIdentidad } from '@/lib/session'

import { HuecosProteccion } from '../boveda/HuecosProteccion'
import { PaginaPortal } from '../../PaginaPortal'
import { PendienteInicio } from './PendienteInicio'
import { TarjetaFlota } from './TarjetaFlota'
import { TarjetaPatrimonio } from './TarjetaPatrimonio'

// Lee la cookie: nunca estática (si se cachease, todos verían el Inicio del primero).
export const dynamic = 'force-dynamic'

/**
 * «Inicio» (26/10/2026, decisión de Alberto): SOLO lo pendiente. Vencimientos, recibos pendientes, avisos, huecos de
 * protección y siniestros abiertos; nada más. Ya NO lleva la lista de seguros por familia (vive en «Seguros», con las
 * familias como chips) ni el bloque de herramientas (vive en «Herramientas»); `HuecosProteccion` está aquí y en ningún
 * otro sitio. Si no hay nada pendiente, un estado vacío amable con un acceso a Seguros.
 *
 * Cada fuente se lee aparte (`lib/inicio.ts`): la que falla dice «no hemos podido comprobarlo» y las demás se pintan.
 * Ningún vacío se dice como «no tienes» sobre algo que no se ha mirado.
 */
export default async function InicioPage() {
  const identidad = await getIdentidad()
  if (!identidad) redirect('/')
  const r = await resumenInicio(identidad.id)
  if (r === null) redirect('/')

  // El nombre sale de la IDENTIDAD; si duda, sin nombre (nunca «Hola, cliente»).
  // «Mi patrimonio» (27/10/2026): solo con acceso a Patrimonio. `undefined` = sin patrimonio (no se pinta); `null` = no se pudo
  // leer (se dice, no se afirma «0 pendientes»).
  const conPatrimonio = await puertaDeSesion('patrimonio', 'lectura')
  const conFlota = await puertaDeSesion('flota', 'lectura')
  // Las tres lecturas EN PARALELO (cada una con su `.catch`: una caída NO tumba Inicio, queda en `null` = «no hemos podido
  // comprobar»). `undefined` = esa tarjeta no se ofrece (sin patrimonio / sin flota ni nombramientos).
  // «Pendiente de ti» (27/10/2026) = lo que antes pintaba la bóveda (firmas, presupuestos, contacto, patrimonio).
  const [patrimonio, deTi, flota] = await Promise.all([
    conPatrimonio ? patrimonioParaInicio(identidad.id).catch(() => null) : Promise.resolve(undefined),
    pendientesDeTiParaInicio(identidad.id, conPatrimonio).catch(() => null),
    conFlota ? flotaParaInicio(identidad.id).catch(() => null) : Promise.resolve(undefined),
  ])

  const pila = nombreDePila(identidad.nombre)

  return (
    <PaginaPortal
      antetitulo="Inicio"
      titulo="Lo que está"
      acento="pendiente"
      saludo={pila ? `Hola, ${pila}` : undefined}
    >
      <PendienteInicio
        pendiente={r.pendiente}
        deTi={deTi}
        huecos={r.sugerencia ? <HuecosProteccion huecos={r.sugerencia.huecos} estado={r.sugerencia.estado} /> : null}
        // Hay algo pendiente (o sin comprobar) en las tarjetas de patrimonio o de flota: el «Todo al día» sería falso.
        tarjetasPendientes={(patrimonio !== undefined && (patrimonio === null || patrimonio.pendientes !== 0)) || flotaImpideTodoAlDia(flota)}
      />
      {(patrimonio !== undefined || flota !== undefined) && (
        <ul className="rejilla-portal">
          {patrimonio !== undefined && <li><TarjetaPatrimonio resumen={patrimonio} /></li>}
          {flota !== undefined && <li><TarjetaFlota entrada={flota} /></li>}
        </ul>
      )}
    </PaginaPortal>
  )
}
