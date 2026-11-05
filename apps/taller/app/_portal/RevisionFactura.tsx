'use client'
import { useState, useTransition } from 'react'
import { formatearEur } from '@central/module-taller'
import { confirmarFacturaAccion, corregirFacturaAccion, leerFacturaAccion, rechazarFacturaAccion } from './acciones'

export interface FacturaVista {
  id: string
  estado: string
  nombre: string
  url: string | null
  error: string | null
  nota: string | null
  origen: string | null
  borrador: { nifEmisor: string | null; numero: string | null; fecha: string | null; totalCent: number | null; lineas: { descripcion: string; cantidadMil: number | null; precioUnitCent: number | null; ivaPb: number | null }[] } | null
  diferencias: { tipo: string; bloquea: boolean; texto: string; facturaLinea?: number }[]
  nifProveedorFalta: boolean
}

const eur = (c: number | null) => (c == null ? '—' : formatearEur(c))
const ETIQUETA: Record<string, string> = {
  recibida: 'Recibida (leyéndose)', extraida: 'Leída', ilegible: 'No se ha podido leer', lista: 'Lista', revisar: 'Revisar',
  confirmada: 'Confirmada (sin contabilizar)', rechazada: 'Rechazada', contabilizada: 'Contabilizada',
}
const aCent = (s: string): number | null => {
  const t = s.trim().replace(/\./g, '').replace(',', '.').replace('€', '')
  if (!t) return null
  const n = Number(t)
  return Number.isFinite(n) ? Math.round(n * 100) : null
}

/** Revisión de la factura del proveedor: diferencias señaladas y UN clic para confirmar, corregir o rechazar. */
export function RevisionFactura({ albaranId, f, puedeConfirmar }: { albaranId: string; f: FacturaVista; puedeConfirmar: boolean }) {
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null)
  const [corrigiendo, setCorrigiendo] = useState(false)
  const [pend, iniciar] = useTransition()
  const run = (fn: () => Promise<{ ok: boolean; mensaje?: string; motivo?: string; contabilizada?: boolean }>, ok: string) => iniciar(async () => {
    const r = await fn()
    setMsg(r.ok ? { ok: r.contabilizada !== false, t: r.contabilizada === false ? `Confirmada, pero sin contabilizar: ${r.motivo}` : ok } : { ok: false, t: r.mensaje ?? 'No se pudo' })
  })
  function guardar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    const lineas = (f.borrador?.lineas ?? []).map((_, i) => ({
      indice: i, precioUnitCent: aCent(String(fd.get(`precio${i}`) ?? '')),
      ivaPb: (() => { const v = String(fd.get(`iva${i}`) ?? '').trim().replace(',', '.'); return v ? Math.round(Number(v) * 100) : null })(),
    }))
    run(() => corregirFacturaAccion(f.id, albaranId, {
      nifEmisor: String(fd.get('nif') ?? '') || null, numero: String(fd.get('numero') ?? '') || null, fecha: String(fd.get('fecha') ?? '') || null,
      totalCent: aCent(String(fd.get('total') ?? '')), lineas, guardarNifProveedor: fd.get('guardarNif') === 'on',
    }), 'Corregida y casada de nuevo')
    setCorrigiendo(false)
  }
  const b = f.borrador
  return (
    <div className="ficha">
      <p><strong>{ETIQUETA[f.estado] ?? f.estado}</strong> · {f.url ? <a href={f.url} target="_blank" rel="noopener noreferrer">{f.nombre}</a> : f.nombre}
        {f.origen ? <span className="tenue"> · leída {f.origen === 'xml' ? 'del XML' : f.origen === 'ia' ? 'con IA' : 'y corregida a mano'}</span> : null}</p>
      {b && <p className="tenue">NIF {b.nifEmisor ?? '—'} · nº {b.numero ?? '—'} · {b.fecha ?? '—'} · total {eur(b.totalCent)}</p>}
      {f.error && <p className="aviso-error">{f.error}</p>}
      {f.nota && <p className="tenue">{f.nota}</p>}
      {f.diferencias.length > 0 && (
        <ul>{f.diferencias.map((d, i) => <li key={i} className={d.bloquea ? 'aviso-error' : 'tenue'}>{d.texto}</li>)}</ul>
      )}
      {msg && <p className={msg.ok ? 'ok' : 'aviso-error'} role="status">{msg.t}</p>}
      <div className="fila">
        {['recibida', 'ilegible'].includes(f.estado) && (
          <button className="btn btn-sec" type="button" disabled={pend} onClick={() => run(() => leerFacturaAccion(f.id, albaranId), 'Leída de nuevo')}>Leer de nuevo</button>
        )}
        {['revisar', 'confirmada'].includes(f.estado) && puedeConfirmar && b && (
          <button className="btn" type="button" disabled={pend} onClick={() => run(() => confirmarFacturaAccion(f.id, albaranId), 'Confirmada y contabilizada')}>
            {f.estado === 'revisar' ? 'Confirmar (acepto las diferencias)' : 'Contabilizar'}</button>
        )}
        {f.estado === 'revisar' && puedeConfirmar && b && (
          <button className="btn btn-sec" type="button" onClick={() => setCorrigiendo((x) => !x)}>Corregir</button>
        )}
        {['revisar', 'ilegible', 'recibida'].includes(f.estado) && (
          <button className="btn btn-sec" type="button" disabled={pend} onClick={() => {
            const nota = prompt('Motivo del rechazo (se pedirá otra factura con un enlace nuevo):') ?? ''
            run(() => rechazarFacturaAccion(f.id, albaranId, nota), 'Rechazada: pulsa «Pedir la factura de nuevo»')
          }}>Rechazar</button>
        )}
      </div>
      {corrigiendo && b && (
        <form onSubmit={guardar} className="formulario">
          <div className="dos-col">
            <label className="campo">NIF del emisor<input name="nif" defaultValue={b.nifEmisor ?? ''} maxLength={20} /></label>
            <label className="campo">Nº de factura<input name="numero" defaultValue={b.numero ?? ''} maxLength={60} /></label>
            <label className="campo">Fecha<input name="fecha" type="date" defaultValue={b.fecha ?? ''} /></label>
            <label className="campo">Total (€)<input name="total" inputMode="decimal" defaultValue={b.totalCent == null ? '' : (b.totalCent / 100).toFixed(2).replace('.', ',')} /></label>
          </div>
          {f.nifProveedorFalta && <label className="check"><input type="checkbox" name="guardarNif" /> Guardar este NIF en la ficha del proveedor</label>}
          {b.lineas.map((l, i) => (
            <fieldset key={i} className="dos-col">
              <legend>{l.descripcion}</legend>
              <label className="campo">Precio unitario (€)<input name={`precio${i}`} inputMode="decimal" defaultValue={l.precioUnitCent == null ? '' : (l.precioUnitCent / 100).toFixed(2).replace('.', ',')} /></label>
              <label className="campo">IVA (%)<input name={`iva${i}`} inputMode="decimal" defaultValue={l.ivaPb == null ? '' : String(l.ivaPb / 100).replace('.', ',')} /></label>
            </fieldset>
          ))}
          <button className="btn" disabled={pend}>Guardar y casar de nuevo</button>
        </form>
      )}
    </div>
  )
}
