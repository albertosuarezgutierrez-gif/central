'use client'
import { usePathname } from 'next/navigation'

type Enlace = { href: string; label: string; icono: string; soloFichaje?: boolean; exacto?: boolean; tambien?: string[] }
type Grupo = { titulo: string; enlaces: Enlace[] }

// Trazos SVG (24×24, stroke) mínimos; decorativos (aria-hidden).
const I = {
  personas: 'M16 19v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1M9.5 10a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7M21 19v-1a4 4 0 0 0-3-3.87M16 3.13a3.5 3.5 0 0 1 0 6.75',
  bandeja: 'M22 12h-6l-2 3h-4l-2-3H2M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11',
  euro: 'M4 10h12M4 14h9M19 6a7.7 7.7 0 0 0-5.2-2A7.9 7.9 0 0 0 6 12c0 4.4 3.5 8 7.8 8 2 0 3.8-.8 5.2-2',
  enviar: 'M22 2 11 13M22 2l-7 20-4-9-9-4 20-7',
  firma: 'M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z',
  escudo: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10',
  grafico: 'M3 3v18h18M7 16v-5M12 16V8M17 16v-8',
  calendario: 'M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2',
  reloj: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20M12 6v6l4 2',
  pin: 'M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0M12 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6',
  edificio: 'M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18ZM6 12H4a2 2 0 0 0-2 2v8h4M18 9h2a2 2 0 0 1 2 2v11h-4M10 6h4M10 10h4M10 14h4M10 18h4',
  ajustes: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-2.82 1.17V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 8 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 8a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1',
  caja: 'M21 8 12 3 3 8v8l9 5 9-5ZM3 8l9 5 9-5M12 13v8',
  inicio: 'M3 9.5 12 3l9 6.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1Z',
  libro: 'M4 19.5A2.5 2.5 0 0 1 6.5 17H20V2H6.5A2.5 2.5 0 0 0 4 4.5v15A2.5 2.5 0 0 0 6.5 22H20v-5',
}

const GRUPOS: Grupo[] = [
  { titulo: '', enlaces: [
    { href: '/admin', label: 'Inicio', icono: I.inicio, exacto: true },
  ] },
  { titulo: 'Personas', enlaces: [
    { href: '/admin/empleados', label: 'Empleados', icono: I.personas },
    // Solicitudes y Calendario son dos vistas de lo mismo: una entrada, con pestañas dentro.
    { href: '/admin/solicitudes', label: 'Solicitudes', icono: I.bandeja, tambien: ['/admin/calendario'] },
    { href: '/admin/material', label: 'Material', icono: I.caja },
  ] },
  { titulo: 'Documentos', enlaces: [
    { href: '/admin/documentos', label: 'Enviar documentos', icono: I.enviar },
    { href: '/admin/firmas', label: 'Firmas pendientes', icono: I.firma },
    { href: '/admin/nominas', label: 'Nóminas', icono: I.euro },
    { href: '/admin/prl', label: 'PRL', icono: I.escudo },
  ] },
  { titulo: 'Tiempo', enlaces: [
    { href: '/admin/fichajes', label: 'Fichajes', icono: I.reloj, soloFichaje: true },
    { href: '/admin/obras', label: 'Obras', icono: I.pin, soloFichaje: true },
  ] },
  { titulo: 'Empresa', enlaces: [
    // «Empresa» y «Mi cuenta» eran duplicados: Ajustes lo reúne (marca, convenio y documentación).
    { href: '/admin/cuenta', label: 'Ajustes de empresa', icono: I.ajustes, tambien: ['/admin/empresa'] },
    { href: '/admin/informes', label: 'Informes', icono: I.grafico },
  ] },
]

/** ¿El enlace `href` es la sección activa de `pathname`? (incluye subrutas: /admin/empleados/123). */
export function esActivo(pathname: string | null, href: string, exacto = false): boolean {
  if (!pathname) return false
  if (exacto) return pathname === href
  return pathname === href || pathname.startsWith(href + '/')
}

const CLASE = 'flex min-h-[44px] shrink-0 items-center gap-2.5 rounded-[12px] px-3 py-2 text-sm font-bold no-underline whitespace-nowrap'

function Icono({ d }: { d: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="hidden shrink-0 md:block">
      <path d={d} />
    </svg>
  )
}

/**
 * Menú del panel. En móvil: una fila horizontal con scroll (los grupos son `display:contents` y sus
 * cabeceras se ocultan). En escritorio: columna agrupada con cabeceras pequeñas.
 */
export default function AdminNav({ tieneFichaje }: { tieneFichaje?: boolean }) {
  const pathname = usePathname()
  return (
    <nav aria-label="Panel" className="order-last flex min-w-0 basis-full flex-row gap-1 overflow-x-auto md:order-none md:w-full md:basis-auto md:flex-col md:gap-0 md:overflow-visible">
      {GRUPOS.map(g => {
        const enlaces = g.enlaces.filter(e => !e.soloFichaje || tieneFichaje)
        if (enlaces.length === 0) return null
        return (
          <div key={g.titulo} className="contents md:mb-3 md:flex md:flex-col md:gap-0.5">
            {g.titulo && <div className="hidden px-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-ink-3 md:block">{g.titulo}</div>}
            {enlaces.map(e => {
              const activo = esActivo(pathname, e.href, e.exacto) || (e.tambien ?? []).some(h => esActivo(pathname, h))
              return (
                <a key={e.href} href={e.href} aria-current={activo ? 'page' : undefined}
                  className={`${CLASE} ${activo ? 'bg-accent text-card' : 'text-ink-2 hover:bg-paper'}`}>
                  <Icono d={e.icono} />{e.label}
                </a>
              )
            })}
          </div>
        )
      })}
      <a href="/manual.html" target="_blank" rel="noopener noreferrer" className={`${CLASE} text-ink-2 hover:bg-paper`}>
        <Icono d={I.libro} />Manual
      </a>
    </nav>
  )
}
