'use client'
// Dirección con el patrón del repo (referencia: apps/plataforma/app/(usuario)/correduria/BuscadorDireccionCp.tsx):
// CP primero → provincia automática → desplegable de municipios → calle autocompletada con el callejero del Catastro → número.
// 🚨 Nunca un municipio/provincia inventado: sin CP quedan vacíos; un CP que la tabla no conoce se escribe a mano; un fallo de red tampoco inventa.
// Componente CONTROLADO: el padre guarda `valor` y lo envía a su acción (que vuelve a validar en servidor).
import { useEffect, useId, useRef, useState } from 'react'
import { nombreCalleEscrito, viaSigueVigente } from '@central/core-catastro'
import type { Direccion } from '@/lib/direccion'

type Via = { tipo: string; nombre: string }
type Cp = { estado: 'vacio' } | { estado: 'consultando' } | { estado: 'ok'; municipios: string[] | null } | { estado: 'error' }

export function DireccionCp({ valor, onChange, obligatoria = false }: { valor: Direccion; onChange: (d: Direccion) => void; obligatoria?: boolean }) {
  const [lectura, setLectura] = useState<Cp>({ estado: 'vacio' })
  const [sugeridas, setSugeridas] = useState<Via[]>([])
  const [abierto, setAbierto] = useState(false)
  const [activa, setActiva] = useState(-1)
  const [elegida, setElegida] = useState<Via | null>(null)
  const [avisoVias, setAvisoVias] = useState(false)
  const id = useId()
  const caja = useRef<HTMLDivElement>(null)
  const ref = useRef(valor)
  ref.current = valor
  const cpValido = /^\d{5}$/.test(valor.cp.trim())
  const set = (p: Partial<Direccion>) => onChange({ ...ref.current, ...p })

  useEffect(() => {
    if (!cpValido) { setLectura({ estado: 'vacio' }); return }
    let vivo = true
    setLectura({ estado: 'consultando' })
    fetch(`/api/direccion/cp?cp=${valor.cp.trim()}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j: { municipios: string[] | null; provincia: string | null }) => {
        if (!vivo) return
        setLectura({ estado: 'ok', municipios: j.municipios })
        const d = ref.current
        // La provincia es la del CP (si la da); el municipio solo se fija solo si el CP tiene uno, o se conserva si sigue valiendo.
        onChange({
          ...d,
          provincia: j.provincia ?? d.provincia,
          municipio: j.municipios && j.municipios.length === 1 ? j.municipios[0] : j.municipios && !j.municipios.includes(d.municipio) ? '' : d.municipio,
        })
      })
      .catch(() => { if (vivo) setLectura({ estado: 'error' }) })
    return () => { vivo = false }
    // Solo reacciona al CP: `onChange` y `valor` se leen por ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valor.cp, cpValido])

  const viaVigente = viaSigueVigente(valor.via, elegida) ? elegida : null
  useEffect(() => { setElegida(null) }, [valor.cp, valor.municipio, valor.provincia])

  useEffect(() => {
    const nombre = nombreCalleEscrito(valor.via)
    if (!valor.municipio.trim() || !valor.provincia.trim() || nombre.replace(/[^A-ZÑ0-9]/gi, '').length < 2 || viaVigente) { setSugeridas([]); return }
    let vivo = true
    const ctl = new AbortController()
    const t = setTimeout(() => {
      fetch(`/api/direccion/vias?${new URLSearchParams({ provincia: valor.provincia, municipio: valor.municipio, q: valor.via })}`, { signal: ctl.signal })
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
        .then((j: { vias: Via[] }) => { if (vivo) { setSugeridas(j.vias); setActiva(-1); setAvisoVias(false) } })
        .catch((e) => { if (vivo && e?.name !== 'AbortError') { setSugeridas([]); setAvisoVias(true) } })
    }, 300)
    return () => { vivo = false; clearTimeout(t); ctl.abort() }
  }, [valor.via, valor.municipio, valor.provincia, viaVigente])

  useEffect(() => {
    const fuera = (e: MouseEvent) => { if (caja.current && !caja.current.contains(e.target as Node)) setAbierto(false) }
    document.addEventListener('mousedown', fuera)
    return () => document.removeEventListener('mousedown', fuera)
  }, [])

  function elegir(v: Via) {
    set({ via: `${v.tipo} ${v.nombre}` })
    setElegida({ tipo: v.tipo, nombre: v.nombre })
    setSugeridas([]); setAbierto(false)
  }
  function teclas(e: React.KeyboardEvent<HTMLInputElement>) {
    const n = sugeridas.length
    if (!abierto || n === 0) return
    if (e.key === 'ArrowDown') { setActiva((a) => (a + 1) % n); e.preventDefault() }
    else if (e.key === 'ArrowUp') { setActiva((a) => (a <= 0 ? n - 1 : a - 1)); e.preventDefault() }
    else if (e.key === 'Enter' && activa >= 0) { elegir(sugeridas[activa]); e.preventDefault() }
    else if (e.key === 'Escape') { setAbierto(false); e.preventDefault() }
  }

  const lista = lectura.estado === 'ok' ? lectura.municipios : null
  const eligeDeLista = lista !== null && lista.length > 1
  return (
    <div className="direccion">
      <label className="campo">Código postal (primero)
        <input inputMode="numeric" maxLength={5} placeholder="41900" value={valor.cp} required={obligatoria} onChange={(e) => set({ cp: e.target.value.replace(/\D/g, '') })} />
      </label>
      <label className="campo">Provincia
        <input value={valor.provincia} placeholder={cpValido ? '' : 'Sale del código postal'} required={obligatoria} onChange={(e) => set({ provincia: e.target.value })} />
      </label>
      <label className="campo">Municipio
        {eligeDeLista ? (
          <select value={valor.municipio} required={obligatoria} onChange={(e) => set({ municipio: e.target.value })}>
            <option value="">Elige el municipio</option>
            {lista!.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        ) : (
          <input value={valor.municipio} placeholder={cpValido ? '' : 'Sale del código postal'} required={obligatoria} onChange={(e) => set({ municipio: e.target.value })} />
        )}
      </label>
      <div ref={caja} className="campo" style={{ position: 'relative' }}>
        <label htmlFor={`${id}-calle`}>Calle</label>
        <input
          id={`${id}-calle`} placeholder="Calle (sale del Catastro)" value={valor.via} autoComplete="off" required={obligatoria}
          role="combobox" aria-expanded={abierto && sugeridas.length > 0} aria-controls={id} aria-autocomplete="list"
          aria-activedescendant={activa >= 0 ? `${id}-${activa}` : undefined}
          onChange={(e) => { set({ via: e.target.value }); setAbierto(true) }} onFocus={() => setAbierto(true)} onKeyDown={teclas}
        />
        {abierto && sugeridas.length > 0 && (
          <ul id={id} role="listbox" aria-label="Calles del Catastro" className="sugerencias">
            {sugeridas.map((v, i) => (
              <li key={`${v.tipo}|${v.nombre}`} id={`${id}-${i}`} role="option" aria-selected={i === activa}
                onMouseDown={(e) => { e.preventDefault(); elegir(v) }} onMouseEnter={() => setActiva(i)}
                className={i === activa ? 'activa' : ''}>
                <strong>{v.tipo}</strong> {v.nombre}
              </li>
            ))}
          </ul>
        )}
        {viaVigente && <span className="tenue">Calle oficial del Catastro: {viaVigente.tipo} {viaVigente.nombre}</span>}
        {avisoVias && <span role="status" className="tenue">Sin sugerencias de calle ahora: escribe la calle a mano.</span>}
      </div>
      <label className="campo">Número
        <input value={valor.numero} placeholder="14 (o s/n)" maxLength={20} required={obligatoria} onChange={(e) => set({ numero: e.target.value })} />
      </label>
      <p role="status" className="tenue" style={{ gridColumn: '1 / -1', margin: 0 }}>
        {lectura.estado === 'consultando' ? 'Consultando el código postal…'
          : lectura.estado === 'error' ? 'No se ha podido leer el código postal ahora: escribe la provincia y el municipio a mano.'
          : lectura.estado === 'ok' && lectura.municipios === null ? 'Ese código postal no está en la tabla: escribe el municipio a mano.'
          : !cpValido ? 'Con el código postal salen la provincia y el municipio; sin él, hay que escribirlos.' : ''}
      </p>
    </div>
  )
}
