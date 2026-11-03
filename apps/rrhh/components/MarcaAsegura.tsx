import { LOGO_ASEGURA, PIE_ASEGURA, RUTA_PRIVACIDAD, WEB_ASEGURA, WEB_ASEGURA_TEXTO } from '@/lib/marca-asegura'
import InstalarApp from '@/components/InstalarApp'
import type { MarcaCabecera } from '@/lib/marca-empresa'

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
        <LogoAsegura alto={alto} color="var(--brand)" />
      </div>
    </div>
  )
}

/**
 * Marca de la cabecera DENTRO de la app (ya se sabe la empresa): el logo (o el nombre) de la empresa en grande y, debajo,
 * «con Grupo ASegura» en pequeño y apagado. Sin logo/color de la empresa → la co-marca de siempre.
 */
export function MarcaEmpresa({ marca, className = '' }: { marca: MarcaCabecera; className?: string }) {
  if (marca.modo === 'asegura') return <CoMarca nombre={marca.nombre} alto={20} className={`!flex-row !items-center !gap-3 min-w-0 max-w-full ${className}`} />
  return (
    <div className={`flex min-w-0 max-w-full flex-col items-start gap-0.5 ${className}`}>
      {marca.logoUrl
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={marca.logoUrl} alt={marca.nombre || 'Logo de la empresa'} className="max-h-12 w-auto max-w-[220px] object-contain object-left" />
        : <p className="asegura-cliente-nombre !text-2xl">{marca.nombre}</p>}
      {marca.logoUrl && marca.nombre && <p className="asegura-cliente-nombre !text-base">{marca.nombre}</p>}
      <p className="m-0 text-xs text-ink-3">con Grupo ASegura</p>
    </div>
  )
}

/** Marca de las pantallas SIN empresa conocida (portada, login): «Portal del Empleado» manda; Grupo ASegura, pequeño y apagado. */
export function MarcaGenerica({ className = '' }: { className?: string }) {
  return (
    <div className={`flex flex-col items-center gap-1 ${className}`}>
      <p className="asegura-cliente-nombre !text-2xl">Portal del Empleado</p>
      <p className="m-0 flex items-center justify-center gap-1.5 text-xs text-ink-3"><span>con</span><LogoAsegura alto={12} color="var(--muted)" /></p>
    </div>
  )
}

/** Pie común: «Herramienta gratuita de Grupo ASegura · grupoasegura.es» + «Privacidad y seguridad» + instalar la app. */
export function PieAsegura() {
  return (
    <footer className="mt-6 px-4 pb-6 text-center text-xs text-ink-3">
      <InstalarApp />
      <p>
        {PIE_ASEGURA} · <a href={WEB_ASEGURA} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-[44px] items-center text-accent underline">{WEB_ASEGURA_TEXTO}</a>
      </p>
      <p>
        <a href={RUTA_PRIVACIDAD} className="inline-flex min-h-[44px] items-center text-accent underline">Privacidad y seguridad</a>
      </p>
    </footer>
  )
}
