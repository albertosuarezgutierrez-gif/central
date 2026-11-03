import { redirect } from 'next/navigation'
import { getSesion, AuthError } from '@/lib/tenant'
import { getBranding } from '@/lib/empresa'
import { datosInicio } from '@/lib/inicio-admin'
import { tarjetasInicio } from '@/lib/inicio-admin-reglas'
import InicioAdmin from '@/components/InicioAdmin'

// Inicio del responsable (antes `/admin` daba 404): lo que espera una acción, de un vistazo. Solo lectura, con el
// `empresa_id` de la sesión y sin tablas nuevas. La presentación vive en `components/InicioAdmin`.
export default async function Page_() {
  let empresa_id: string
  try { ({ empresa_id } = await getSesion()) } catch (e) { if (e instanceof AuthError) redirect('/login'); throw e }
  const branding = await getBranding(empresa_id)
  const tarjetas = tarjetasInicio(await datosInicio(empresa_id, branding.tiene_fichaje))
  return <InicioAdmin nombreEmpresa={branding.nombre} tarjetas={tarjetas} />
}
