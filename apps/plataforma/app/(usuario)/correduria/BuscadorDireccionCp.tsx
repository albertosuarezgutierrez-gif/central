'use client'

// Buscador por DIRECCIÓN con el código postal PRIMERO (20/10/2026): el CP da la provincia sola y el municipio sale de una lista.
// Compartido por `hogar-nuevo` y por cualquier pantalla que busque una vivienda en el Catastro. GET puro: al enviar viaja
// `direccion`, `cp`, `municipio` y `provincia` (y `oportunidad` si la hay), como el formulario que sustituye.
//
// 🚨 Nunca un municipio inventado: sin CP, provincia y municipio quedan VACÍOS. Un CP que la tabla no conoce (`municipios: null`)
// NO es «sin municipios»: se escribe a mano. Un fallo de red al consultar el CP tampoco inventa nada.
import { useEffect, useId, useRef, useState } from 'react'
import { nombreCalleEscrito, viaSigueVigente, componerDireccionConVia } from '@central/core-catastro'
import { btnStyle } from '@/components/ui'

const input: React.CSSProperties = {
  padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 16, minHeight: 44,
  background: 'var(--surface)', color: 'var(--text)', width: '100%', minWidth: 0,
}
const etiqueta: React.CSSProperties = { display: 'grid', gap: 4, fontSize: 13, fontWeight: 600, minWidth: 0 }

type Cp = { estado: 'vacio' } | { estado: 'consultando' } | { estado: 'ok'; municipios: string[] | null; provincia: string | null } | { estado: 'error' }

type Via = { tipo: string; nombre: string }

export default function BuscadorDireccionCp({ accion, oportunidad, direccion, cp: cpInicial, municipio: municipioInicial, provincia: provinciaInicial }: {
  accion: string
  oportunidad: string | null
  direccion: string
  cp: string
  municipio: string
  provincia: string
}) {
  const [cp, setCp] = useState(cpInicial)
  const [municipio, setMunicipio] = useState(municipioInicial)
  const [provincia, setProvincia] = useState(provinciaInicial)
  const [lectura, setLectura] = useState<Cp>({ estado: 'vacio' })
  // Autocompletado de la CALLE con el callejero real del Catastro (servidor). Es una ayuda: nunca bloquea escribir.
  const [texto, setTexto] = useState(direccion)
  const [sugeridas, setSugeridas] = useState<Via[]>([])
  const [abierto, setAbierto] = useState(false)
  const [activa, setActiva] = useState(-1)
  const [elegida, setElegida] = useState<Via | null>(null)
  const [avisoVias, setAvisoVias] = useState(false)
  const idLista = useId()
  const cajaRef = useRef<HTMLDivElement>(null)
  const cpValido = /^\d{5}$/.test(cp.trim())

  useEffect(() => {
    if (!cpValido) { setLectura({ estado: 'vacio' }); return }
    let vivo = true
    setLectura({ estado: 'consultando' })
    fetch(`/api/correduria/codigo-postal?cp=${cp.trim()}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j: { municipios: string[] | null; provincia: string | null }) => {
        if (!vivo) return
        setLectura({ estado: 'ok', municipios: j.municipios, provincia: j.provincia })
        // La provincia es la del CP (siempre que el CP la dé); el municipio solo se fija solo si el CP tiene uno.
        if (j.provincia) setProvincia(j.provincia)
        if (j.municipios && j.municipios.length === 1) setMunicipio(j.municipios[0])
        else if (j.municipios && !j.municipios.includes(municipioInicial)) setMunicipio((m) => (j.municipios!.includes(m) ? m : ''))
      })
      .catch(() => { if (vivo) setLectura({ estado: 'error' }) })
    return () => { vivo = false }
    // `municipioInicial` solo es el valor de partida: no debe relanzar la consulta.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cp, cpValido])

  // La calle elegida solo vale mientras el texto siga empezando por ella : si lo reescribe, vuelve al texto libre.
  const viaVigente = viaSigueVigente(texto, elegida) ? elegida : null
  // Otro CP, municipio o provincia = otro callejero: la calle elegida deja de valer.
  useEffect(() => { setElegida(null) }, [cp, municipio, provincia])

  useEffect(() => {
    const nombre = nombreCalleEscrito(texto)
    if (!municipio.trim() || !provincia.trim() || nombre.replace(/[^A-ZÑ0-9]/gi, '').length < 2 || viaVigente) { setSugeridas([]); return }
    let vivo = true
    const ctl = new AbortController()
    const t = setTimeout(() => {
      fetch(`/api/correduria/catastro/vias?${new URLSearchParams({ provincia, municipio, q: texto })}`, { signal: ctl.signal })
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
        .then((j: { vias: Via[] }) => { if (vivo) { setSugeridas(j.vias); setActiva(-1); setAvisoVias(false) } })
        .catch((e) => { if (vivo && e?.name !== 'AbortError') { setSugeridas([]); setAvisoVias(true) } })
    }, 300)
    return () => { vivo = false; clearTimeout(t); ctl.abort() }
  }, [texto, municipio, provincia, viaVigente])

  useEffect(() => {
    const fuera = (e: MouseEvent) => { if (cajaRef.current && !cajaRef.current.contains(e.target as Node)) setAbierto(false) }
    document.addEventListener('mousedown', fuera)
    return () => document.removeEventListener('mousedown', fuera)
  }, [])

  function elegir(v: Via) {
    // Se conserva el portal/piso ya escrito: «parra 12» → «CL PARRA LA (VENTAS CARRIZA) 12».
    setTexto(componerDireccionConVia(texto, v))
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

  const lista = lectura.estado === 'ok' ? lectura.municipios : null
  const eligeDeLista = lista !== null && lista.length > 1
  const listo = municipio.trim() !== '' && provincia.trim() !== ''
  return (
    <form method="get" action={accion} style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))' }}>
      {oportunidad && <input type="hidden" name="oportunidad" value={oportunidad} />}
      <label style={etiqueta}>Código postal (primero)
        <input style={input} name="cp" inputMode="numeric" maxLength={5} placeholder="41003" value={cp} autoFocus onChange={(e) => setCp(e.target.value.replace(/\D/g, ''))} />
      </label>
      <label style={etiqueta}>Provincia
        <input style={input} name="provincia" value={provincia} onChange={(e) => setProvincia(e.target.value)} placeholder={cpValido ? '' : 'Sale del código postal'} />
      </label>
      <label style={etiqueta}>Municipio
        {eligeDeLista ? (
          <select style={input} name="municipio" value={municipio} onChange={(e) => setMunicipio(e.target.value)} required>
            <option value="">Elige el municipio</option>
            {lista!.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        ) : (
          <input style={input} name="municipio" value={municipio} onChange={(e) => setMunicipio(e.target.value)} required placeholder={cpValido ? '' : 'Sale del código postal'} />
        )}
      </label>
      <div ref={cajaRef} style={{ ...etiqueta, gridColumn: '1 / -1', position: 'relative' }}>
        <label htmlFor={`${idLista}-calle`} style={{ display: 'grid', gap: 4 }}>Calle y número
          <input
            id={`${idLista}-calle`} style={input} name="direccion" placeholder="Calle San Vicente 40, 2º 14" value={texto} required autoComplete="off"
            role="combobox" aria-expanded={abierto && sugeridas.length > 0} aria-controls={idLista} aria-autocomplete="list"
            aria-activedescendant={activa >= 0 ? `${idLista}-${activa}` : undefined}
            onChange={(e) => { setTexto(e.target.value); setAbierto(true) }}
            onFocus={() => setAbierto(true)} onKeyDown={teclas}
          />
        </label>
        {viaVigente && <input type="hidden" name="via" value={viaVigente.nombre} />}
        {viaVigente && <input type="hidden" name="tipoVia" value={viaVigente.tipo} />}
        {abierto && sugeridas.length > 0 && (
          <ul id={idLista} role="listbox" aria-label="Calles del Catastro" style={{
            position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20, margin: '2px 0 0', padding: 0, listStyle: 'none',
            background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, maxHeight: 'min(60vh, 480px)', overflowY: 'auto',
            boxShadow: '0 6px 18px rgba(0,0,0,.15)',
          }}>
            {sugeridas.map((v, i) => (
              <li
                key={`${v.tipo}|${v.nombre}`} id={`${idLista}-${i}`} role="option" aria-selected={i === activa}
                onMouseDown={(e) => { e.preventDefault(); elegir(v) }} onMouseEnter={() => setActiva(i)}
                style={{ minHeight: 44, display: 'flex', alignItems: 'center', padding: '8px 12px', fontSize: 14, cursor: 'pointer', overflowWrap: 'anywhere', background: i === activa ? 'var(--border)' : 'transparent' }}
              >
                <strong style={{ marginRight: 6 }}>{v.tipo}</strong> {v.nombre}
              </li>
            ))}
          </ul>
        )}
        {viaVigente && <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 400 }}>Calle oficial del Catastro: {viaVigente.tipo} {viaVigente.nombre}</span>}
        {avisoVias && <span role="status" style={{ fontSize: 12, color: 'var(--warning)', fontWeight: 400 }}>Sin sugerencias de calle ahora: escribe la calle a mano.</span>}
      </div>
      <div role="status" style={{ gridColumn: '1 / -1', fontSize: 12, color: lectura.estado === 'error' ? 'var(--warning)' : 'var(--muted)' }}>
        {lectura.estado === 'consultando' ? 'Consultando el código postal…'
          : lectura.estado === 'error' ? 'No se ha podido leer el código postal ahora: escribe la provincia y el municipio a mano.'
          : lectura.estado === 'ok' && lectura.municipios === null ? 'Ese código postal no está en la tabla: escribe el municipio a mano.'
          : !cpValido ? 'Con el código postal salen la provincia y el municipio; sin él, hay que escribirlos.'
          : ''}
      </div>
      <button type="submit" disabled={!listo} style={{ ...btnStyle('primario'), gridColumn: '1 / -1', minHeight: 44 }}>Consultar Catastro</button>
    </form>
  )
}
