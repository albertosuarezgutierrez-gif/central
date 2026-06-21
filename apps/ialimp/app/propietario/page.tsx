import { serialize } from '@/lib/serialize'
import PropietarioClient from './[token]/PropietarioClient'
import ConsentimientoRGPD from './[token]/ConsentimientoRGPD'
import { RGPD_VERSION } from '@/lib/rgpd'
import PropietarioLogin from './PropietarioLogin'
import PropietarioLogoutButton from './PropietarioLogoutButton'
import { getPropietarioSession } from '@/lib/propietario-auth'
import { getClienteById, loadPortalData } from '@/lib/propietario-portal'
import BrandingStyle from '@/components/BrandingStyle'
import { brandingFrom } from '@/lib/branding'

// URL fija del propietario: app.ialimp.es/propietario
//  - sin sesión  → formulario de login (email+contraseña) / crear cuenta
//  - con sesión  → su portal de siempre (el token queda interno, no se ve)
export const dynamic = 'force-dynamic'

export default async function PropietarioHome() {
  const session = await getPropietarioSession()
  if (!session?.cliente_id) return <PropietarioLogin />

  const cliente = await getClienteById(session.cliente_id)
  // Sesión válida pero el cliente ya no existe / sin token interno → relogin
  if (!cliente || !cliente.access_token) return <PropietarioLogin />

  // Gate RGPD: igual que en el acceso por token, no se cargan datos hasta
  // que el cliente acepta el tratamiento en la versión vigente.
  const consentido = cliente.rgpd_aceptado === true && cliente.rgpd_version === RGPD_VERSION
  if (!consentido) {
    return (
      <>
        <PropietarioLogoutButton nombre={cliente.nombre} />
        <ConsentimientoRGPD
          token={cliente.access_token}
          empresaNombre={cliente.empresa_nombre}
          empresaEmail={cliente.empresa_email}
          version={RGPD_VERSION}
        />
      </>
    )
  }

  const { propiedades, historial, permisos } = await loadPortalData(cliente)

  // El botón de cerrar sesión va DENTRO del menú hamburguesa del portal
  // (sesionPropia), no flotante: así no tapa los controles de la cabecera.
  return (
    <BrandingStyle branding={brandingFrom(cliente)}>
      <PropietarioClient
        cliente={serialize(cliente)}
        propiedades={serialize(propiedades)}
        historial={serialize(historial)}
        token={cliente.access_token}
        permisos={permisos}
        sesionPropia
      />
    </BrandingStyle>
  )
}
