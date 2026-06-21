// Inyecta las variables CSS de marca (--brand-*) para sus descendientes.
// Sirve en árbol server o client (no usa hooks). `display:contents` → no afecta al layout.
import type { CSSProperties, ReactNode } from 'react'
import type { Branding } from '@/lib/branding'

export default function BrandingStyle({
  branding,
  children,
}: {
  branding: Pick<Branding, 'primario' | 'secundario' | 'light'>
  children?: ReactNode
}) {
  const vars = {
    display: 'contents',
    ['--brand-primary' as any]:   branding.primario,
    ['--brand-secondary' as any]: branding.secundario,
    ['--brand-light' as any]:     branding.light,
  } as CSSProperties
  return <div style={vars}>{children}</div>
}
