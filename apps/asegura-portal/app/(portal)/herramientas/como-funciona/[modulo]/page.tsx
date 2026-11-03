import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'

import { CATALOGO_MODULOS, manualDeModulo } from '@central/module-seguros-portal'

import { puertaDeSesion } from '@/lib/puertas-portal'
import { getIdentidad } from '@/lib/session'

import { PaginaPortal } from '../../../../PaginaPortal'

export const dynamic = 'force-dynamic'

// Manual de la herramienta: es contenido de ayuda para quien ya tiene sesión, no una página pública. Aunque el layout raíz ya
// declara noindex para todo el portal, se repite aquí a propósito (cinturón y tirantes).
export const metadata = {
  title: 'Cómo funciona — Grupo ASegura',
  robots: { index: false, follow: false },
}

// Disuasorio, no seguridad: el manual no se ofrece como PDF ni descarga y su texto no se selecciona con facilidad.
const SIN_SELECCION = { userSelect: 'none', WebkitUserSelect: 'none' } as const

/**
 * «Cómo funciona» de una herramienta (28/10/2026). Mismo guard que `/herramientas`: sesión (`getIdentidad`) y la puerta de
 * «Herramientas» (`puertaDeSesion('herramientas')`). El id de la URL solo elige un manual del catálogo cerrado
 * (`manualDeModulo`): no consulta nada de ningún cliente, y uno desconocido es 404. Contenido: `module-seguros-portal/src/manuales.ts`.
 */
export default async function ComoFuncionaPage({ params }: { params: Promise<{ modulo: string }> }) {
  const identidad = await getIdentidad()
  if (!identidad) redirect('/')
  if (!(await puertaDeSesion('herramientas', 'lectura'))) redirect('/inicio')
  const m = manualDeModulo((await params).modulo)
  if (m === null) notFound()
  const hrefHerramienta = CATALOGO_MODULOS[m.modulo].hrefPortal

  return (
    <PaginaPortal antetitulo="Cómo funciona" titulo={m.titulo}>
      <div style={SIN_SELECCION}>
        <p style={{ marginTop: 0 }}>{m.queEs}</p>

        <section className="seccion" aria-labelledby="manual-empezar">
          <h2 id="manual-empezar" style={{ marginTop: 0 }}>Cómo empezar</h2>
          <ol style={{ margin: 0, paddingLeft: 20, display: 'grid', gap: 8 }}>
            {m.empezar.map((p) => (
              <li key={p} style={{ overflowWrap: 'anywhere' }}>{p}</li>
            ))}
          </ol>
        </section>

        {m.porElemento && (
          <section className="seccion" aria-labelledby="manual-elemento">
            <h2 id="manual-elemento" style={{ marginTop: 0 }}>{m.porElemento.titulo}</h2>
            <ol style={{ margin: 0, paddingLeft: 20, display: 'grid', gap: 8 }}>
              {m.porElemento.pasos.map((p) => (
                <li key={p} style={{ overflowWrap: 'anywhere' }}>{p}</li>
              ))}
            </ol>
          </section>
        )}

        <section className="seccion" aria-labelledby="manual-corredurias">
          <h2 id="manual-corredurias" style={{ marginTop: 0 }}>Qué ve Grupo ASegura y qué no</h2>
          <h3 style={{ marginTop: 0 }}>Lo que ve</h3>
          <ul style={{ margin: 0, paddingLeft: 20, display: 'grid', gap: 8 }}>
            {m.correduriaVe.map((p) => (
              <li key={p} style={{ overflowWrap: 'anywhere' }}>{p}</li>
            ))}
          </ul>
          <h3>Lo que no ve ni hace</h3>
          <ul style={{ margin: 0, paddingLeft: 20, display: 'grid', gap: 8 }}>
            {m.correduriaNoVe.map((p) => (
              <li key={p} style={{ overflowWrap: 'anywhere' }}>{p}</li>
            ))}
          </ul>
        </section>
      </div>

      <p style={{ display: 'flex', flexWrap: 'wrap', gap: 8, margin: '16px 0 0' }}>
        {hrefHerramienta !== null && (
          <Link className="boton" style={{ minHeight: 44 }} href={hrefHerramienta}>Ir a la herramienta</Link>
        )}
        <Link className="boton-tenue" style={{ minHeight: 44 }} href="/herramientas">← Herramientas</Link>
      </p>
    </PaginaPortal>
  )
}
