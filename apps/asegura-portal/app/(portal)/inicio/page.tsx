import { redirect } from 'next/navigation'

import { nombreDePila } from '@central/module-seguros'

import { resumenInicio } from '@/lib/inicio'
import { patrimonioParaInicio } from '@/lib/patrimonio/gastos-bd'
import { puertaDeSesion } from '@/lib/puertas-portal'
import { getIdentidad } from '@/lib/session'

import { HuecosProteccion } from '../boveda/HuecosProteccion'
import { PaginaPortal } from '../../PaginaPortal'
import { PendienteInicio } from './PendienteInicio'
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
  const patrimonio = (await puertaDeSesion('patrimonio', 'lectura')) ? await patrimonioParaInicio(identidad.id).catch(() => null) : undefined

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
        huecos={r.sugerencia ? <HuecosProteccion huecos={r.sugerencia.huecos} estado={r.sugerencia.estado} /> : null}
        // Hay gastos por confirmar (o no se sabe): el «Todo al día» sería falso.
        patrimonioPendiente={patrimonio !== undefined && (patrimonio === null || patrimonio.pendientes !== 0)}
      />
      {patrimonio !== undefined && (
        <ul className="rejilla-portal"><li><TarjetaPatrimonio resumen={patrimonio} /></li></ul>
      )}
    </PaginaPortal>
  )
}
