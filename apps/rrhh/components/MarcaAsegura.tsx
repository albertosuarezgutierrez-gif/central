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

/** Candado (trazo SVG, decorativo): la señal de confianza que acompaña a «Privacidad y seguridad». */
export function IconoCandado({ tam = 14, className = '' }: { tam?: number; className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width={tam} height={tam} fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" className={`shrink-0 ${className}`}><path d="M5 11h14a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2M7 11V7a5 5 0 0 1 10 0v4" /></svg>
  )
}

/**
 * Marca de la cabecera DENTRO de la app (ya se sabe la empresa). Con logo: el logo manda (ya lleva el nombre, no se repite
 * en texto: va en el `alt`) y a su lado, tras una raya fina, «Portal del Empleado» + «con Grupo ASegura» pequeño. Sin logo:
 * el nombre de la empresa en su lugar. Sin logo ni color → la co-marca de siempre.
 */
export function MarcaEmpresa({ marca, className = '', centrada = false }: { marca: MarcaCabecera; className?: string; centrada?: boolean }) {
  if (marca.modo === 'asegura') return <CoMarca nombre={marca.nombre} alto={20} className={`!flex-row !items-center !gap-3 min-w-0 max-w-full ${className}`} />
  const sello = (
    <div className={`min-w-0 ${centrada ? 'text-center' : ''}`}>
      {!marca.logoUrl && <p className="asegura-cliente-nombre !text-lg leading-tight">{marca.nombre}</p>}
      <p className="m-0 font-display text-sm font-bold leading-tight text-ink">Portal del Empleado</p>
      <p className="m-0 text-xs leading-tight text-ink-3">con Grupo ASegura</p>
    </div>
  )
  if (centrada) return (
    <div className={`flex min-w-0 max-w-full flex-col items-center gap-3 ${className}`}>
      {marca.logoUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={marca.logoUrl} alt={marca.nombre || 'Logo de la empresa'} className="h-24 w-auto max-w-[240px] object-contain" />
      )}
      {sello}
    </div>
  )
  return (
    <div className={`flex min-w-0 max-w-full items-center gap-3 ${className}`}>
      {marca.logoUrl && <>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={marca.logoUrl} alt={marca.nombre || 'Logo de la empresa'} className="h-11 w-auto max-w-[140px] shrink-0 object-contain object-left sm:h-12" />
        <span aria-hidden="true" className="h-9 w-px shrink-0 bg-line-2" />
      </>}
      {sello}
    </div>
  )
}

/** Marca de las pantallas SIN empresa conocida (portada, login): «Portal del Empleado» manda; Grupo ASegura, pequeño y apagado. */
export function MarcaGenerica({ className = '' }: { className?: string }) {
  return (
    <div className={`flex flex-col items-center gap-2 ${className}`}>
      <span aria-hidden="true" className="grid h-12 w-12 place-items-center rounded-full bg-accent-soft text-accent">
        <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></svg>
      </span>
      <p className="asegura-cliente-nombre !text-2xl">Portal del Empleado</p>
      <p className="m-0 flex items-center justify-center gap-1.5 text-xs text-ink-3"><span>con</span><LogoAsegura alto={12} color="var(--muted)" /></p>
    </div>
  )
}

/** Pie común, en una línea que se parte en móvil: «Herramienta gratuita de Grupo ASegura · grupoasegura.es · Privacidad y seguridad» + instalar la app. */
export function PieAsegura() {
  return (
    <footer className="mt-8 border-t border-line px-4 pb-6 pt-2 text-center text-xs text-ink-3">
      <InstalarApp />
      <p className="m-0 flex flex-wrap items-center justify-center gap-x-3">
        <span>{PIE_ASEGURA}</span>
        <a href={WEB_ASEGURA} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-[44px] items-center text-ink-2 underline hover:text-accent">{WEB_ASEGURA_TEXTO}</a>
        <a href={RUTA_PRIVACIDAD} className="inline-flex min-h-[44px] items-center gap-1 font-semibold text-accent underline"><IconoCandado />Privacidad y seguridad</a>
      </p>
    </footer>
  )
}
