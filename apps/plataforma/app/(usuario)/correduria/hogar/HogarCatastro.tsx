'use client'

import { useState } from 'react'

type Inmueble = { refCompleta: string; refParcela: string; planta: string | null; puerta: string | null; codigoPostal: string | null }
type Precal = {
  datos: {
    metrosCuadrados: number | null; anioConstruccion: number | null; uso: string | null
    direccion: string | null; localidad: string | null; provincia: string | null; codigoPostal: string | null
    enBloque: boolean | null
  }
  supuestos: { campo: string; porque: string; optimista?: boolean }[]
  faltan: { campo: string; motivo: string }[]
  avisos: string[]
}
type Respuesta =
  | { estado: 'ok'; referencia: string; precalificacion: Precal }
  | { estado: 'elegir'; via: string; inmuebles: Inmueble[] }
  | { estado: 'ambigua' }
  | { estado: 'no_encontrado' }
  | { estado: 'direccion_ilegible' }
  | { estado: 'error'; motivo: string }

const CAMPOS: Record<string, string> = {
  metrosCuadrados: 'm²', anioConstruccion: 'año de construcción', uso: 'uso',
  direccion: 'dirección', localidad: 'localidad', provincia: 'provincia', codigoPostal: 'código postal', enBloque: 'en bloque',
}

export default function HogarCatastro() {
  const [modo, setModo] = useState<'direccion' | 'referencia'>('direccion')
  const [direccion, setDireccion] = useState('')
  const [municipio, setMunicipio] = useState('SEVILLA')
  const [provincia, setProvincia] = useState('SEVILLA')
  const [referencia, setReferencia] = useState('')
  const [cargando, setCargando] = useState(false)
  const [r, setR] = useState<Respuesta | null>(null)

  async function consultar(body: Record<string, string>) {
    setCargando(true)
    try {
      const res = await fetch('/api/correduria/catastro', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
      })
      const json = (await res.json().catch(() => null)) as Respuesta | { error: string } | null
      if (!json || 'error' in json) setR({ estado: 'error', motivo: (json as { error?: string })?.error ?? `HTTP ${res.status}` })
      else setR(json)
    } catch (e) {
      setR({ estado: 'error', motivo: e instanceof Error ? e.message : String(e) })
    } finally {
      setCargando(false)
    }
  }

  function enviar(e: React.FormEvent) {
    e.preventDefault()
    if (modo === 'referencia') void consultar({ referencia })
    else void consultar({ direccion, municipio, provincia })
  }

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <form onSubmit={enviar} style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 14, display: 'grid', gap: 10 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Pestana activa={modo === 'direccion'} onClick={() => setModo('direccion')}>Por dirección</Pestana>
          <Pestana activa={modo === 'referencia'} onClick={() => setModo('referencia')}>Por referencia catastral</Pestana>
        </div>
        {modo === 'direccion' ? (
          <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
            <input style={{ ...input, gridColumn: '1 / -1' }} placeholder="Calle San Vicente 40, 2º 14" value={direccion} onChange={e => setDireccion(e.target.value)} autoFocus />
            <input style={input} placeholder="Municipio" value={municipio} onChange={e => setMunicipio(e.target.value)} />
            <input style={input} placeholder="Provincia" value={provincia} onChange={e => setProvincia(e.target.value)} />
          </div>
        ) : (
          <input style={input} placeholder="Referencia catastral de 20 caracteres" value={referencia} onChange={e => setReferencia(e.target.value)} autoFocus />
        )}
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <button type="submit" disabled={cargando} style={boton}>{cargando ? 'Consultando…' : 'Consultar Catastro'}</button>
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>Gratis: es el servicio público del Catastro, no Codeoscopic.</span>
        </div>
      </form>

      {r && <Resultado r={r} onElegir={(rc) => void consultar({ referencia: rc })} />}
    </div>
  )
}

function Resultado({ r, onElegir }: { r: Respuesta; onElegir: (rc: string) => void }) {
  if (r.estado === 'error') {
    return <Caja tono="error" titulo="⚠️ El Catastro no ha respondido">{r.motivo}. No significa que la vivienda no exista: no se ha podido mirar.</Caja>
  }
  if (r.estado === 'no_encontrado') {
    return <Caja tono="aviso" titulo="No hay nada con esos datos">Se ha consultado y el Catastro no devuelve ningún inmueble. Prueba con la referencia catastral (está en el recibo del IBI).</Caja>
  }
  if (r.estado === 'ambigua') {
    return <Caja tono="aviso" titulo="Hay varias calles parecidas en ese municipio">El callejero no deja elegir una sin riesgo de equivocarse de calle. Escribe el nombre completo de la vía, o usa la referencia catastral.</Caja>
  }
  if (r.estado === 'direccion_ilegible') {
    return <Caja tono="aviso" titulo="No he sabido leer la dirección">Hace falta tipo de vía, nombre y número: «Calle San Vicente 40». El piso (2º 14) ayuda a acertar el inmueble.</Caja>
  }
  if (r.estado === 'elegir') {
    return (
      <Caja tono="neutro" titulo={`${r.inmuebles.length} inmuebles en ${r.via}: ¿cuál es?`}>
        <p style={{ margin: '0 0 8px', fontSize: 12, color: 'var(--muted)' }}>
          El Catastro lista todos los pisos del portal. Con dos o más no se elige a ciegas: pincha el suyo.
        </p>
        <div style={{ display: 'grid', gap: 6, gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))' }}>
          {r.inmuebles.map(i => (
            <button key={i.refCompleta} type="button" onClick={() => onElegir(i.refCompleta)} style={{ ...boton, background: 'transparent', color: 'var(--text)', border: '1px solid var(--border)' }}>
              Pl. {i.planta ?? '?'} · Pta. {i.puerta ?? '?'}
            </button>
          ))}
        </div>
      </Caja>
    )
  }
  const { datos, supuestos, faltan, avisos } = r.precalificacion
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <Caja tono="ok" titulo={datos.direccion ?? 'Vivienda'}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
          <Dato label="Superficie" valor={datos.metrosCuadrados !== null ? `${datos.metrosCuadrados} m²` : null} />
          <Dato label="Construida en" valor={datos.anioConstruccion !== null ? String(datos.anioConstruccion) : null} />
          <Dato label="Uso" valor={datos.uso} />
          <Dato label="Código postal" valor={datos.codigoPostal} />
          <Dato label="Municipio" valor={[datos.localidad, datos.provincia].filter(Boolean).join(', ') || null} />
        </div>
        <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 8 }}>Referencia catastral: <code>{r.referencia}</code></div>
      </Caja>
      {avisos.length > 0 && (
        <Caja tono="aviso" titulo="Antes de cotizar">
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>{avisos.map((a, i) => <li key={i}>{a}</li>)}</ul>
        </Caja>
      )}
      {faltan.length > 0 && (
        <Caja tono="aviso" titulo="Lo que el Catastro NO da">
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>{faltan.map(f => <li key={f.campo}><strong>{CAMPOS[f.campo] ?? f.campo}</strong>: {f.motivo}</li>)}</ul>
        </Caja>
      )}
      {supuestos.length > 0 && (
        <Caja tono="neutro" titulo="Supuestos (se verifican al emitir)">
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>{supuestos.map(s => <li key={s.campo}><strong>{CAMPOS[s.campo] ?? s.campo}</strong>: {s.porque}</li>)}</ul>
        </Caja>
      )}
      <p style={{ fontSize: 12, color: 'var(--muted)', margin: 0 }}>
        Pedir precio de hogar a Codeoscopic todavía no está conectado (hoy solo auto). Falta comprobar, gratis,
        si hogar tarifica para nuestra organización (<code>GET /insurance-lines</code>).
      </p>
    </div>
  )
}

function Dato({ label, valor }: { label: string; valor: string | null }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: 'var(--muted)' }}>{label}</div>
      {valor !== null ? <div style={{ fontWeight: 700 }}>{valor}</div> : <div style={{ color: 'var(--muted)' }} title="El Catastro no lo publica">no publicado</div>}
    </div>
  )
}

function Caja({ tono, titulo, children }: { tono: 'ok' | 'aviso' | 'error' | 'neutro'; titulo: string; children: React.ReactNode }) {
  const color = tono === 'error' ? '#d66' : tono === 'aviso' ? '#c96' : tono === 'ok' ? 'var(--positive, #2a7)' : 'var(--border)'
  return (
    <div style={{ border: `1px solid ${color}`, borderRadius: 12, padding: 14 }}>
      <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8 }}>{titulo}</div>
      <div style={{ fontSize: 13 }}>{children}</div>
    </div>
  )
}

function Pestana({ activa, onClick, children }: { activa: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} style={{ ...boton, background: activa ? 'var(--primary)' : 'transparent', color: activa ? '#fff' : 'var(--text)', border: '1px solid var(--border)' }}>
      {children}
    </button>
  )
}

const input: React.CSSProperties = { padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 14, minHeight: 44, background: 'var(--bg, transparent)', color: 'var(--text)' }
const boton: React.CSSProperties = { padding: '10px 14px', borderRadius: 8, border: 'none', background: 'var(--primary)', color: '#fff', fontWeight: 600, minHeight: 44, cursor: 'pointer' }
