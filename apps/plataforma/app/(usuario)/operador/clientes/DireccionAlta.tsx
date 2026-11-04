'use client'
// Dirección del alta de un taller con el patrón del repo: CP primero → provincia automática → desplegable de municipios
// → calle autocompletada con el callejero del Catastro → número. Nunca un municipio/provincia por defecto.
// Referencia: ../../correduria/BuscadorDireccionCp.tsx (aquí CONTROLADO, para un formulario que no es GET).
import { useEffect, useId, useState } from 'react'

export type DireccionForm = { cp: string; provincia: string; municipio: string; via: string; numero: string }
export const DIRECCION_VACIA: DireccionForm = { cp: '', provincia: '', municipio: '', via: '', numero: '' }

const inp: React.CSSProperties = { width: '100%', padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 16, minHeight: 44, background: 'var(--surface)', color: 'var(--text)', minWidth: 0 }
const lab: React.CSSProperties = { display: 'grid', gap: 4, fontSize: 13, fontWeight: 600, minWidth: 0 }

export default function DireccionAlta({ valor, onChange }: { valor: DireccionForm; onChange: (d: DireccionForm) => void }) {
  const [municipios, setMunicipios] = useState<string[] | null>(null)
  const [aviso, setAviso] = useState('')
  const [vias, setVias] = useState<string[]>([])
  const idLista = useId()
  const cpValido = /^\d{5}$/.test(valor.cp)

  useEffect(() => {
    if (!cpValido) { setMunicipios(null); setAviso(''); return }
    let vivo = true
    fetch(`/api/correduria/codigo-postal?cp=${valor.cp}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j: { municipios: string[] | null; provincia: string | null }) => {
        if (!vivo) return
        setMunicipios(j.municipios)
        setAviso(j.municipios === null ? 'Ese código postal no está en la tabla: escribe el municipio a mano.' : '')
        onChange({ ...valor, provincia: j.provincia ?? valor.provincia, municipio: j.municipios && j.municipios.length === 1 ? j.municipios[0] : j.municipios && !j.municipios.includes(valor.municipio) ? '' : valor.municipio })
      })
      .catch(() => { if (vivo) setAviso('No se ha podido leer el código postal ahora: escribe provincia y municipio a mano.') })
    return () => { vivo = false }
    // Solo reacciona al CP.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valor.cp])

  useEffect(() => {
    if (!valor.municipio.trim() || !valor.provincia.trim() || valor.via.replace(/[^A-ZÑ0-9]/gi, '').length < 2) { setVias([]); return }
    let vivo = true
    const ctl = new AbortController()
    const t = setTimeout(() => {
      fetch(`/api/correduria/catastro/vias?${new URLSearchParams({ provincia: valor.provincia, municipio: valor.municipio, q: valor.via })}`, { signal: ctl.signal })
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
        .then((j: { vias: { tipo: string; nombre: string }[] }) => { if (vivo) setVias(j.vias.map((v) => `${v.tipo} ${v.nombre}`)) })
        .catch(() => { if (vivo) setVias([]) })
    }, 300)
    return () => { vivo = false; clearTimeout(t); ctl.abort() }
  }, [valor.via, valor.municipio, valor.provincia])

  const eligeDeLista = municipios !== null && municipios.length > 1
  return (
    <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 150px), 1fr))', marginBottom: 12 }}>
      <label style={lab}>Código postal (primero)
        <input style={inp} inputMode="numeric" maxLength={5} value={valor.cp} onChange={(e) => onChange({ ...valor, cp: e.target.value.replace(/\D/g, '') })} />
      </label>
      <label style={lab}>Provincia
        <input style={inp} value={valor.provincia} placeholder="Sale del código postal" onChange={(e) => onChange({ ...valor, provincia: e.target.value })} />
      </label>
      <label style={lab}>Municipio
        {eligeDeLista ? (
          <select style={inp} value={valor.municipio} onChange={(e) => onChange({ ...valor, municipio: e.target.value })}>
            <option value="">Elige el municipio</option>
            {municipios!.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        ) : (
          <input style={inp} value={valor.municipio} placeholder="Sale del código postal" onChange={(e) => onChange({ ...valor, municipio: e.target.value })} />
        )}
      </label>
      <label style={{ ...lab, gridColumn: '1 / -1' }}>Calle (callejero del Catastro)
        <input style={inp} list={idLista} value={valor.via} autoComplete="off" onChange={(e) => onChange({ ...valor, via: e.target.value })} />
        <datalist id={idLista}>{vias.map((v) => <option key={v} value={v} />)}</datalist>
      </label>
      <label style={lab}>Número
        <input style={inp} value={valor.numero} placeholder="o «s/n»" onChange={(e) => onChange({ ...valor, numero: e.target.value })} />
      </label>
      {aviso && <div role="status" style={{ gridColumn: '1 / -1', fontSize: 12, color: 'var(--warning)' }}>{aviso}</div>}
    </div>
  )
}
