'use client'

// Dirección postal con el CP PRIMERO (regla del monorepo): CP → provincia automática + desplegable de municipios → calle
// autocompletada con el callejero del Catastro. Controlado: el padre guarda cp/municipio/provincia/calle donde ya los guardaba.
//
// 🚨 Nunca un municipio/provincia inventado. Un CP que la tabla no conoce (`municipios: null`) NO es «sin municipios»: se escribe
// a mano. Un fallo de red tampoco inventa nada. Datos ya guardados (texto libre antiguo) se muestran tal cual y solo se
// revalidan cuando la persona cambia el CP.
import { useEffect, useId, useRef, useState } from 'react'
import { normVia, nombreCalleEscrito } from '@central/core-direccion'
import { opcionesMunicipio, municipioEquivalente, insertarVia, type ViaSugerida } from '@/lib/direccion-ui'

export type CampoDireccion = { cp: string; municipio: string; provincia: string; calle: string }

type Lectura =
  | { estado: 'vacio' } | { estado: 'consultando' } | { estado: 'error' }
  | { estado: 'ok'; municipios: string[] | null; provincia: string | null }

const input: React.CSSProperties = {
  width: '100%', minWidth: 0, minHeight: 44, padding: '8px 10px', borderRadius: 8, border: '1px solid #e2e8f0',
  fontSize: 16, fontFamily: 'inherit', color: '#1e293b', boxSizing: 'border-box', background: 'white',
}
const etiqueta: React.CSSProperties = { display: 'grid', gap: 4, fontSize: 11, fontWeight: 700, color: '#64748b', minWidth: 0 }
const nota: React.CSSProperties = { fontSize: 12, color: '#64748b', fontWeight: 400 }

export default function DireccionCp({ cp, municipio, provincia, calle, onChange, calleLabel = 'Calle', callePlaceholder = 'Calle San Vicente', mostrarCalle = true }: {
  cp: string; municipio: string; provincia: string; calle: string
  onChange: (cambios: Partial<CampoDireccion>) => void
  calleLabel?: string; callePlaceholder?: string; mostrarCalle?: boolean
}) {
  const [lectura, setLectura] = useState<Lectura>({ estado: 'vacio' })
  const tocado = useRef(false) // true cuando la PERSONA cambia el CP (la primera lectura de un dato guardado no pisa nada)
  const cpValido = /^\d{5}$/.test(cp.trim())
  const [sugeridas, setSugeridas] = useState<ViaSugerida[]>([])
  const [abierto, setAbierto] = useState(false)
  const [activa, setActiva] = useState(-1)
  const [elegida, setElegida] = useState<ViaSugerida | null>(null)
  const [avisoVias, setAvisoVias] = useState(false)
  const idLista = useId()
  const cajaRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!cpValido) { setLectura({ estado: 'vacio' }); return }
    let vivo = true
    setLectura({ estado: 'consultando' })
    fetch(`/api/admin/direccion/cp?cp=${cp.trim()}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j: { municipios: string[] | null; provincia: string | null }) => {
        if (!vivo) return
        setLectura({ estado: 'ok', municipios: j.municipios, provincia: j.provincia })
        if (!tocado.current) return
        const cambios: Partial<CampoDireccion> = {}
        if (j.provincia) cambios.provincia = j.provincia
        if (j.municipios && j.municipios.length === 1) cambios.municipio = j.municipios[0]
        else if (j.municipios) cambios.municipio = municipioEquivalente(j.municipios, municipio) ?? ''
        if (Object.keys(cambios).length) onChange(cambios)
      })
      .catch(() => {
        if (!vivo) return
        setLectura({ estado: 'error' })
        // No dejar municipio/provincia del CP anterior como si fueran del nuevo.
        if (tocado.current) onChange({ municipio: '', provincia: '' })
      })
    return () => { vivo = false }
    // Solo reacciona al CP: `municipio`/`onChange` no deben relanzar la consulta.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cp, cpValido])

  const viaVigente = elegida && normVia(calle).includes(normVia(elegida.nombre)) ? elegida : null

  useEffect(() => {
    const nombre = nombreCalleEscrito(calle)
    if (!mostrarCalle || !municipio.trim() || !provincia.trim() || nombre.replace(/[^A-ZÑ0-9]/gi, '').length < 2 || viaVigente) { setSugeridas([]); return }
    let vivo = true
    const ctl = new AbortController()
    const t = setTimeout(() => {
      fetch(`/api/admin/direccion/vias?${new URLSearchParams({ provincia, municipio, q: calle })}`, { signal: ctl.signal })
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
        .then((j: { vias: ViaSugerida[] }) => { if (vivo) { setSugeridas(j.vias); setActiva(-1); setAvisoVias(false) } })
        .catch((e) => { if (vivo && e?.name !== 'AbortError') { setSugeridas([]); setAvisoVias(true) } })
    }, 300)
    return () => { vivo = false; clearTimeout(t); ctl.abort() }
  }, [calle, municipio, provincia, viaVigente, mostrarCalle])

  useEffect(() => {
    const fuera = (e: MouseEvent) => { if (cajaRef.current && !cajaRef.current.contains(e.target as Node)) setAbierto(false) }
    document.addEventListener('mousedown', fuera)
    return () => document.removeEventListener('mousedown', fuera)
  }, [])

  function elegir(v: ViaSugerida) {
    onChange({ calle: insertarVia(calle, v) })
    setElegida(v); setSugeridas([]); setAbierto(false)
  }
  function teclas(e: React.KeyboardEvent<HTMLInputElement>) {
    const n = sugeridas.length
    if (!abierto || n === 0) { if (e.key === 'ArrowDown' && n > 0) { setAbierto(true); e.preventDefault() } return }
    if (e.key === 'ArrowDown') { setActiva((a) => (a + 1) % n); e.preventDefault() }
    else if (e.key === 'ArrowUp') { setActiva((a) => (a <= 0 ? n - 1 : a - 1)); e.preventDefault() }
    else if (e.key === 'Enter' && activa >= 0) { elegir(sugeridas[activa]); e.preventDefault() }
    else if (e.key === 'Escape') { setAbierto(false); e.preventDefault() }
  }

  const lista = lectura.estado === 'ok' ? lectura.municipios : null
  const { opciones, legado, valor } = opcionesMunicipio(lista, municipio)
  const eligeDeLista = lista !== null
  return (
    <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 150px), 1fr))' }}>
      <label style={etiqueta}>Código postal
        <input style={input} inputMode="numeric" maxLength={5} placeholder="41003" value={cp}
          onChange={(e) => { tocado.current = true; onChange({ cp: e.target.value.replace(/\D/g, '').slice(0, 5) }) }} />
      </label>
      <label style={etiqueta}>Municipio
        {eligeDeLista ? (
          <select style={input} value={valor} onChange={(e) => onChange({ municipio: e.target.value })}>
            <option value="">Elige el municipio</option>
            {opciones.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        ) : (
          <input style={input} value={municipio} onChange={(e) => onChange({ municipio: e.target.value })} placeholder={cpValido ? '' : 'Sale del código postal'} />
        )}
      </label>
      <label style={etiqueta}>Provincia
        <input style={input} value={provincia} onChange={(e) => onChange({ provincia: e.target.value })} placeholder={cpValido ? '' : 'Sale del código postal'} />
      </label>
      {mostrarCalle && (
        <div ref={cajaRef} style={{ ...etiqueta, gridColumn: '1 / -1', position: 'relative' }}>
          <label htmlFor={`${idLista}-calle`} style={{ display: 'grid', gap: 4 }}>{calleLabel}
            <input
              id={`${idLista}-calle`} style={input} placeholder={callePlaceholder} value={calle} autoComplete="off"
              role="combobox" aria-expanded={abierto && sugeridas.length > 0} aria-controls={idLista} aria-autocomplete="list"
              aria-activedescendant={activa >= 0 ? `${idLista}-${activa}` : undefined}
              onChange={(e) => { onChange({ calle: e.target.value }); setAbierto(true) }}
              onFocus={() => setAbierto(true)} onKeyDown={teclas}
            />
          </label>
          {abierto && sugeridas.length > 0 && (
            <ul id={idLista} role="listbox" aria-label="Calles del Catastro" style={{
              position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20, margin: '2px 0 0', padding: 0, listStyle: 'none',
              background: 'white', border: '1px solid #e2e8f0', borderRadius: 8, maxHeight: 'min(60vh, 480px)', overflowY: 'auto',
              boxShadow: '0 6px 18px rgba(0,0,0,.15)',
            }}>
              {sugeridas.map((v, i) => (
                <li key={`${v.tipo}|${v.nombre}`} id={`${idLista}-${i}`} role="option" aria-selected={i === activa}
                  onMouseDown={(e) => { e.preventDefault(); elegir(v) }} onMouseEnter={() => setActiva(i)}
                  style={{ minHeight: 44, display: 'flex', alignItems: 'center', padding: '8px 12px', fontSize: 14, cursor: 'pointer', overflowWrap: 'anywhere', background: i === activa ? '#eef2ff' : 'transparent' }}>
                  <strong style={{ marginRight: 6 }}>{v.tipo}</strong> {v.nombre}
                </li>
              ))}
            </ul>
          )}
          {viaVigente && <span style={nota}>Calle oficial del Catastro: {viaVigente.tipo} {viaVigente.nombre}</span>}
          {avisoVias && <span role="status" style={{ ...nota, color: '#b45309' }}>Sin sugerencias de calle ahora: escribe la calle a mano.</span>}
        </div>
      )}
      <div role="status" style={{ gridColumn: '1 / -1', ...nota, color: lectura.estado === 'error' ? '#b45309' : '#64748b' }}>
        {lectura.estado === 'consultando' ? 'Consultando el código postal…'
          : lectura.estado === 'error' ? 'No se ha podido leer el código postal ahora: escribe provincia y municipio a mano.'
          : lectura.estado === 'ok' && lectura.municipios === null ? 'Ese código postal no está en la tabla: escribe el municipio a mano.'
          : legado ? 'Municipio guardado antes (texto libre): se mantiene; cambia el código postal para validarlo.'
          : !cpValido ? 'Con el código postal salen la provincia y el municipio.'
          : ''}
      </div>
    </div>
  )
}
