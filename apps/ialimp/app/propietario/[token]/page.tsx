import { redirect } from 'next/navigation'
import PropietarioClient from './PropietarioClient'
import ConsentimientoRGPD from './ConsentimientoRGPD'
import { RGPD_VERSION } from '@/lib/rgpd'
import { serialize } from '@/lib/serialize'
import { getClienteByToken, loadPortalData } from '@/lib/propietario-portal'
import BrandingStyle from '@/components/BrandingStyle'
import { brandingFrom } from '@/lib/branding'

// Acceso por enlace/token (legacy). Sigue funcionando para los enlaces ya
// enviados. La puerta de entrada nueva (email+contraseña) está en /propietario.
export default async function PropietarioPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params

  const cliente = await getClienteByToken(token)
  if (!cliente) redirect('/')

  // Gate RGPD: hasta que el cliente no autorice el tratamiento de sus datos
  // (en la versión vigente del texto) no se cargan ni se envían sus datos.
  const consentido = cliente.rgpd_aceptado === true && cliente.rgpd_version === RGPD_VERSION
  if (!consentido) {
    return (
      <ConsentimientoRGPD
        token={token}
        empresaNombre={cliente.empresa_nombre}
        empresaEmail={cliente.empresa_email}
        version={RGPD_VERSION}
      />
    )
  }

  const { propiedades, historial, permisos } = await loadPortalData(cliente)

  return (
    <BrandingStyle branding={brandingFrom(cliente)}>
      <PropietarioClient
        cliente={serialize(cliente)}
        propiedades={serialize(propiedades)}
        historial={serialize(historial)}
        token={token}
        permisos={permisos}
      />
    </BrandingStyle>
  )
}
