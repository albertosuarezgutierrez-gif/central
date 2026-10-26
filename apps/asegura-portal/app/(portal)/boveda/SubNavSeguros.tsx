import Link from 'next/link'

import { NOMBRE_FAMILIA, SUBVISTAS_SEGUROS, hrefDeVista, type FamiliaSeguro, type VistaBoveda } from '@central/module-seguros-portal'

/**
 * La navegación DENTRO de «Seguros» (26/10/2026, menú de cinco): Seguros · Recibos · Siniestros · Mi QR eran cuatro
 * entradas del menú y ahora son chips de esta pantalla. Debajo, en «Seguros», las familias (Personales / Patrimoniales /
 * De tu empresa…) que antes eran tarjetas de Inicio. Enlaces, no estado: la vista vive en la URL (`?vista=`, `?familia=`),
 * así que los enlaces viejos (push, correos, marcadores) siguen llegando.
 *
 * Servidor puro (sin hooks). Cada chip ≥44 px (`.subnav a`).
 */
export function SubNavSeguros({ vista, familias, familia }: { vista: VistaBoveda; familias: FamiliaSeguro[]; familia: FamiliaSeguro | null }) {
  // Recordatorios (Herramientas) y Datos (Cuenta) cuelgan de otra entrada del menú: aquí no hay sub-navegación.
  if (!SUBVISTAS_SEGUROS.some((s) => s.vista === vista)) return null
  return (
    <>
      <nav className="subnav" aria-label="Dentro de Seguros">
        {SUBVISTAS_SEGUROS.map((s) => (
          <Link key={s.vista} href={hrefDeVista(s.vista)} aria-current={s.vista === vista ? 'page' : undefined}>
            {s.etiqueta}
          </Link>
        ))}
      </nav>
      {vista === 'seguros' && familias.length > 1 && (
        <nav className="subnav" aria-label="Familias de seguros">
          <Link href="/boveda" aria-current={familia === null ? 'page' : undefined}>Todos</Link>
          {familias.map((f) => (
            <Link key={f} href={`/boveda?familia=${f}`} aria-current={f === familia ? 'page' : undefined}>
              {NOMBRE_FAMILIA[f]}
            </Link>
          ))}
        </nav>
      )}
    </>
  )
}
