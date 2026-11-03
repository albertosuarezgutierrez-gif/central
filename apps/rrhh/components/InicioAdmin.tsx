import Page from '@/components/ui/Page'
import Card from '@/components/ui/Card'
import Chip, { type TonoChip } from '@/components/ui/Chip'
import Boton from '@/components/ui/Boton'
import type { Tarjeta } from '@/lib/inicio-admin-reglas'

const TONO: Record<string, TonoChip> = { alerta: 'alerta', aviso: 'aviso', ok: 'ok', neutro: 'neutro' }
const ETIQUETA: Record<string, string> = { alerta: 'Atención', aviso: 'Pendiente', ok: 'Al día', neutro: 'Info' }
// Franja izquierda por tono: se lee de un vistazo qué pide acción sin pintar la tarjeta entera.
const FRANJA: Record<string, string> = { alerta: 'border-l-alert', aviso: 'border-l-warn', ok: 'border-l-ok', neutro: 'border-l-line-2' }
// Trazos SVG por tarjeta (decorativos).
const ICONO: Record<string, string> = {
  solicitudes: 'M22 12h-6l-2 3h-4l-2-3H2M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11',
  firmas: 'M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z',
  correos: 'M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2M22 6l-10 7L2 6',
  fichajes: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20M12 6v6l4 2',
}

/** Inicio del responsable (presentacional): las tarjetas de pendientes ya calculadas por `tarjetasInicio`. */
export default function InicioAdmin({ nombreEmpresa, tarjetas }: { nombreEmpresa: string; tarjetas: Tarjeta[] }) {
  return (
    <Page titulo="Inicio" subtitulo={nombreEmpresa ? `Lo pendiente en ${nombreEmpresa}` : 'Lo pendiente'}>
      <ul className="grid list-none grid-cols-[minmax(0,1fr)] gap-3 p-0 md:grid-cols-2">
        {tarjetas.map(t => (
          <li key={t.id}>
            <Card as="section" className={`flex h-full flex-col gap-2 border-l-4 ${FRANJA[t.tono]}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="flex items-center gap-2 text-base">
                  {ICONO[t.id] && <span aria-hidden="true" className="grid h-8 w-8 place-items-center rounded-[10px] bg-paper-2 text-ink-2">
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={ICONO[t.id]} /></svg>
                  </span>}
                  {t.titulo}
                </h2>
                <Chip tono={TONO[t.tono]}>{ETIQUETA[t.tono]}</Chip>
              </div>
              <p className="min-w-0 break-words text-sm text-ink-2">{t.texto}</p>
              <div className="mt-auto pt-1"><Boton href={t.href} variante={t.urgente ? 'primario' : 'secundario'}>{t.enlace}</Boton></div>
            </Card>
          </li>
        ))}
      </ul>
      <p className="mt-5 text-sm text-ink-3">Empleados, nóminas, PRL y el resto de herramientas están en el menú.</p>
    </Page>
  )
}
