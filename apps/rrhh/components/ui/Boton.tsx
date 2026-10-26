import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from 'react'

export type VarianteBoton = 'primario' | 'secundario' | 'peligro' | 'peligroSuave' | 'fantasma'

/** Clases por variante. Todas con 44 px de alto como mínimo (regla responsive del monorepo): ningún botón del panel baja de ahí. */
export const CLASE_BOTON: Record<VarianteBoton, string> = {
  primario: 'bg-accent text-card hover:bg-accent-ink',
  secundario: 'border border-line-2 bg-card text-ink hover:bg-paper-2',
  peligro: 'bg-alert text-card hover:bg-alert/90',
  peligroSuave: 'border border-alert/40 bg-card text-alert hover:bg-alert/10',
  fantasma: 'bg-transparent text-accent hover:bg-accent-soft',
}
const BASE = 'inline-flex min-h-[44px] items-center justify-center gap-2 rounded-[12px] px-4 py-2 text-sm font-bold no-underline disabled:cursor-not-allowed disabled:opacity-60'

export function claseBoton(variante: VarianteBoton = 'primario', extra = ''): string {
  return `${BASE} ${CLASE_BOTON[variante]} ${extra}`.trim()
}

type Comun = { variante?: VarianteBoton; ancho?: boolean; children?: ReactNode }

/** Botón del panel. Con `href` se pinta como enlace con el mismo aspecto (no hay que repetir las clases a mano). */
export default function Boton(props: Comun & (
  | (ButtonHTMLAttributes<HTMLButtonElement> & { href?: undefined })
  | (AnchorHTMLAttributes<HTMLAnchorElement> & { href: string })
)) {
  const { variante = 'primario', ancho = false, className = '', ...resto } = props
  const clase = claseBoton(variante, `${ancho ? 'w-full ' : ''}${className}`)
  if ('href' in resto && resto.href !== undefined) {
    const { href, children, ...a } = resto as AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }
    return <a href={href} className={clase} {...a}>{children}</a>
  }
  const { children, type = 'button', ...b } = resto as ButtonHTMLAttributes<HTMLButtonElement>
  return <button type={type} className={clase} {...b}>{children}</button>
}
