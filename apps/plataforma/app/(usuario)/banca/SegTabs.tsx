import Link from 'next/link'
import { Wallet, Building2, Receipt, House } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

type Seg = 'dinero' | 'negocios' | 'fiscal' | 'personal'

// Conmutador Dinero | Negocios | Fiscal | Personal por NAVEGACIÓN (Next Link, prefetch). Cada
// pestaña es una carga server-side independiente → /banca (Dinero) NO computa el holding ni la
// fiscalidad ni el desglose personal y viceversa (carga perezosa real, sin el doble coste del
// render-both). El estado activo se pinta desde el prop `active` (server component). Fiscal = la
// previsión de la declaración de la renta (Hoy / Fin de año). Personal = en qué se gasta el dinero
// del día a día, por categoría/comercio.
//
// ─── Por qué SUBRAYADO y no pastilla (02/09/2026) ────────────────────────────────────────────
// Eran cuatro pastillas dentro de una caja con fondo y borde: un bloque que pesa más que el saldo
// que tiene justo debajo, y que compite con las TARJETAS de cuenta —que también son cajas con
// fondo y borde— sin ser lo mismo. El subrayado dice «esto es navegación, no un objeto»: la línea
// inferior separa la barra del contenido y el acento solo marca dónde estás. Borde + fondo +
// sombra se gastan por función (regla de `components/ui.tsx`), y navegar no es un objeto aparte.
//
// Y los emojis pasan a iconos de `lucide-react`: se pintan igual en cada sistema operativo.
const TABS: { k: Seg; label: string; href: string; Icono: LucideIcon }[] = [
  { k: 'dinero', label: 'Dinero', href: '/banca', Icono: Wallet },
  { k: 'negocios', label: 'Negocios', href: '/banca?tab=negocios', Icono: Building2 },
  { k: 'fiscal', label: 'Fiscal', href: '/banca?tab=fiscal', Icono: Receipt },
  { k: 'personal', label: 'Personal', href: '/banca?tab=personal', Icono: House },
]

export default function SegTabs({ active }: { active: Seg }) {
  return (
    <div
      role="tablist"
      aria-label="Dinero, Negocios, Fiscal o Personal"
      style={{
        display: 'flex', gap: 20, flexWrap: 'wrap',
        borderBottom: '1px solid var(--border)',
      }}
    >
      {TABS.map(({ k, label, href, Icono }) => {
        const on = active === k
        return (
          <Link
            key={k}
            href={href}
            role="tab"
            aria-selected={on}
            prefetch
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 7,
              fontSize: 14, fontWeight: 600, textDecoration: 'none', whiteSpace: 'nowrap',
              // El padding inferior aleja el texto de la línea; el borde de 2px se pinta SIEMPRE
              // (transparente cuando no está activa) para que al cambiar de pestaña no salte nada.
              padding: '2px 1px 10px',
              borderBottom: `2px solid ${on ? 'var(--primary)' : 'transparent'}`,
              color: on ? 'var(--text)' : 'var(--muted)',
            }}
          >
            <Icono size={15} strokeWidth={1.75} aria-hidden />
            {label}
          </Link>
        )
      })}
    </div>
  )
}
