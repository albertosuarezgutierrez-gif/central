import { redirect } from 'next/navigation'

import { nombreDePila } from '@central/module-seguros'

import { resumenInicio } from '@/lib/inicio'
import { getIdentidad } from '@/lib/session'

import { HuecosProteccion } from '../boveda/HuecosProteccion'
import { PaginaPortal } from '../../PaginaPortal'
import { PendienteInicio } from './PendienteInicio'

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
      />
    </PaginaPortal>
  )
}
