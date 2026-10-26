'use client'
// Cabecera COMÚN de las dos ventanas (26/10/2026), la misma en /e (empleado) y en /admin (responsable):
//   [logo de la empresa] con Grupo ASegura · [selector de empresa, solo si hay ≥2] · [Herramientas] [Seguros] [Salir]
// «Herramientas» es esta app (activa); «Seguros» lleva al portal de clientes con SOLO el correo (`urlPortalAsegura`):
// los datos de RR.HH. nunca se usan comercialmente. Acceder a una herramienta no abre los seguros: es un enlace.
import { useState } from 'react'
import { usePathname } from 'next/navigation'
import { CoMarca } from '@/components/MarcaAsegura'

type Empresa = { id: string; nombre: string }

export default function CabeceraApp({ perfil, logoUrl, nombreEmpresa, urlSeguros, empresas = [], empresaActualId }: {
  perfil: 'empleado' | 'responsable'
  logoUrl?: string | null
  nombreEmpresa?: string | null
  urlSeguros: string
  empresas?: Empresa[]
  empresaActualId?: string
}) {
  const [cambiando, setCambiando] = useState(false)
  const [error, setError] = useState('')
  const inicio = perfil === 'empleado' ? '/e' : '/admin'
  // `aria-current="page"` solo cuando de verdad se está EN la página a la que lleva (Inicio), no en cualquier subpágina.
  const enInicio = usePathname() === inicio
  const base = 'inline-flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-[12px] px-4 text-sm font-bold no-underline sm:flex-none'

  async function cambiar(id: string) {
    if (id === empresaActualId || cambiando) return
    setCambiando(true); setError('')
    const r = await fetch('/api/auth/cambiar-empresa', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ empresa_id: id }) }).catch(() => null)
    if (!r || !r.ok) { setCambiando(false); setError('No se ha podido cambiar de empresa.'); return }
    // Recarga completa: el marco y los datos se leen otra vez con la empresa nueva. Siempre a Inicio (no a la subpágina de otra empresa).
    window.location.href = inicio
  }

  async function salir() {
    if (perfil === 'empleado') { await fetch('/api/e/salir', { method: 'POST' }); location.href = '/e/entrar' }
    else { await fetch('/api/auth/logout', { method: 'POST' }); location.href = '/login' }
  }

  return (
    <header className="border-b border-line bg-card">
      <div className="mx-auto flex w-full max-w-[1280px] flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3">
        <CoMarca logoUrl={logoUrl} nombre={nombreEmpresa} alto={20} className="!flex-row !items-center !gap-3 min-w-0 max-w-full" />

        {empresas.length > 1 && (
          <label className="flex min-w-0 basis-full flex-col gap-1 text-xs text-ink-3 sm:basis-auto sm:flex-row sm:items-center sm:gap-2">
            <span className="font-bold">Empresa</span>
            <select aria-label="Cambiar de empresa" value={empresaActualId ?? ''} disabled={cambiando}
              onChange={e => cambiar(e.target.value)} className="min-h-[44px] w-full text-sm font-bold text-ink sm:w-auto sm:min-w-[220px]">
              {empresas.map(e => <option key={e.id} value={e.id}>{e.nombre}</option>)}
            </select>
          </label>
        )}

        <nav aria-label="Herramientas y seguros" className="flex w-full flex-wrap gap-2 sm:ml-auto sm:w-auto">
          <a href={inicio} aria-current={enInicio ? 'page' : undefined} className={`${base} bg-accent text-card`}>Herramientas</a>
          <a href={urlSeguros} target="_blank" rel="noopener noreferrer" className={`${base} border border-line-2 bg-card text-accent hover:bg-accent-soft`}>
            Seguros
            <svg aria-hidden="true" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14 21 3" /></svg>
          </a>
          <button type="button" onClick={salir} className="min-h-[44px] flex-1 bg-transparent px-3 text-sm text-ink-3 underline hover:bg-transparent hover:text-ink sm:flex-none">
            {perfil === 'empleado' ? 'Salir de este dispositivo' : 'Salir'}
          </button>
        </nav>
        {error && <p role="alert" className="basis-full text-sm text-alert">{error}</p>}
      </div>
    </header>
  )
}
