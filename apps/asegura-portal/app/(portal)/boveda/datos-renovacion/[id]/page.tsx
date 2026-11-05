import Link from 'next/link'
import { redirect } from 'next/navigation'

import { PaginaPortal } from '@/app/PaginaPortal'
import { TarjetaPortal } from '@/app/TarjetaPortal'
import Formulario from '@/app/datos/[token]/Formulario'
import { leerDatosRenovacion } from '@/lib/datos-renovacion'

export const dynamic = 'force-dynamic'

/**
 * «Estamos revisando la renovación de tu seguro de hogar; necesitamos unos datos» (05/11/2026, Alberto). CON sesión: quién la
 * ve y la contesta lo decide asegura con la regla única (tomador con nivel de operar, o quien él autoriza con Gestión/Total
 * sobre esa póliza). El id de la URL solo dice QUÉ solicitud; cualquier otra persona ve «no encontrada» (404, nunca 403: no es
 * un oráculo de la cartera). Solo se piden datos de la vivienda: nada se enseña de la ficha (ni DNI ni dirección guardada).
 * Contestar no contrata ni emite nada.
 */
export default async function DatosRenovacionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const s = await leerDatosRenovacion(id)
  if (s.estado === 'sin_sesion') redirect('/')

  return (
    <PaginaPortal antetitulo="Tu renovación" titulo="Necesitamos unos" acento="datos">
      {s.estado === 'ok' && (
        <TarjetaPortal titulo="Estamos revisando la renovación de tu seguro de hogar">
          <p className="suave" style={{ marginTop: 0 }}>
            {s.papel === 'autorizado'
              ? 'Te lo pedimos porque la persona que tiene el seguro te ha dado acceso para gestionarlo. Son unas pocas preguntas sobre la vivienda para buscarle el mejor precio; lo que no sepas, márcalo.'
              : 'Son unas pocas preguntas sobre la vivienda para buscarte el mejor precio. Te lleva un minuto; lo que no sepas, márcalo.'}
          </p>
          <Formulario token="" campos={s.campos} ramo={s.ramo} modo={{ tipo: 'app', solicitudId: id }} />
        </TarjetaPortal>
      )}
      {s.estado === 'completada' && (
        <TarjetaPortal titulo="¡Recibido!">
          <p style={{ marginTop: 0 }}>Ya tenemos los datos. Te avisamos en cuanto tengamos el precio de la renovación.</p>
          <p style={{ margin: 0 }}><Link href="/inicio">Volver al inicio</Link></p>
        </TarjetaPortal>
      )}
      {s.estado === 'muerta' && (
        <TarjetaPortal titulo="Esta solicitud ya no está abierta">
          <p style={{ marginTop: 0 }}>Ha caducado. Si hace falta algo más, te lo pedimos de nuevo.</p>
        </TarjetaPortal>
      )}
      {s.estado === 'no_encontrada' && (
        <TarjetaPortal titulo="No encontramos esta solicitud">
          <p style={{ marginTop: 0 }}>No existe o no es de esta cuenta. Si crees que es un error, escríbenos.</p>
          <p style={{ margin: 0 }}><Link href="/inicio">Volver al inicio</Link></p>
        </TarjetaPortal>
      )}
      {s.estado === 'error' && (
        <TarjetaPortal titulo="No hemos podido abrir la solicitud" tono="aviso">
          <p style={{ marginTop: 0 }}>Es un fallo nuestro, no de tu cuenta. Vuelve a probar en un rato.</p>
        </TarjetaPortal>
      )}
    </PaginaPortal>
  )
}
