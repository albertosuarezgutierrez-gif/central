import { LOGO_ASEGURA, PIE_ASEGURA } from '@/lib/marca-asegura'

/** Logotipo de Grupo ASegura (SVG con currentColor → se pinta con máscara del color del contexto). */
export function LogoAsegura({ alto = 32, color = 'currentColor', className = '' }: { alto?: number; color?: string; className?: string }) {
  return (
    <span role="img" aria-label="Grupo ASegura" className={`inline-block ${className}`}
      style={{ height: alto, aspectRatio: '3.2 / 1', backgroundColor: color,
        WebkitMask: `url(${LOGO_ASEGURA}) no-repeat left center / contain`, mask: `url(${LOGO_ASEGURA}) no-repeat left center / contain` }} />
  )
}

export function PieAsegura() {
  return <p className="marca-asegura-pie mt-6 px-4 pb-6 text-center text-xs text-ink-3">{PIE_ASEGURA}</p>
}
