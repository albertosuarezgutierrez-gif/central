'use client'
import { useState } from 'react'

type Opcion = { id: string; nombre: string; logoUrl: string | null; iniciales: string }

function Caja({ o }: { o: Opcion }) {
  return (
    <span className="marca-caja" aria-hidden="true">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {o.logoUrl ? <img src={o.logoUrl} alt="" className="marca-logo" /> : o.iniciales}
    </span>
  )
}

/** Con 1 empresa: solo su marca (sin chevron). Con varias: desplegable en PC y hoja inferior (95 vw) en móvil. */
export function SelectorEmpresa({ opciones, actual }: { opciones: Opcion[]; actual: string | null }) {
  const [abierto, setAbierto] = useState(false)
  const sel = opciones.find((o) => o.id === actual) ?? null
  if (opciones.length <= 1 && sel) {
    return <a href="/" className="marca"><Caja o={sel} /><span className="marca-texto"><strong>{sel.nombre}</strong></span></a>
  }
  async function elegir(id: string) {
    const r = await fetch('/api/auth/elegir', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ cuentaId: id }) })
    if (r.ok) window.location.href = '/'
  }
  return (
    <div className="selector">
      <button type="button" className="selector-boton" aria-haspopup="listbox" aria-expanded={abierto} onClick={() => setAbierto((v) => !v)}>
        {sel ? <><Caja o={sel} /><strong style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sel.nombre}</strong></> : <strong>Elige empresa</strong>}
        <span aria-hidden="true">▾</span>
      </button>
      {abierto && (
        <div className="selector-hoja" role="listbox" aria-label="Tus empresas">
          {opciones.map((o) => (
            <button key={o.id} type="button" role="option" aria-selected={o.id === actual} aria-current={o.id === actual} className="selector-opcion" onClick={() => elegir(o.id)}>
              <Caja o={o} /><span>{o.nombre}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
