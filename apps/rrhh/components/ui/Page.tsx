import type { ReactNode } from 'react'

/**
 * Cabecera + cuerpo de una pantalla del panel. `ancho="formulario"` limita a max-w-2xl para que
 * un formulario no se estire a 1280 px; `ancho="ancho"` (por defecto) usa todo el contenido.
 */
export default function Page({ titulo, subtitulo, acciones, volver, ancho = 'ancho', children }: {
  titulo: ReactNode
  subtitulo?: ReactNode
  acciones?: ReactNode
  volver?: { href: string; texto: ReactNode }
  ancho?: 'formulario' | 'ancho'
  children?: ReactNode
}) {
  return (
    <div className={`w-full min-w-0 ${ancho === 'formulario' ? 'max-w-2xl' : ''}`}>
      {volver && (
        <a href={volver.href} className="text-ink-3 text-sm no-underline hover:underline">← {volver.texto}</a>
      )}
      <div className={`mb-4 flex flex-wrap items-start justify-between gap-3 md:mb-6 ${volver ? 'mt-1' : ''}`}>
        <div className="min-w-0">
          <h1 className="text-2xl">{titulo}</h1>
          {subtitulo && <p className="text-ink-3 mt-1 text-sm">{subtitulo}</p>}
        </div>
        {acciones && <div className="flex flex-wrap items-center gap-2">{acciones}</div>}
      </div>
      {children}
    </div>
  )
}
