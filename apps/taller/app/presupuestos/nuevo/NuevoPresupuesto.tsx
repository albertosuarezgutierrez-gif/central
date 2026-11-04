'use client'
import { useState, useTransition } from 'react'
import { formatearEur } from '@central/module-taller'
import { eurosACent } from '@/lib/ajustes'
import { crearPresupuestoAccion } from '../acciones'

type Op = { codigo: string; nombre: string }
type Linea =
  | { k: number; tipo: 'paquete'; paqueteCodigo: string; nombre: string; aceiteCodigo: string | null; litrosMl: number | null; necesitaAceite: boolean }
  | { k: number; tipo: 'mano_obra'; descripcion: string; minutos: number }
  | { k: number; tipo: 'pieza'; descripcion: string; cantidad: number; precioUnitarioCent: number }
  | { k: number; tipo: 'otro'; descripcion: string; cantidad: number; precioUnitarioCent: number }

const aLitrosMl = (t: string): number | null => {
  const m = t.trim().match(/^(\d+)(?:,(\d{1,3}))?$/)
  return m ? Number(m[1]) * 1000 + Number((m[2] ?? '').padEnd(3, '0')) : null
}
const deLinea = (l: Linea) => {
  const { k, ...r } = l
  void k
  if (r.tipo === 'paquete') return { tipo: 'paquete' as const, paqueteCodigo: r.paqueteCodigo, aceiteCodigo: r.aceiteCodigo, litrosMl: r.litrosMl }
  return r
}

export function NuevoPresupuesto(p: {
  otId: string; tipoInicial: string | null; litrosInicialMl: number | null
  tipos: Op[]; paquetes: (Op & { requiereAceite: boolean })[]; aceites: Op[]
}) {
  const [tipo, setTipo] = useState(p.tipoInicial ?? '')
  const [lineas, setLineas] = useState<Linea[]>([])
  const [paq, setPaq] = useState('')
  const [aceite, setAceite] = useState('')
  const [litros, setLitros] = useState(p.litrosInicialMl ? String(p.litrosInicialMl / 1000).replace('.', ',') : '')
  const [desc, setDesc] = useState('')
  const [num, setNum] = useState('')
  const [precio, setPrecio] = useState('')
  const [manual, setManual] = useState<'mano_obra' | 'pieza' | 'otro'>('pieza')
  const [errores, setErrores] = useState<string[]>([])
  const [total, setTotal] = useState<number | null>(null)
  const [pend, iniciar] = useTransition()
  const sig = () => Date.now() + Math.random()

  function anadirPaquete() {
    const def = p.paquetes.find((x) => x.codigo === paq)
    if (!def) return
    if (def.requiereAceite && (!aceite || aLitrosMl(litros) === null)) return setErrores(['Este paquete lleva aceite: elige el aceite y los litros'])
    setErrores([]); setTotal(null)
    setLineas((x) => [...x, { k: sig(), tipo: 'paquete', paqueteCodigo: def.codigo, nombre: def.nombre, necesitaAceite: def.requiereAceite, aceiteCodigo: def.requiereAceite ? aceite : null, litrosMl: def.requiereAceite ? aLitrosMl(litros) : null }])
    setPaq('')
  }
  function anadirManual() {
    if (!desc.trim()) return setErrores(['Falta la descripción'])
    setErrores([]); setTotal(null)
    if (manual === 'mano_obra') {
      const m = Number(num)
      if (!Number.isInteger(m) || m <= 0) return setErrores(['Minutos inválidos'])
      setLineas((x) => [...x, { k: sig(), tipo: 'mano_obra', descripcion: desc.trim(), minutos: m }])
    } else {
      const c = Number(num || '1'), e = eurosACent(precio)
      if (!Number.isInteger(c) || c <= 0 || e === null) return setErrores(['Cantidad o precio inválidos (precio sin IVA, ej. 12,50)'])
      setLineas((x) => [...x, { k: sig(), tipo: manual, descripcion: desc.trim(), cantidad: c, precioUnitarioCent: e }])
    }
    setDesc(''); setNum(''); setPrecio('')
  }
  function enviar(soloCalcular: boolean) {
    setErrores([])
    iniciar(async () => {
      const r = await crearPresupuestoAccion({ otId: p.otId, tipoVehiculo: tipo || null, lineas: lineas.map(deLinea), soloCalcular })
      if (!r.ok) return setErrores(r.errores)
      if (soloCalcular) return setTotal(r.totalCent)
      location.assign(`/presupuestos/${r.presupuestoId}`)
    })
  }

  return (
    <div className="formulario">
      <fieldset>
        <legend>Tipo de vehículo</legend>
        <select aria-label="Tipo de vehículo" value={tipo} onChange={(e) => { setTipo(e.target.value); setTotal(null) }} style={{ minHeight: 44 }}>
          <option value="">Elige el tipo…</option>
          {p.tipos.map((t) => <option key={t.codigo} value={t.codigo}>{t.nombre}</option>)}
        </select>
      </fieldset>

      <fieldset>
        <legend>Paquete</legend>
        {p.paquetes.length === 0 ? <p className="tenue">El taller aún no tiene paquetes: créalos en Ajustes.</p> : (
          <>
            <select aria-label="Paquete" value={paq} onChange={(e) => setPaq(e.target.value)} style={{ minHeight: 44 }}>
              <option value="">Elige un paquete…</option>
              {p.paquetes.map((x) => <option key={x.codigo} value={x.codigo}>{x.nombre}</option>)}
            </select>
            {p.paquetes.find((x) => x.codigo === paq)?.requiereAceite && (
              <div className="dos-col">
                <label className="campo">Aceite
                  <select value={aceite} onChange={(e) => setAceite(e.target.value)}>
                    <option value="">Elige…</option>{p.aceites.map((a) => <option key={a.codigo} value={a.codigo}>{a.nombre}</option>)}
                  </select>
                </label>
                <label className="campo">Litros<input inputMode="decimal" value={litros} onChange={(e) => setLitros(e.target.value)} placeholder="4,5" /></label>
              </div>
            )}
            <button type="button" className="btn btn-sec" onClick={anadirPaquete} disabled={!paq}>Añadir paquete</button>
          </>
        )}
      </fieldset>

      <fieldset>
        <legend>Mano de obra, piezas y otros</legend>
        <select aria-label="Tipo de línea" value={manual} onChange={(e) => setManual(e.target.value as typeof manual)} style={{ minHeight: 44 }}>
          <option value="pieza">Pieza</option><option value="mano_obra">Mano de obra (minutos)</option><option value="otro">Otro concepto</option>
        </select>
        <label className="campo">Descripción<input value={desc} onChange={(e) => setDesc(e.target.value)} maxLength={200} /></label>
        <div className="dos-col">
          <label className="campo">{manual === 'mano_obra' ? 'Minutos' : 'Cantidad'}<input inputMode="numeric" value={num} onChange={(e) => setNum(e.target.value)} /></label>
          {manual !== 'mano_obra' && <label className="campo">Precio unitario sin IVA (€)<input inputMode="decimal" value={precio} onChange={(e) => setPrecio(e.target.value)} placeholder="12,50" /></label>}
        </div>
        <button type="button" className="btn btn-sec" onClick={anadirManual}>Añadir línea</button>
      </fieldset>

      {lineas.length > 0 && (
        <ul className="lista-simple">
          {lineas.map((l) => (
            <li key={l.k}>
              {l.tipo === 'paquete' ? l.nombre : l.descripcion}
              <span className="tenue">{l.tipo === 'mano_obra' ? `${l.minutos} min` : l.tipo === 'paquete' ? (l.litrosMl ? `${l.litrosMl / 1000} l` : '') : `${l.cantidad} × ${formatearEur(l.precioUnitarioCent)}`}</span>
              <button type="button" className="btn btn-sec" onClick={() => { setLineas((x) => x.filter((y) => y.k !== l.k)); setTotal(null) }}>Quitar</button>
            </li>
          ))}
        </ul>
      )}
      {total !== null && <p className="ok">Total con IVA: {formatearEur(total)}</p>}
      {errores.map((m) => <p key={m} className="aviso-error" role="alert">{m}</p>)}
      <div className="fila">
        <button type="button" className="btn btn-sec" disabled={pend || lineas.length === 0} onClick={() => enviar(true)}>Calcular</button>
        <button type="button" className="btn" disabled={pend || lineas.length === 0} onClick={() => enviar(false)}>Crear presupuesto</button>
      </div>
    </div>
  )
}
