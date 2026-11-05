import { NavContabilidad } from './_nav'
import { SalirBoton } from './_salir'
import { marcaCabecera, SELLO } from '@/lib/marca'
import type { FilaEmpresa } from '@/lib/repo'

/** Cabecera común: logo (o iniciales) y nombre de la EMPRESA + «con Grupo ASegura» pequeño · Salir; debajo, el menú. */
export function Cabecera({ empresa, variasEmpresas = false }: { empresa: FilaEmpresa | null; variasEmpresas?: boolean }) {
  const m = marcaCabecera(empresa)
  return (
    <header className="cabecera">
      <div className="cabecera-fila">
        <a href="/" className="marca" aria-label={`${m.nombre}: inicio`}>
          <span className="marca-caja">
            {m.logoUrl
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={m.logoUrl} alt={m.nombre} className="marca-logo" />
              : <span aria-hidden="true">{m.iniciales}</span>}
          </span>
          <span className="marca-texto">
            <strong>{m.nombre}</strong>
            <span className="sello">{SELLO}</span>
          </span>
        </a>
        <SalirBoton variasEmpresas={variasEmpresas} />
      </div>
      <NavContabilidad />
    </header>
  )
}
