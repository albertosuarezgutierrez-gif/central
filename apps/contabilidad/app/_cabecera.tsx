import { NavContabilidad } from './_nav'
import { SalirBoton } from './_salir'
import { marcaCabecera, SELLO } from '@/lib/marca'
import type { FilaEmpresa } from '@/lib/repo'

/** Cabecera común: logo (o iniciales) y nombre de la EMPRESA + «con Grupo ASegura» pequeño · Salir; debajo, el menú. */
export function Cabecera({ empresa, variasEmpresas = false, avisos = 0 }: { empresa: FilaEmpresa | null; variasEmpresas?: boolean; avisos?: number }) {
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
        <div className="cabecera-acciones">
          <a href="/avisos" className="btn-fantasma campana" aria-label={avisos > 0 ? `Avisos: ${avisos} sin leer` : 'Avisos'}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" />
            </svg>
            {avisos > 0 && <span className="campana-n" aria-hidden="true">{avisos > 99 ? '99+' : avisos}</span>}
          </a>
          <SalirBoton variasEmpresas={variasEmpresas} />
        </div>
      </div>
      <NavContabilidad />
    </header>
  )
}
