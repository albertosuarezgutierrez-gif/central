import { SalirBoton } from './_salir'
import { resolverMarca, tallerPilotoId } from '@/lib/marca'

/** Logo del taller + sello pequeño «con Grupo ASegura» (coMarca de la marca). */
export function Cabecera({ conSalir = false }: { conSalir?: boolean }) {
  const m = resolverMarca(tallerPilotoId())
  return (
    <header className="cabecera">
      <a href="/" className="marca">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={m.logoUrl} alt={m.nombre} className="marca-logo" />
        {m.sello && <span className="sello">{m.sello.texto}</span>}
      </a>
      {conSalir && <SalirBoton />}
    </header>
  )
}

export function Sello() {
  const m = resolverMarca(tallerPilotoId())
  return m.sello ? <span className="sello">{m.sello.texto}</span> : null
}
