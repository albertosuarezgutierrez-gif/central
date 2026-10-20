'use client'

// Dirección postal con el CP PRIMERO: CP → provincia automática + desplegable de municipios → calle del callejero del Catastro → número.
// Emite al padre el texto canónico «Calle Nº, CP Municipio (Provincia)» (o '' mientras esté incompleta: nunca a medias).
// Nunca municipio/provincia por defecto. Un CP desconocido (`municipios: null`) NO es «sin municipios»: se escribe a mano.
// `permitirNodo`: una parada puede ser un nodo (almacén/cliente) en vez de una dirección: texto con el nombre del nodo.
// Datos ya guardados se muestran tal cual hasta que se pulsa «Cambiar».
import { useEffect, useId, useRef, useState } from 'react'
import { decidirCiudad, cpCompleto, normVia, nombreCalleEscrito } from '@central/core-direccion'
import { componerDireccion, componerExtranjera, valorAEmitir } from '@/lib/direccion-texto'

const campo: React.CSSProperties = { minHeight: 44, fontSize: 16, width: '100%', minWidth: 0 }
const etiqueta: React.CSSProperties = { display: 'grid', gap: 4, fontSize: 13, minWidth: 0 }
const enlace: React.CSSProperties = { cursor: 'pointer', minHeight: 44, display: 'inline-flex', alignItems: 'center', fontSize: 13 }

type Via = { tipo: string; nombre: string }
type Modo = 'guardada' | 'direccion' | 'nodo' | 'fuera'

export function DireccionCp({ value, onChange, etiquetaCampo, permitirNodo = false }: {
  value: string
  onChange: (texto: string) => void
  etiquetaCampo?: string
  permitirNodo?: boolean
}) {
  const previo = useRef(value).current // valor guardado al montar: no se pisa con '' jamás
  const [modo, setModo] = useState<Modo>(value.trim() ? 'guardada' : 'direccion')
  const [pais, setPais] = useState('')
  const [textoFuera, setTextoFuera] = useState('')
  const [textoNodo, setTextoNodo] = useState('')
  const [cp, setCp] = useState('')
  const [provincia, setProvincia] = useState('')
  const [municipio, setMunicipio] = useState('')
  const [lista, setLista] = useState<string[] | null>(null)
  const [estadoCp, setEstadoCp] = useState<'vacio' | 'consultando' | 'ok' | 'error'>('vacio')
  const [calle, setCalle] = useState('')
  const [numero, setNumero] = useState('')
  const [sugeridas, setSugeridas] = useState<Via[]>([])
  const [abierto, setAbierto] = useState(false)
  const [activa, setActiva] = useState(-1)
  const [elegida, setElegida] = useState<Via | null>(null)
  const [avisoVias, setAvisoVias] = useState(false)
  const id = useId()
  const cajaRef = useRef<HTMLDivElement>(null)
  const emitir = useRef(onChange)
  emitir.current = onChange
  const cpValido = cpCompleto(cp)

  // CP → provincia (siempre la del CP) y municipios.
  useEffect(() => {
    if (modo !== 'direccion') return
    if (!cpValido) { setEstadoCp('vacio'); setLista(null); setProvincia(''); setMunicipio(''); return }
    let vivo = true
    setEstadoCp('consultando')
    fetch(`/api/direccion/cp?cp=${cp.trim()}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j: { municipios: string[] | null; provincia: string | null }) => {
        if (!vivo) return
        setEstadoCp('ok')
        setLista(j.municipios)
        setProvincia(j.provincia ?? '')
        const d = decidirCiudad(j.municipios, '')
        setMunicipio(d && !d.elegir ? d.ciudad : '')
      })
      .catch(() => { if (vivo) { setEstadoCp('error'); setLista(null) } })
    return () => { vivo = false }
  }, [cp, cpValido, modo])

  const viaVigente = elegida && normVia(calle).includes(normVia(elegida.nombre)) ? elegida : null

  // Autocompletado de la calle (ayuda: nunca bloquea escribir).
  useEffect(() => {
    const nombre = nombreCalleEscrito(calle)
    if (modo !== 'direccion' || !municipio.trim() || !provincia.trim() || nombre.replace(/[^A-ZÑ0-9]/gi, '').length < 2 || viaVigente) { setSugeridas([]); return }
    let vivo = true
    const ctl = new AbortController()
    const t = setTimeout(() => {
      fetch(`/api/direccion/vias?${new URLSearchParams({ provincia, municipio, q: calle })}`, { signal: ctl.signal })
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
        .then((j: { vias: Via[] }) => { if (vivo) { setSugeridas(j.vias); setActiva(-1); setAvisoVias(false) } })
        .catch((e) => { if (vivo && e?.name !== 'AbortError') { setSugeridas([]); setAvisoVias(true) } })
    }, 300)
    return () => { vivo = false; clearTimeout(t); ctl.abort() }
  }, [calle, municipio, provincia, viaVigente, modo])

  useEffect(() => {
    const fuera = (e: MouseEvent) => { if (cajaRef.current && !cajaRef.current.contains(e.target as Node)) setAbierto(false) }
    document.addEventListener('mousedown', fuera)
    return () => document.removeEventListener('mousedown', fuera)
  }, [])

  // Texto canónico al padre, solo en modo dirección (en «guardada» el valor no se toca; en «nodo» lo emite el input).
  const compuesta = componerDireccion({ calle, numero, cp, municipio, provincia })
  const extranjera = componerExtranjera({ pais, texto: textoFuera })
  useEffect(() => {
    if (modo === 'direccion') emitir.current(valorAEmitir(compuesta, previo))
    else if (modo === 'fuera') emitir.current(valorAEmitir(extranjera, previo))
    else if (modo === 'nodo') emitir.current(valorAEmitir(textoNodo.trim(), previo))
  }, [compuesta, extranjera, textoNodo, modo, previo])

  function elegir(v: Via) {
    setCalle(`${v.tipo} ${v.nombre}`)
    setElegida(v)
    setSugeridas([])
    setAbierto(false)
  }
  function teclas(e: React.KeyboardEvent<HTMLInputElement>) {
    const n = sugeridas.length
    if (!abierto || n === 0) { if (e.key === 'ArrowDown' && n > 0) { setAbierto(true); e.preventDefault() } return }
    if (e.key === 'ArrowDown') { setActiva((a) => (a + 1) % n); e.preventDefault() }
    else if (e.key === 'ArrowUp') { setActiva((a) => (a <= 0 ? n - 1 : a - 1)); e.preventDefault() }
    else if (e.key === 'Enter' && activa >= 0) { elegir(sugeridas[activa]); e.preventDefault() }
    else if (e.key === 'Escape') { setAbierto(false); e.preventDefault() }
  }

  const cabecera = etiquetaCampo ? <div className="muted" style={{ fontSize: 13 }}>{etiquetaCampo}</div> : null
  const alternar = (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
      <label className="muted" style={{ ...enlace, gap: 6 }}>
        <input type="checkbox" style={{ width: 'auto' }} checked={modo === 'fuera'} onChange={(e) => setModo(e.target.checked ? 'fuera' : 'direccion')} /> Fuera de España
      </label>
      {permitirNodo && (
        <a className="muted" style={enlace} onClick={() => setModo(modo === 'nodo' ? 'direccion' : 'nodo')}>
          {modo === 'nodo' ? 'Usar dirección' : 'Es un nodo (almacén / cliente)'}
        </a>
      )}
      {previo.trim() && <a className="muted" style={enlace} onClick={() => { emitir.current(previo); setModo('guardada') }}>Cancelar</a>}
    </div>
  )

  if (modo === 'guardada') {
    return (
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', minWidth: 0 }}>
        {cabecera}
        <span style={{ overflowWrap: 'anywhere', flex: '1 1 160px' }}>{value}</span>
        <a className="muted" style={enlace} onClick={() => setModo('direccion')}>Cambiar</a>
      </div>
    )
  }
  if (modo === 'nodo') {
    return (
      <div style={{ display: 'grid', gap: 4, minWidth: 0 }}>
        {cabecera}
        <input style={campo} placeholder="Nodo (almacén, cliente ya dado de alta)" value={textoNodo} onChange={(e) => setTextoNodo(e.target.value)} />
        {alternar}
      </div>
    )
  }

  if (modo === 'fuera') {
    return (
      <div style={{ display: 'grid', gap: 8, minWidth: 0 }}>
        {cabecera}
        <label style={etiqueta}>País
          <input style={campo} placeholder="Portugal" value={pais} onChange={(e) => setPais(e.target.value)} />
        </label>
        <label style={etiqueta}>Dirección completa
          <input style={campo} placeholder="Rua Augusta 10, 1100-048 Lisboa" value={textoFuera} onChange={(e) => setTextoFuera(e.target.value)} />
        </label>
        {!extranjera && <div role="status" className="muted" style={{ fontSize: 12 }}>Falta el país o la dirección: no se guardará hasta completarlos.</div>}
        {alternar}
      </div>
    )
  }

  const eligeDeLista = lista !== null && lista.length > 1
  return (
    <div style={{ display: 'grid', gap: 8, minWidth: 0 }}>
      {cabecera}
      <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 150px), 1fr))' }}>
        <label style={etiqueta}>Código postal (primero)
          <input style={campo} inputMode="numeric" maxLength={5} placeholder="41003" value={cp} onChange={(e) => setCp(e.target.value.replace(/\D/g, ''))} />
        </label>
        <label style={etiqueta}>Provincia
          <input style={campo} value={provincia} onChange={(e) => setProvincia(e.target.value)} placeholder={cpValido ? '' : 'Sale del código postal'} />
        </label>
        <label style={etiqueta}>Municipio
          {eligeDeLista ? (
            <select style={campo} value={municipio} onChange={(e) => setMunicipio(e.target.value)}>
              <option value="">Elige el municipio</option>
              {lista!.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          ) : (
            <input style={campo} value={municipio} onChange={(e) => setMunicipio(e.target.value)} placeholder={cpValido ? '' : 'Sale del código postal'} />
          )}
        </label>
      </div>
      <div ref={cajaRef} style={{ display: 'grid', gap: 8, gridTemplateColumns: 'minmax(0, 1fr) 90px', position: 'relative' }}>
        <label htmlFor={`${id}-calle`} style={etiqueta}>Calle
          <input
            id={`${id}-calle`} style={campo} placeholder="Calle San Vicente" value={calle} autoComplete="off"
            role="combobox" aria-expanded={abierto && sugeridas.length > 0} aria-controls={id} aria-autocomplete="list"
            aria-activedescendant={activa >= 0 ? `${id}-${activa}` : undefined}
            onChange={(e) => { setCalle(e.target.value); setAbierto(true) }} onFocus={() => setAbierto(true)} onKeyDown={teclas}
          />
        </label>
        <label style={etiqueta}>Nº
          <input style={campo} placeholder="40" value={numero} onChange={(e) => setNumero(e.target.value)} />
        </label>
        {abierto && sugeridas.length > 0 && (
          <ul id={id} role="listbox" aria-label="Calles del Catastro" style={{
            position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20, margin: '2px 0 0', padding: 0, listStyle: 'none',
            background: 'var(--surface, #fff)', border: '1px solid var(--border)', borderRadius: 8, maxHeight: 'min(60vh, 360px)', overflowY: 'auto',
            boxShadow: '0 6px 18px rgba(0,0,0,.15)',
          }}>
            {sugeridas.map((v, i) => (
              <li
                key={`${v.tipo}|${v.nombre}`} id={`${id}-${i}`} role="option" aria-selected={i === activa}
                onMouseDown={(e) => { e.preventDefault(); elegir(v) }} onMouseEnter={() => setActiva(i)}
                style={{ minHeight: 44, display: 'flex', alignItems: 'center', padding: '8px 12px', fontSize: 14, cursor: 'pointer', overflowWrap: 'anywhere', background: i === activa ? 'var(--border)' : 'transparent' }}
              >
                <strong style={{ marginRight: 6 }}>{v.tipo}</strong> {v.nombre}
              </li>
            ))}
          </ul>
        )}
      </div>
      <div role="status" className="muted" style={{ fontSize: 12 }}>
        {estadoCp === 'consultando' ? 'Consultando el código postal…'
          : estadoCp === 'error' ? 'No se ha podido leer el código postal ahora: escribe provincia y municipio a mano.'
          : estadoCp === 'ok' && lista === null ? 'Ese código postal no está en la tabla: escribe el municipio a mano.'
          : !cpValido ? 'Con el código postal salen la provincia y el municipio.'
          : avisoVias ? 'Sin sugerencias de calle ahora: escribe la calle a mano.'
          : viaVigente ? `Calle oficial del Catastro: ${viaVigente.tipo} ${viaVigente.nombre}`
          : !compuesta ? 'Dirección incompleta: no se guardará hasta completar CP, municipio, calle y número.'
          : ''}
      </div>
      {alternar}
    </div>
  )
}
