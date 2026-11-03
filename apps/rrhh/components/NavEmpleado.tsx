'use client'
// Navegación del portal del empleado: barra INFERIOR fija en móvil (pulgar) y pestañas en línea en escritorio.
// Cada pestaña es un botón (la sección vive en la URL, ver `lib/seccion-empleado.ts`). Alto ≥ 44 px.
import type { Seccion } from '@/lib/seccion-empleado'

const ETIQUETA: Record<Seccion, string> = { inicio: 'Inicio', documentos: 'Documentos', vacaciones: 'Vacaciones', fichaje: 'Fichaje' }
const ICONO: Record<Seccion, string> = {
  inicio: 'M3 11 12 3l9 8v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z',
  documentos: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8ZM14 2v6h6M8 13h8M8 17h5',
  vacaciones: 'M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z',
  fichaje: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20M12 6v6l4 2',
}

export default function NavEmpleado({ activa, secciones, onCambiar, insignias = {} }: {
  activa: Seccion
  secciones: Seccion[]
  onCambiar: (s: Seccion) => void
  insignias?: Partial<Record<Seccion, number>>
}) {
  return (
    <nav aria-label="Secciones del portal"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-card pb-[env(safe-area-inset-bottom)] lg:static lg:mb-3 lg:border-t-0 lg:bg-transparent lg:pb-0">
      <ul className="mx-auto flex max-w-[520px] lg:max-w-5xl lg:gap-2 lg:px-4">
        {secciones.map(s => {
          const on = s === activa
          const n = insignias[s] ?? 0
          return (
            <li key={s} className="min-w-0 flex-1 lg:flex-none">
              <button type="button" onClick={() => onCambiar(s)} aria-current={on ? 'page' : undefined}
                className={`relative flex min-h-[56px] w-full flex-col items-center justify-center gap-0.5 rounded-none px-1 text-xs font-bold lg:min-h-[44px] lg:flex-row lg:gap-2 lg:rounded-[12px] lg:px-4 lg:text-sm ${on ? 'bg-transparent text-accent hover:bg-transparent lg:bg-accent-soft' : 'bg-transparent text-ink-3 hover:bg-transparent hover:text-ink lg:hover:bg-paper-2'}`}>
                <span className="relative">
                  <svg aria-hidden="true" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={ICONO[s]} /></svg>
                  {n > 0 && <span className="absolute -right-2 -top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-alert px-1 text-[10px] font-bold text-card" aria-label={`${n} pendientes`}>{n}</span>}
                </span>
                <span>{ETIQUETA[s]}</span>
              </button>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
