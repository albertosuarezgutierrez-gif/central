import type { ReactNode } from 'react'

/**
 * Tabla del panel: contenedor con scroll horizontal + `<table class="tabla-cards">` (cards en móvil,
 * ver `app/globals.css`). Cada `<td>` lleva su `data-label`. El `min-w-[…]` de la tabla va SIEMPRE
 * con prefijo `md:` (p. ej. `tablaClassName="md:min-w-[560px]"`); sin él, la card no cabe en móvil.
 */
export default function Tabla({ className = '', tablaClassName = '', fija = false, children }: {
  className?: string
  /** Cabecera pegada arriba en escritorio: la tabla scrollea dentro de su caja (máx. 70vh). */
  fija?: boolean
  tablaClassName?: string
  children: ReactNode
}) {
  return (
    <div className={`overflow-x-auto rounded-card border border-line bg-card ${fija ? 'md:max-h-[70vh] md:overflow-y-auto [&_thead_th]:md:sticky [&_thead_th]:md:top-0 [&_thead_th]:md:z-10 [&_thead_th]:md:bg-paper-2' : ''} ${className}`}>
      <table className={`tabla-cards w-full border-collapse text-sm ${tablaClassName}`}>{children}</table>
    </div>
  )
}
