'use client'
import { useEffect, useId, type ReactNode } from 'react'

/**
 * Diálogo modal único del panel y del portal del empleado (antes cada pantalla repetía el cascarón
 * `fixed inset-0 …`). Fondo oscurecido, cierra con Escape y al pulsar fuera, ≤95 vw, scroll interno.
 * El contenido va en `children`; los botones de acción, en `pie`.
 */
export default function Modal({ titulo, onCerrar, pie, ancho = 'md', children }: {
  titulo?: ReactNode
  onCerrar: () => void
  pie?: ReactNode
  ancho?: 'sm' | 'md' | 'lg'
  children?: ReactNode
}) {
  const idTitulo = useId()
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') onCerrar() }
    document.addEventListener('keydown', tecla)
    return () => document.removeEventListener('keydown', tecla)
  }, [onCerrar])
  const max = ancho === 'sm' ? 'max-w-sm' : ancho === 'lg' ? 'max-w-2xl' : 'max-w-md'
  return (
    <div onClick={onCerrar} className="fixed inset-0 z-50 grid place-items-center bg-ink/40 p-3">
      <div role="dialog" aria-modal="true" aria-labelledby={titulo ? idTitulo : undefined} onClick={e => e.stopPropagation()}
        className={`flex max-h-[92vh] w-[95vw] ${max} flex-col overflow-y-auto rounded-card border border-line bg-card p-5 shadow-encima`}>
        {titulo && <h2 id={idTitulo} className="mb-2 text-lg">{titulo}</h2>}
        <div className="min-w-0">{children}</div>
        {pie && <div className="mt-4 flex flex-wrap justify-end gap-2">{pie}</div>}
      </div>
    </div>
  )
}
