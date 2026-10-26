import { redirect } from 'next/navigation'
import { getSesion, AuthError } from '@/lib/tenant'
import { getBranding } from '@/lib/empresa'
import { datosInicio } from '@/lib/inicio-admin'
import { tarjetasInicio } from '@/lib/inicio-admin-reglas'
import Page from '@/components/ui/Page'
import Card from '@/components/ui/Card'
import Chip, { type TonoChip } from '@/components/ui/Chip'
import Boton from '@/components/ui/Boton'

const TONO: Record<string, TonoChip> = { alerta: 'alerta', aviso: 'aviso', ok: 'ok', neutro: 'neutro' }
const ETIQUETA: Record<string, string> = { alerta: 'Atención', aviso: 'Pendiente', ok: 'Al día', neutro: 'Info' }

// Inicio del responsable (antes `/admin` daba 404): lo que espera una acción, de un vistazo. Solo lectura, con el
// `empresa_id` de la sesión y sin tablas nuevas.
export default async function Page_() {
  let empresa_id: string
  try { ({ empresa_id } = await getSesion()) } catch (e) { if (e instanceof AuthError) redirect('/login'); throw e }
  const branding = await getBranding(empresa_id)
  const tarjetas = tarjetasInicio(await datosInicio(empresa_id, branding.tiene_fichaje))
  return (
    <Page titulo="Inicio" subtitulo={branding.nombre ? `Lo pendiente en ${branding.nombre}` : 'Lo pendiente'}>
      <ul className="grid list-none grid-cols-[minmax(0,1fr)] gap-3 p-0 md:grid-cols-2">
        {tarjetas.map(t => (
          <li key={t.id}>
            <Card as="section" className="flex h-full flex-col gap-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-base">{t.titulo}</h2>
                <Chip tono={TONO[t.tono]}>{ETIQUETA[t.tono]}</Chip>
              </div>
              <p className="min-w-0 break-words text-sm text-ink-2">{t.texto}</p>
              <div className="mt-auto pt-1"><Boton href={t.href} variante={t.urgente ? 'primario' : 'secundario'}>{t.enlace}</Boton></div>
            </Card>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-sm text-ink-3">Empleados, nóminas, PRL y el resto de herramientas están en el menú.</p>
    </Page>
  )
}
