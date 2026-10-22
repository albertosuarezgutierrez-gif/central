'use client'

// Dirección con el CÓDIGO POSTAL PRIMERO (regla de la casa). Porta lo mínimo de
// `apps/plataforma/app/(usuario)/correduria/BuscadorDireccionCp.tsx`: el CP da la provincia y el municipio sale de una
// lista; la calle se autocompleta con el callejero del Catastro (`/api/patrimonio/vias`) y NUNCA bloquea escribir.
// Controlado: avisa al padre con `onCambio`. Las reglas viven en `lib/patrimonio/direccion-cp.ts` (probadas).
import { useEffect, useId, useRef, useState } from 'react'

import { componerDireccionConVia, nombreCalleEscrito, viaSigueVigente, type ViaCatastro } from '@central/core-catastro'

import {
  aplicarLecturaCp,
  estadoDireccion,
  normalizarCp,
  type LecturaCp,
} from '@/lib/patrimonio/direccion-cp'

export type ValorDireccion = {
  cp: string
  provincia: string
  municipio: string
  direccion: string
  /** La calle oficial elegida del callejero; `null` = texto libre (queda «por validar»). */
  viaOficial: ViaCatastro | null
}

export const DIRECCION_VACIA: ValorDireccion = { cp: '', provincia: '', municipio: '', direccion: '', viaOficial: null }

const etiqueta: React.CSSProperties = { display: 'grid', gap: 4, fontSize: 13, fontWeight: 600, minWidth: 0 }

export function DireccionCp({ valor, onCambio, disabled }: { valor: ValorDireccion; onCambio: (v: ValorDireccion) => void; disabled?: boolean }) {
  const [lectura, setLectura] = useState<LecturaCp>({ estado: 'vacio' })
  const [sugeridas, setSugeridas] = useState<ViaCatastro[]>([])
  const [abierto, setAbierto] = useState(false)
  const [activa, setActiva] = useState(-1)
  const [avisoVias, setAvisoVias] = useState(false)
  const idLista = useId()
  const cajaRef = useRef<HTMLDivElement>(null)
  // El padre es la fuente de verdad, pero los efectos necesitan el último valor sin relanzarse.
  const ultimo = useRef(valor)
  ultimo.current = valor

  const est = estadoDireccion({ cp: valor.cp, provincia: valor.provincia, municipio: valor.municipio, lectura })
  const viaVigente = viaSigueVigente(valor.direccion, valor.viaOficial) ? valor.viaOficial : null

  useEffect(() => {
    if (!/^\d{5}$/.test(valor.cp)) {
      setLectura({ estado: 'vacio' })
      return
    }
    let vivo = true
    setLectura({ estado: 'consultando' })
    fetch(`/api/patrimonio/codigo-postal?cp=${valor.cp}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j: { municipios: string[] | null; provincia: string | null }) => {
        if (!vivo) return
        setLectura({ estado: 'ok', municipios: j.municipios, provincia: j.provincia })
        const v = ultimo.current
        const { provincia, municipio } = aplicarLecturaCp(j, { provincia: v.provincia, municipio: v.municipio })
        onCambio({ ...v, provincia, municipio, viaOficial: null })
      })
      .catch(() => {
        if (vivo) setLectura({ estado: 'error' })
      })
    return () => {
      vivo = false
    }
    // Solo el CP relanza la consulta.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valor.cp])

  useEffect(() => {
    const nombre = nombreCalleEscrito(valor.direccion)
    if (!est.puedeBuscarCalle || nombre.replace(/[^A-ZÑ0-9]/gi, '').length < 2 || viaVigente) {
      setSugeridas([])
      return
    }
    let vivo = true
    const ctl = new AbortController()
    const t = setTimeout(() => {
      fetch(`/api/patrimonio/vias?${new URLSearchParams({ provincia: valor.provincia, municipio: valor.municipio, q: valor.direccion })}`, { signal: ctl.signal })
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
        .then((j: { vias: ViaCatastro[] }) => {
          if (vivo) {
            setSugeridas(j.vias)
            setActiva(-1)
            setAvisoVias(false)
          }
        })
        .catch((e) => {
          if (vivo && e?.name !== 'AbortError') {
            setSugeridas([])
            setAvisoVias(true)
          }
        })
    }, 300)
    return () => {
      vivo = false
      clearTimeout(t)
      ctl.abort()
    }
  }, [valor.direccion, valor.municipio, valor.provincia, est.puedeBuscarCalle, viaVigente])

  useEffect(() => {
    const fuera = (e: MouseEvent) => {
      if (cajaRef.current && !cajaRef.current.contains(e.target as Node)) setAbierto(false)
    }
    document.addEventListener('mousedown', fuera)
    return () => document.removeEventListener('mousedown', fuera)
  }, [])

  function elegir(v: ViaCatastro) {
    onCambio({ ...valor, direccion: componerDireccionConVia(valor.direccion, v), viaOficial: v })
    setSugeridas([])
    setAbierto(false)
  }
  function teclas(e: React.KeyboardEvent<HTMLInputElement>) {
    const n = sugeridas.length
    if (!abierto || n === 0) return
    if (e.key === 'ArrowDown') {
      setActiva((a) => (a + 1) % n)
      e.preventDefault()
    } else if (e.key === 'ArrowUp') {
      setActiva((a) => (a <= 0 ? n - 1 : a - 1))
      e.preventDefault()
    } else if (e.key === 'Enter' && activa >= 0) {
      elegir(sugeridas[activa])
      e.preventDefault()
    } else if (e.key === 'Escape') {
      setAbierto(false)
      e.preventDefault()
    }
  }

  const lista = lectura.estado === 'ok' ? lectura.municipios : null
  const cambiarZona = (p: Partial<ValorDireccion>) => onCambio({ ...valor, ...p, viaOficial: null })
  return (
    <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))' }}>
      <label style={etiqueta}>
        Código postal (primero)
        <input className="campo" inputMode="numeric" maxLength={5} placeholder="41003" value={valor.cp} disabled={disabled} required
          onChange={(e) => cambiarZona({ cp: normalizarCp(e.target.value) })} />
      </label>
      <label style={etiqueta}>
        Provincia
        <input className="campo" value={valor.provincia} disabled={disabled} required placeholder={est.cpValido ? '' : 'Sale del código postal'}
          onChange={(e) => cambiarZona({ provincia: e.target.value })} />
      </label>
      <label style={etiqueta}>
        Municipio
        {est.eligeMunicipioDeLista ? (
          <select className="campo" value={valor.municipio} disabled={disabled} required onChange={(e) => cambiarZona({ municipio: e.target.value })}>
            <option value="">Elige el municipio</option>
            {lista!.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        ) : (
          <input className="campo" value={valor.municipio} disabled={disabled} required placeholder={est.cpValido ? '' : 'Sale del código postal'}
            onChange={(e) => cambiarZona({ municipio: e.target.value })} />
        )}
      </label>
      <div ref={cajaRef} style={{ ...etiqueta, gridColumn: '1 / -1', position: 'relative' }}>
        <label htmlFor={`${idLista}-calle`} style={{ display: 'grid', gap: 4 }}>
          Calle y número
          <input
            id={`${idLista}-calle`} className="campo" placeholder={est.puedeBuscarCalle ? 'Calle San Vicente 40, 2º 14' : 'Primero el código postal'}
            value={valor.direccion} required autoComplete="off" disabled={disabled || !est.puedeBuscarCalle}
            role="combobox" aria-expanded={abierto && sugeridas.length > 0} aria-controls={idLista} aria-autocomplete="list"
            aria-activedescendant={activa >= 0 ? `${idLista}-${activa}` : undefined}
            onChange={(e) => {
              onCambio({ ...valor, direccion: e.target.value })
              setAbierto(true)
            }}
            onFocus={() => setAbierto(true)} onKeyDown={teclas}
          />
        </label>
        {abierto && sugeridas.length > 0 && (
          <ul id={idLista} role="listbox" aria-label="Calles del Catastro" style={{
            position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20, margin: '2px 0 0', padding: 0, listStyle: 'none',
            background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, maxHeight: 'min(60vh, 480px)', overflowY: 'auto',
            boxShadow: '0 6px 18px rgba(0,0,0,.15)',
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
        {viaVigente && <span className="suave" style={{ fontSize: 12, fontWeight: 400 }}>Calle oficial del Catastro: {viaVigente.tipo} {viaVigente.nombre}</span>}
        {avisoVias && <span role="status" className="suave" style={{ fontSize: 12, fontWeight: 400 }}>Sin sugerencias de calle ahora: escríbela a mano; quedará por validar.</span>}
      </div>
      <div role="status" className="suave" style={{ gridColumn: '1 / -1', fontSize: 12 }}>{est.mensaje}</div>
    </div>
  )
}
