import Link from 'next/link'
import { LayoutGrid, FileText, Receipt, TriangleAlert, Users, Paperclip, History } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { TABS_FICHA, type TabFicha } from './tabs'

export { tabDeParametro, type TabFicha } from './tabs'

/**
 * La barra de pestañas de la ficha del cliente.
 *
 * Mismo idioma visual que `app/(usuario)/banca/SegTabs.tsx`: navegación por
 * URL (`?tab=…`), subrayado en vez de pastilla —navegar no es un objeto— e
 * iconos de `lucide-react`, que se pintan igual en cada sistema operativo.
 *
 * Cada pestaña es una carga server-side independiente: solo se renderiza la
 * activa, así que abrir la ficha no monta el DOM de los doce bloques. Lo que NO
 * ahorra es la llamada al puerto de asegura, que trae la ficha entera de una
 * vez y se repite en cada pestaña. Por eso `prefetch={false}`: prefetchear las
 * siete serían siete consultas a la cartera por pasar el ratón por encima.
 *
 * El contador `null` NO se pinta: «no se ha podido leer» no es «0».
 */

const TABS: { k: TabFicha; label: string; Icono: LucideIcon }[] = [
  { k: 'resumen', label: 'Resumen', Icono: LayoutGrid },
  { k: 'polizas', label: 'Pólizas', Icono: FileText },
  { k: 'recibos', label: 'Recibos', Icono: Receipt },
  { k: 'siniestros', label: 'Siniestros', Icono: TriangleAlert },
  { k: 'contactos', label: 'Contactos', Icono: Users },
  { k: 'documentos', label: 'Documentos', Icono: Paperclip },
  { k: 'historial', label: 'Historial', Icono: History },
]

// Que la barra y `tabs.ts` no se desincronicen: si alguien añade una pestaña
// aquí y olvida el tipo, o al revés, se ve al montar en vez de en producción.
if (TABS.length !== TABS_FICHA.length || TABS.some((t, i) => t.k !== TABS_FICHA[i])) {
  throw new Error('FichaTabs: la barra y TABS_FICHA no coinciden')
}

export type ContadoresTabs = Partial<Record<TabFicha, { n: number | null; tono?: 'aviso' | 'malo'; title?: string }>>

export default function FichaTabs({ clienteId, activa, contadores }: {
  clienteId: string
  activa: TabFicha
  contadores: ContadoresTabs
}) {
  return (
    <div
      role="tablist"
      aria-label="Secciones de la ficha del cliente"
      // El scroll horizontal vive AQUÍ, no en la página: con siete pestañas no
      // caben en 390 px, y un `flexWrap` las apila en tres filas que empujan el
      // contenido fuera de la pantalla.
      style={{
        display: 'flex', gap: 18, flexWrap: 'nowrap',
        overflowX: 'auto', borderBottom: '1px solid var(--border)',
        scrollbarWidth: 'thin',
      }}
    >
      {TABS.map(({ k, label, Icono }) => {
        const on = activa === k
        const c = contadores[k]
        return (
          <Link
            key={k}
            href={k === 'resumen' ? `/correduria/cliente/${clienteId}` : `/correduria/cliente/${clienteId}?tab=${k}`}
            role="tab"
            aria-selected={on}
            prefetch={false}
            scroll={false}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 7,
              fontSize: 14, fontWeight: 600, textDecoration: 'none', whiteSpace: 'nowrap',
              // El borde de 2px se pinta SIEMPRE (transparente si no está
              // activa) para que al cambiar de pestaña no salte la fila.
              padding: '2px 1px 10px',
              borderBottom: `2px solid ${on ? 'var(--primary)' : 'transparent'}`,
              color: on ? 'var(--text)' : 'var(--muted)',
            }}
          >
            <Icono size={15} strokeWidth={1.75} aria-hidden />
            {label}
            {c && c.n !== null && c.n > 0 && <Contador n={c.n} tono={c.tono} title={c.title} />}
          </Link>
        )
      })}
    </div>
  )
}

function Contador({ n, tono, title }: { n: number; tono?: 'aviso' | 'malo'; title?: string }) {
  const color = tono === 'malo' ? 'var(--negative)' : tono === 'aviso' ? 'var(--warning)' : 'var(--muted)'
  const fondo = tono === 'malo' ? 'var(--negative-bg)' : tono === 'aviso' ? 'var(--warning-bg)' : 'var(--border)'
  return (
    <span
      title={title}
      style={{
        fontSize: 11, fontWeight: 700, lineHeight: '16px', minWidth: 16,
        padding: '0 5px', borderRadius: 999, textAlign: 'center',
        color, background: fondo,
      }}
    >
      {n}
    </span>
  )
}
