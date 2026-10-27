'use client'

// Formulario de DATOS FISCALES del huésped para su factura. Lo usan el enlace público /factura/[token] (el huésped, sin
// login) y el alta manual de /sivra/facturas (Alberto). Controlado: no envía nada por sí mismo, llama a `onEnviar`.
//
// Dirección (regla del CLAUDE.md raíz): España → CÓDIGO POSTAL primero → provincia sola → municipio de la lista →
// calle autocompletada con el callejero del Catastro → número. Misma lógica que `correduria/BuscadorDireccionCp.tsx`
// (helpers de `@central/core-catastro`), pero sin formulario GET y con los endpoints que se le pasan (el público va
// atado al token). Fuera de España la dirección es LIBRE: no hay callejero común para el resto del mundo.
// Nunca un municipio/provincia por defecto: sin CP quedan vacíos.
import { useEffect, useId, useRef, useState } from 'react'
import { nombreCalleEscrito, viaSigueVigente, componerDireccionConVia } from '@central/core-catastro'
import { btnStyle } from '@/components/ui'
import { PAISES } from '@/lib/sivra/facturas/receptor'

const input: React.CSSProperties = {
  padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 16, minHeight: 44,
  background: 'var(--surface)', color: 'var(--text)', width: '100%', minWidth: 0, boxSizing: 'border-box',
}
const etiqueta: React.CSSProperties = { display: 'grid', gap: 4, fontSize: 13, fontWeight: 600, minWidth: 0 }
const rejilla: React.CSSProperties = { display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))' }
const ancho: React.CSSProperties = { gridColumn: '1 / -1' }
const error: React.CSSProperties = { color: 'var(--negative)', fontSize: 12, fontWeight: 400 }

export type DatosFiscales = {
  tipo: 'empresa' | 'particular'
  nombre: string
  nif: string
  pais: string
  email: string
  direccion: Record<string, string | boolean>
  web?: string
}
export type RespuestaEnvio = { ok: true } | { ok: false; error: string; errores?: Record<string, string> }

type Cp = { estado: 'vacio' } | { estado: 'consultando' } | { estado: 'ok'; municipios: string[] | null; provincia: string | null } | { estado: 'error' }
type Via = { tipo: string; nombre: string }

export default function DatosFiscalesForm({ urlCp, urlVias, onEnviar, textoBoton, bilingue = true }: {
  /** Recibe el CP y devuelve la URL a consultar ({ municipios, provincia }). */
  urlCp: (cp: string) => string
  /** Recibe provincia, municipio y texto; devuelve la URL ({ vias }). */
  urlVias: (provincia: string, municipio: string, q: string) => string
  onEnviar: (d: DatosFiscales) => Promise<RespuestaEnvio>
  textoBoton?: string
  bilingue?: boolean
}) {
  const t = (es: string, en: string) => (bilingue ? `${es} / ${en}` : es)
  const [tipo, setTipo] = useState<'empresa' | 'particular'>('empresa')
  const [nombre, setNombre] = useState('')
  const [nif, setNif] = useState('')
  const [pais, setPais] = useState('ES')
  const [email, setEmail] = useState('')
  const [web, setWeb] = useState('')
  // España
  const [cp, setCp] = useState('')
  const [provincia, setProvincia] = useState('')
  const [municipio, setMunicipio] = useState('')
  const [lectura, setLectura] = useState<Cp>({ estado: 'vacio' })
  const [calle, setCalle] = useState('')
  const [numero, setNumero] = useState('')
  const [resto, setResto] = useState('')
  const [sugeridas, setSugeridas] = useState<Via[]>([])
  const [abierto, setAbierto] = useState(false)
  const [activa, setActiva] = useState(-1)
  const [elegida, setElegida] = useState<Via | null>(null)
  const [avisoVias, setAvisoVias] = useState(false)
  // Extranjero
  const [lineas, setLineas] = useState('')
  const [ciudad, setCiudad] = useState('')
  const [cpExt, setCpExt] = useState('')

  const [enviando, setEnviando] = useState(false)
  const [errores, setErrores] = useState<Record<string, string>>({})
  const [mensaje, setMensaje] = useState<string | null>(null)
  const idLista = useId()
  const cajaRef = useRef<HTMLDivElement>(null)
  const espana = pais === 'ES'
  const cpValido = /^\d{5}$/.test(cp)

  useEffect(() => {
    if (!espana || !cpValido) { setLectura({ estado: 'vacio' }); return }
    let vivo = true
    setLectura({ estado: 'consultando' })
    fetch(urlCp(cp))
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j: { municipios: string[] | null; provincia: string | null }) => {
        if (!vivo) return
        setLectura({ estado: 'ok', municipios: j.municipios, provincia: j.provincia })
        if (j.provincia) setProvincia(j.provincia)
        if (j.municipios && j.municipios.length === 1) setMunicipio(j.municipios[0])
        else if (j.municipios) setMunicipio((m) => (j.municipios!.includes(m) ? m : ''))
      })
      .catch(() => { if (vivo) setLectura({ estado: 'error' }) })
    return () => { vivo = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cp, cpValido, espana])

  const viaVigente = viaSigueVigente(calle, elegida) ? elegida : null
  useEffect(() => { setElegida(null) }, [cp, municipio, provincia])

  useEffect(() => {
    const n = nombreCalleEscrito(calle)
    if (!espana || !municipio.trim() || !provincia.trim() || n.replace(/[^A-ZÑ0-9]/gi, '').length < 2 || viaVigente) { setSugeridas([]); return }
    let vivo = true
    const ctl = new AbortController()
    const h = setTimeout(() => {
      fetch(urlVias(provincia, municipio, calle), { signal: ctl.signal })
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
        .then((j: { vias: Via[] }) => { if (vivo) { setSugeridas(j.vias); setActiva(-1); setAvisoVias(false) } })
        .catch((e) => { if (vivo && e?.name !== 'AbortError') { setSugeridas([]); setAvisoVias(true) } })
    }, 300)
    return () => { vivo = false; clearTimeout(h); ctl.abort() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calle, municipio, provincia, viaVigente, espana])

  useEffect(() => {
    const fuera = (e: MouseEvent) => { if (cajaRef.current && !cajaRef.current.contains(e.target as Node)) setAbierto(false) }
    document.addEventListener('mousedown', fuera)
    return () => document.removeEventListener('mousedown', fuera)
  }, [])

  function elegir(v: Via) {
    // El número va en su propia caja: aquí solo la calle oficial (tipo + nombre).
    setCalle(componerDireccionConVia('', v).trimEnd())
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

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    setEnviando(true); setMensaje(null); setErrores({})
    const direccion: Record<string, string | boolean> = espana
      ? { cp, provincia, municipio, via: calle, numero, resto, viaCatastro: !!viaVigente }
      : { lineas, ciudad, cp: cpExt }
    try {
      const r = await onEnviar({ tipo, nombre, nif, pais, email, direccion, web })
      if (!r.ok) { setErrores(r.errores ?? {}); setMensaje(r.error) }
    } catch {
      setMensaje(t('No se ha podido enviar. Inténtalo de nuevo.', 'Could not send. Please try again.'))
    } finally {
      setEnviando(false)
    }
  }

  const lista = lectura.estado === 'ok' ? lectura.municipios : null
  const eligeDeLista = lista !== null && lista.length > 1
  const err = (k: string) => (errores[k] ? <span role="alert" style={error}>{errores[k]}</span> : null)

  return (
    <form onSubmit={enviar} style={{ display: 'grid', gap: 16 }} noValidate>
      <fieldset style={{ border: 0, padding: 0, margin: 0, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <legend style={{ ...etiqueta, marginBottom: 6 }}>{t('La factura va a nombre de', 'Invoice addressed to')}</legend>
        {(['empresa', 'particular'] as const).map((v) => (
          <label key={v} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minHeight: 44, padding: '0 14px', border: '1px solid var(--border)', borderRadius: 8, cursor: 'pointer', background: tipo === v ? 'var(--primary-light)' : 'var(--surface)' }}>
            <input type="radio" name="tipo" value={v} checked={tipo === v} onChange={() => setTipo(v)} />
            {v === 'empresa' ? t('Empresa / autónomo', 'Company') : t('Particular', 'Individual')}
          </label>
        ))}
        {err('tipo')}
      </fieldset>

      <div style={rejilla}>
        <label style={{ ...etiqueta, ...ancho }}>{tipo === 'empresa' ? t('Razón social', 'Company name') : t('Nombre y apellidos', 'Full name')}
          <input style={input} value={nombre} onChange={(e) => setNombre(e.target.value)} autoComplete={tipo === 'empresa' ? 'organization' : 'name'} maxLength={150} required />
          {err('nombre')}
        </label>
        <label style={etiqueta}>{t('País', 'Country')}
          <select style={input} value={pais} onChange={(e) => setPais(e.target.value)}>
            {PAISES.map(([c, n]) => <option key={c} value={c}>{n}</option>)}
          </select>
          {err('pais')}
        </label>
        <label style={etiqueta}>{espana ? 'NIF / NIE / CIF' : t('Identificación fiscal (VAT)', 'Tax ID (VAT)')}
          <input style={input} value={nif} onChange={(e) => setNif(e.target.value.toUpperCase())} autoComplete="off" maxLength={30} required />
          {err('nif')}
        </label>
        <label style={{ ...etiqueta, ...ancho }}>{t('Correo para enviarte la factura', 'Email to send the invoice')}
          <input style={input} type="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" maxLength={200} required />
          {err('email')}
        </label>
      </div>

      {espana ? (
        <div style={rejilla}>
          <label style={etiqueta}>Código postal (primero)
            <input style={input} inputMode="numeric" maxLength={5} placeholder="41003" value={cp} onChange={(e) => setCp(e.target.value.replace(/\D/g, ''))} autoComplete="postal-code" required />
            {err('direccion.cp')}
          </label>
          <label style={etiqueta}>Provincia
            <input style={input} value={provincia} onChange={(e) => setProvincia(e.target.value)} placeholder={cpValido ? '' : 'Sale del código postal'} required />
            {err('direccion.provincia')}
          </label>
          <label style={etiqueta}>Municipio
            {eligeDeLista ? (
              <select style={input} value={municipio} onChange={(e) => setMunicipio(e.target.value)} required>
                <option value="">Elige el municipio</option>
                {lista!.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            ) : (
              <input style={input} value={municipio} onChange={(e) => setMunicipio(e.target.value)} placeholder={cpValido ? '' : 'Sale del código postal'} required />
            )}
            {err('direccion.municipio')}
          </label>
          <div ref={cajaRef} style={{ ...etiqueta, ...ancho, position: 'relative' }}>
            <label htmlFor={`${idLista}-calle`} style={{ display: 'grid', gap: 4 }}>Calle
              <input
                id={`${idLista}-calle`} style={input} placeholder="Calle Socorro" value={calle} required autoComplete="off"
                role="combobox" aria-expanded={abierto && sugeridas.length > 0} aria-controls={idLista} aria-autocomplete="list"
                aria-activedescendant={activa >= 0 ? `${idLista}-${activa}` : undefined}
                onChange={(e) => { setCalle(e.target.value); setAbierto(true) }} onFocus={() => setAbierto(true)} onKeyDown={teclas}
              />
            </label>
            {abierto && sugeridas.length > 0 && (
              <ul id={idLista} role="listbox" aria-label="Calles del Catastro" style={{
                position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20, margin: '2px 0 0', padding: 0, listStyle: 'none',
                background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, maxHeight: 'min(60vh, 480px)', overflowY: 'auto', boxShadow: 'var(--shadow)',
              }}>
                {sugeridas.map((v, i) => (
                  <li key={`${v.tipo}|${v.nombre}`} id={`${idLista}-${i}`} role="option" aria-selected={i === activa}
                    onMouseDown={(e) => { e.preventDefault(); elegir(v) }} onMouseEnter={() => setActiva(i)}
                    style={{ minHeight: 44, display: 'flex', alignItems: 'center', padding: '8px 12px', fontSize: 14, cursor: 'pointer', overflowWrap: 'anywhere', background: i === activa ? 'var(--border)' : 'transparent' }}>
                    <strong style={{ marginRight: 6 }}>{v.tipo}</strong> {v.nombre}
                  </li>
                ))}
              </ul>
            )}
            {viaVigente && <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 400 }}>Calle oficial del Catastro: {viaVigente.tipo} {viaVigente.nombre}</span>}
            {avisoVias && <span role="status" style={{ fontSize: 12, color: 'var(--warning)', fontWeight: 400 }}>Sin sugerencias de calle ahora: escríbela a mano.</span>}
            {err('direccion.via')}
          </div>
          <label style={etiqueta}>Número
            <input style={input} value={numero} onChange={(e) => setNumero(e.target.value.toUpperCase())} placeholder="24 o S/N" maxLength={12} required />
            {err('direccion.numero')}
          </label>
          <label style={etiqueta}>Piso, puerta… (opcional)
            <input style={input} value={resto} onChange={(e) => setResto(e.target.value)} maxLength={60} />
          </label>
          <div role="status" style={{ ...ancho, fontSize: 12, color: lectura.estado === 'error' ? 'var(--warning)' : 'var(--muted)' }}>
            {lectura.estado === 'consultando' ? 'Consultando el código postal…'
              : lectura.estado === 'error' ? 'No se ha podido leer el código postal ahora: escribe la provincia y el municipio.'
              : lectura.estado === 'ok' && lectura.municipios === null ? 'Ese código postal no está en la tabla: escribe el municipio.'
              : !cpValido ? 'Con el código postal salen la provincia y el municipio.' : ''}
          </div>
        </div>
      ) : (
        <div style={rejilla}>
          <label style={{ ...etiqueta, ...ancho }}>{t('Dirección (calle y número)', 'Address (street and number)')}
            <input style={input} value={lineas} onChange={(e) => setLineas(e.target.value)} autoComplete="street-address" maxLength={200} required />
            {err('direccion.lineas')}
          </label>
          <label style={etiqueta}>{t('Ciudad', 'City')}
            <input style={input} value={ciudad} onChange={(e) => setCiudad(e.target.value)} autoComplete="address-level2" maxLength={80} required />
            {err('direccion.ciudad')}
          </label>
          <label style={etiqueta}>{t('Código postal', 'Postcode')}
            <input style={input} value={cpExt} onChange={(e) => setCpExt(e.target.value)} autoComplete="postal-code" maxLength={12} />
          </label>
        </div>
      )}

      {/* Honeypot: invisible para personas. */}
      <input type="text" name="web" value={web} onChange={(e) => setWeb(e.target.value)} tabIndex={-1} autoComplete="off" aria-hidden="true" style={{ position: 'absolute', left: '-9999px', width: 1, height: 1, opacity: 0 }} />

      {mensaje && <div role="alert" style={{ color: 'var(--negative)', fontSize: 14 }}>{mensaje}</div>}
      <button type="submit" disabled={enviando} style={{ ...btnStyle('primario'), minHeight: 44, width: '100%' }}>
        {enviando ? t('Enviando…', 'Sending…') : (textoBoton ?? t('Enviar datos', 'Send details'))}
      </button>
    </form>
  )
}
