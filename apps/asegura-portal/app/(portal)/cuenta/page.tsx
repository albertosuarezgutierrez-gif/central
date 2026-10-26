import Link from 'next/link'
import { redirect } from 'next/navigation'

import { menuDeSesion } from '@/lib/menu-portal'
import { getIdentidad } from '@/lib/session'

import { PaginaPortal } from '../../PaginaPortal'
import { TarjetaPortal } from '../../TarjetaPortal'

export const dynamic = 'force-dynamic'

/**
 * «Cuenta» (26/10/2026, menú de cinco): lo que es de la PERSONA y no de sus seguros. Datos de contacto (que siguen
 * viviendo en `/boveda?vista=datos`, con su derecho de supresión), Configuración (avisos y consentimientos, `/configuracion`).
 * «Llamar» y «Salir» no se repiten aquí: ya están en el cajón de «Más» (móvil), en el lateral y en la cabecera (escritorio). Solo enlaza: no lee datos.
 */
export default async function CuentaPage() {
  const identidad = await getIdentidad()
  if (!identidad) redirect('/')
  // «Contactos» no está en el menú de quien solo tiene accesos que le han dado (`menuDeSesion`): se ofrece aquí, para que
  // nadie se quede sin forma de ver —o dejar— un acceso. Solo visibilidad: la ruta `/autorizaciones` no cambia.
  const menu = await menuDeSesion().catch(() => null)

  return (
    <PaginaPortal antetitulo="Cuenta" titulo="Mi" acento="cuenta">
      <p className="suave" style={{ marginTop: 0 }}>Tus datos, tus avisos y tu sesión.</p>

      <ul className="rejilla-portal">
        <li>
          <TarjetaPortal
            id="cuenta-datos"
            antetitulo="Tú"
            titulo="Mis datos"
            accion={<Link className="boton" href="/boveda?vista=datos">Ver y cambiar mis datos</Link>}
          >
            <p style={{ marginTop: 0 }}>Tu teléfono, tu correo y tu dirección de contacto, y tu derecho a que borremos tus datos.</p>
          </TarjetaPortal>
        </li>
        <li>
          <TarjetaPortal
            id="cuenta-config"
            antetitulo="Avisos"
            titulo="Configuración"
            accion={<Link className="boton" href="/configuracion">Abrir la configuración</Link>}
          >
            <p style={{ marginTop: 0 }}>Cómo y cuándo te avisamos, y lo que nos has autorizado.</p>
          </TarjetaPortal>
        </li>
        {menu?.contactosEnCuenta && (
          <li>
            <TarjetaPortal
              id="cuenta-contactos"
              antetitulo="Accesos"
              titulo="Quién ve qué"
              accion={<Link className="boton" href="/autorizaciones">Ver los accesos</Link>}
            >
              <p style={{ marginTop: 0 }}>Los seguros que otras personas te han dejado ver, y cómo dejar de verlos.</p>
            </TarjetaPortal>
          </li>
        )}
      </ul>
    </PaginaPortal>
  )
}
