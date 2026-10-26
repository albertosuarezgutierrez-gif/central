import { LOGO_ASEGURA, PIE_ASEGURA, WEB_ASEGURA, WEB_ASEGURA_TEXTO } from '@/lib/marca-asegura'
import InstalarApp from '@/components/InstalarApp'

/** Logotipo de Grupo ASegura (SVG con currentColor → se pinta con máscara del color del contexto). */
export function LogoAsegura({ alto = 32, color = 'currentColor', className = '' }: { alto?: number; color?: string; className?: string }) {
  return (
    <span role="img" aria-label="Grupo ASegura" className={`inline-block ${className}`}
      style={{ height: alto, aspectRatio: '6.83 / 1', backgroundColor: color,
        WebkitMask: `url(${LOGO_ASEGURA}) no-repeat left center / contain`, mask: `url(${LOGO_ASEGURA}) no-repeat left center / contain` }} />
  )
}

/**
 * Co-marca (móvil 320-430 px): logo del CLIENTE arriba y, debajo, «con» + logotipo «Grupo ASegura».
 * En vertical porque «[cliente] × [Grupo ASegura]» en una fila no cabe a 320 px sin encoger los dos logos.
 * Sin logo del cliente se muestra su nombre; sin ninguno de los dos, solo Grupo ASegura.
 */
export function CoMarca({ logoUrl, nombre, alto = 26, className = '' }: { logoUrl?: string | null; nombre?: string | null; alto?: number; className?: string }) {
  const cliente = logoUrl
    // eslint-disable-next-line @next/next/no-img-element
    ? <img src={logoUrl} alt={nombre || 'Logo de la empresa'} className="mx-auto max-h-14 w-auto max-w-[200px] object-contain" />
    : nombre ? <p className="asegura-cliente-nombre">{nombre}</p> : null
  return (
    <div className={`asegura-comarca ${className}`}>
      {cliente}
      <div className="asegura-con">
        {cliente && <span className="asegura-con-texto">con</span>}
        <LogoAsegura alto={alto} color="var(--accent)" />
      </div>
    </div>
  )
}

/** Pie común: «Herramienta gratuita de Grupo ASegura · grupoasegura.es» (enlace en pestaña nueva) + instalar la app. */
export function PieAsegura() {
  return (
    <footer className="marca-asegura-pie mt-6 px-4 pb-6 text-center text-xs text-ink-3">
      <InstalarApp />
      <p>
        {PIE_ASEGURA} · <a href={WEB_ASEGURA} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-[44px] items-center text-accent underline">{WEB_ASEGURA_TEXTO}</a>
      </p>
    </footer>
  )
}
