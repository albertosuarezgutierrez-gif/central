import type { ReactNode } from 'react'

/**
 * Tabla del panel: contenedor con scroll horizontal + `<table class="tabla-cards">` (cards en móvil,
 * ver `app/globals.css`). Cada `<td>` lleva su `data-label`. El `min-w-[…]` de la tabla va SIEMPRE
 * con prefijo `md:` (p. ej. `tablaClassName="md:min-w-[560px]"`); sin él, la card no cabe en móvil.
 */
export default function Tabla({ className = '', tablaClassName = '', children }: {
  className?: string
  tablaClassName?: string
  children: ReactNode
}) {
  return (
    <div className={`overflow-x-auto rounded-card border border-line bg-card ${className}`}>
      <table className={`tabla-cards w-full border-collapse text-sm ${tablaClassName}`}>{children}</table>
    </div>
  )
}
