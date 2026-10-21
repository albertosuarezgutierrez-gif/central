'use client'

// Dirección postal con el CÓDIGO POSTAL PRIMERO (20/10/2026): CP → provincia automática + desplegable de municipios → calle
// autocompletada con el callejero del Catastro → número. Nunca un municipio/provincia por defecto. Compartido por la factura
// con cliente, el alta fiscal del onboarding y las direcciones de entrega (tienda pública y pedido rápido).
// Es controlado: el padre guarda {calle, cp, municipio} y compone el texto con `componerDireccion` (lib/direccion-cp.ts).
// Los endpoints (`/api/direccion/*`) son públicos con límite por IP; si fallan, la calle y el municipio se escriben a mano
// (un fallo de red no bloquea un pedido ni inventa datos).
import { useEffect, useId, useRef, useState } from 'react'
import { cpCompleto, decidirCiudad, nombreCalleEscrito, normVia, provinciaPorCp } from '@central/core-direccion'
import type { PartesDireccion } from '@/lib/direccion-cp'

type Via = { tipo: string; nombre: string }
type Lectura = { estado: 'vacio' | 'consultando' | 'error' } | { estado: 'ok'; municipios: string[] | null }

export type EstiloDireccion = {
  input: React.CSSProperties
  label: React.CSSProperties
  texto: string
  tenue: string
  aviso: string
  borde: string
  fondo: string
  hover: string
}

export default function DireccionCp({ valor, onChange, estilo, etiquetaCalle = 'Calle y número', placeholderCalle = 'Calle Mayor 1, 2º B', autoFocus = false }: {
  valor: PartesDireccion
  onChange: (v: PartesDireccion) => void
  estilo: EstiloDireccion
  etiquetaCalle?: string
  placeholderCalle?: string
  autoFocus?: boolean
}) {
  const { cp, municipio, calle } = valor
  const cpValido = cpCompleto(cp)
  const provincia = cpValido ? (provinciaPorCp(cp) ?? '') : ''
  const [lectura, setLectura] = useState<Lectura>({ estado: 'vacio' })
  const [sugeridas, setSugeridas] = useState<Via[]>([])
  const [abierto, setAbierto] = useState(false)
  const [activa, setActiva] = useState(-1)
  const [elegida, setElegida] = useState<Via | null>(null)
  const [avisoVias, setAvisoVias] = useState(false)
  const id = useId()
  const cajaRef = useRef<HTMLDivElement>(null)
  // El padre puede sustituir el valor entero (cliente elegido, reset): la lectura se rehace con el CP vigente.
  const valorRef = useRef(valor)
  valorRef.current = valor
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  useEffect(() => {
    if (!cpValido) { setLectura({ estado: 'vacio' }); return }
    let vivo = true
    setLectura({ estado: 'consultando' })
    fetch(`/api/direccion/cp?cp=${cp.trim()}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j: { municipios: string[] | null }) => {
        if (!vivo) return
        setLectura({ estado: 'ok', municipios: j.municipios })
        const v = valorRef.current
        const d = decidirCiudad(j.municipios, v.municipio)
        if (d && d.ciudad !== v.municipio) onChangeRef.current({ ...v, municipio: d.ciudad })
      })
      .catch(() => { if (vivo) setLectura({ estado: 'error' }) })
    return () => { vivo = false }
  }, [cp, cpValido])

  const viaVigente = elegida && normVia(calle).includes(normVia(elegida.nombre)) ? elegida : null

  useEffect(() => {
    const nombre = nombreCalleEscrito(calle)
    if (!municipio.trim() || !provincia || nombre.replace(/[^A-ZÑ0-9]/gi, '').length < 2 || viaVigente) { setSugeridas([]); return }
    let vivo = true
    const ctl = new AbortController()
    const t = setTimeout(() => {
      fetch(`/api/direccion/vias?${new URLSearchParams({ provincia, municipio, q: calle })}`, { signal: ctl.signal })
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
        .then((j: { vias: Via[]; disponible?: boolean }) => {
          if (!vivo) return
          setSugeridas(j.vias ?? []); setActiva(-1); setAvisoVias(j.disponible === false)
        })
        .catch((e) => { if (vivo && e?.name !== 'AbortError') { setSugeridas([]); setAvisoVias(true) } })
    }, 300)
    return () => { vivo = false; clearTimeout(t); ctl.abort() }
  }, [calle, municipio, provincia, viaVigente])

  useEffect(() => {
    const fuera = (e: MouseEvent) => { if (cajaRef.current && !cajaRef.current.contains(e.target as Node)) setAbierto(false) }
    document.addEventListener('mousedown', fuera)
    return () => document.removeEventListener('mousedown', fuera)
  }, [])

  function elegir(v: Via) {
    const i = calle.search(/[,;]|\d/)
    const cola = i >= 0 ? calle.slice(i) : ''
    onChange({ ...valor, calle: `${v.tipo} ${v.nombre} ${cola}`.replace(/\s+$/, ' ').replace(/ +,/g, ',') })
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
  const eligeDeLista = lista !== null && lista.length > 1
  const unico = lista !== null && lista.length === 1
  const nota = lectura.estado === 'consultando' ? 'Consultando el código postal…'
    : lectura.estado === 'error' ? 'No se ha podido leer el código postal ahora: escribe el municipio a mano.'
    : lectura.estado === 'ok' && lectura.municipios === null ? 'Ese código postal no está en la tabla: escribe el municipio a mano.'
    : !cpValido ? 'Con el código postal salen la provincia y el municipio.'
    : ''
  const peque: React.CSSProperties = { fontSize: 12, color: estilo.tenue, marginTop: 4 }
  const campo: React.CSSProperties = { minWidth: 0 }
  const inp: React.CSSProperties = { ...estilo.input, minHeight: 44, width: '100%', boxSizing: 'border-box', fontSize: 16 }

  return (
    <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'minmax(0, 1fr)' }}>
      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 140px), 1fr))' }}>
        <div style={campo}>
          <label style={estilo.label}>Código postal *</label>
          <input
            style={inp} inputMode="numeric" maxLength={5} placeholder="41003" autoComplete="postal-code" autoFocus={autoFocus}
            value={cp} onChange={(e) => onChange({ ...valor, cp: e.target.value.replace(/\D/g, '').slice(0, 5), ...(cpCompleto(e.target.value) ? {} : { municipio: '' }) })}
          />
        </div>
        <div style={campo}>
          <label style={estilo.label}>Provincia</label>
          <input style={{ ...inp, opacity: 0.8 }} value={provincia} readOnly tabIndex={-1} placeholder="Sale del código postal" />
        </div>
        <div style={campo}>
          <label style={estilo.label}>Municipio *</label>
          {eligeDeLista ? (
            <select style={inp} value={municipio} onChange={(e) => onChange({ ...valor, municipio: e.target.value })}>
              <option value="">Elige el municipio</option>
              {lista!.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          ) : (
            <input
              style={{ ...inp, ...(unico ? { opacity: 0.8 } : {}) }} value={municipio} readOnly={unico}
              onChange={(e) => onChange({ ...valor, municipio: e.target.value })} placeholder={cpValido ? '' : 'Sale del código postal'}
              disabled={!cpValido}
            />
          )}
        </div>
      </div>
      <div ref={cajaRef} style={{ ...campo, position: 'relative' }}>
        <label htmlFor={`${id}-calle`} style={estilo.label}>{etiquetaCalle} *</label>
        <input
          id={`${id}-calle`} style={inp} placeholder={placeholderCalle} value={calle} autoComplete="off" disabled={!cpValido || !municipio.trim()}
          role="combobox" aria-expanded={abierto && sugeridas.length > 0} aria-controls={`${id}-lista`} aria-autocomplete="list"
          aria-activedescendant={activa >= 0 ? `${id}-${activa}` : undefined}
          onChange={(e) => { onChange({ ...valor, calle: e.target.value }); setAbierto(true) }}
          onFocus={() => setAbierto(true)} onKeyDown={teclas}
        />
        {abierto && sugeridas.length > 0 && (
          <ul id={`${id}-lista`} role="listbox" aria-label="Calles del Catastro" style={{
            position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 30, margin: '2px 0 0', padding: 0, listStyle: 'none',
            background: estilo.fondo, border: `1px solid ${estilo.borde}`, borderRadius: 8, maxHeight: 'min(50vh, 400px)', overflowY: 'auto',
            boxShadow: '0 6px 18px rgba(0,0,0,.25)',
          }}>
            {sugeridas.map((v, i) => (
              <li
                key={`${v.tipo}|${v.nombre}`} id={`${id}-${i}`} role="option" aria-selected={i === activa}
                onMouseDown={(e) => { e.preventDefault(); elegir(v) }} onMouseEnter={() => setActiva(i)}
                style={{ minHeight: 44, display: 'flex', alignItems: 'center', padding: '8px 12px', fontSize: 14, color: estilo.texto, cursor: 'pointer', overflowWrap: 'anywhere', background: i === activa ? estilo.hover : 'transparent' }}
              >
                <strong style={{ marginRight: 6 }}>{v.tipo}</strong> {v.nombre}
              </li>
            ))}
          </ul>
        )}
        {viaVigente && <div style={peque}>Calle oficial del Catastro: {viaVigente.tipo} {viaVigente.nombre}</div>}
        {avisoVias && <div role="status" style={{ ...peque, color: estilo.aviso }}>Sin sugerencias de calle ahora: escribe la calle a mano.</div>}
      </div>
      {nota && <div role="status" style={{ ...peque, marginTop: 0, color: lectura.estado === 'error' ? estilo.aviso : estilo.tenue }}>{nota}</div>}
    </div>
  )
}
