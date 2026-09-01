'use client'
// De dónde sale el desglose de cada pago a Sique Brilla, y qué hacer si no se ha podido hacer.
// Un pago repartido «a ojo» y uno leído de su factura NO pueden verse igual: la tabla enseña
// números plausibles en los dos casos, y solo aquí se distingue lo medido de lo inferido.
// (Extraído tal cual de la página mensual antigua al pasar a vista por rango; solo se muestra
// en vista de UN mes, porque el desglose es específico del mes.)
import { useState } from 'react'
import { eur } from '@/lib/dinero'
import type { PLMensual } from '@/lib/sivra/pl-mensual'

export default function DesgloseLimpieza({ desglose, onCambio }: {
  desglose?: PLMensual['desglose']
  onCambio: () => void
}) {
  const [subiendo, setSubiendo] = useState(false)
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null)

  if (!desglose || (!desglose.pagos.length && !desglose.sinDesglosar)) return null

  const conFactura = desglose.pagos.filter(p => p.origen === 'factura')
  const inferidos = desglose.pagos.filter(p => p.origen === 'ajuste')
  const aOjo = desglose.pagos.filter(p => p.origen === 'proporcional' || p.origen === 'partes_iguales')

  async function subir(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    setSubiendo(true)
    setMsg(null)
    try {
      const fd = new FormData()
      fd.append('fichero', f)
      const r = await fetch('/api/sivra/facturas-limpieza', { method: 'POST', body: fd })
      const j = await r.json()
      if (j.guardada) {
        setMsg({ tipo: 'ok', texto: `Factura ${j.factura?.numero ?? ''} leída y aplicada al P&L.` })
        onCambio()
      } else {
        setMsg({ tipo: 'error', texto: j.motivo ?? j.error ?? 'No se ha podido leer la factura.' })
      }
    } catch {
      setMsg({ tipo: 'error', texto: 'Error de red subiendo la factura.' })
    } finally {
      setSubiendo(false)
    }
  }

  const degradado = aOjo.length > 0
  return (
    <div style={{
      border: `1px solid ${degradado ? 'var(--warning, #ca8a04)' : 'var(--border)'}`,
      background: 'var(--surface)', borderRadius: 10, padding: '12px 14px', marginBottom: 16, fontSize: 13,
    }}>
      <div style={{ fontWeight: 600, marginBottom: 6 }}>🧹 Desglose de la limpieza de este mes</div>
      {desglose.facturasIlegibles && (
        <p style={{ margin: '0 0 8px', color: 'var(--danger, #dc2626)' }}>
          ⚠️ No se han podido leer las facturas aportadas, así que lo de abajo puede salir como
          «estimado» estándolo ya medido. ({desglose.facturasIlegibles})
        </p>
      )}
      <ul style={{ margin: '0 0 8px', paddingLeft: 18, color: 'var(--muted)' }}>
        {conFactura.map((p, i) => (
          <li key={`f${i}`}>
            ✅ {eur(p.importe)} — desglosado con su <strong>factura</strong>{p.factura ? ` (nº ${p.factura})` : ''}.
          </li>
        ))}
        {inferidos.map((p, i) => (
          <li key={`a${i}`}>
            📐 {eur(p.importe)} — <strong>estimado</strong> por salidas × tarifa (no consta la factura).
          </li>
        ))}
        {aOjo.map((p, i) => (
          <li key={`o${i}`} style={{ color: 'var(--warning, #ca8a04)' }}>
            ⚠️ {eur(p.importe)} — <strong>no se ha podido desglosar</strong>: repartido en proporción, sin
            afirmar cuánto es limpieza de cada piso ni cuánto lavandería.
          </li>
        ))}
      </ul>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <label style={{
          display: 'inline-block', padding: '8px 12px', minHeight: 44, lineHeight: '28px',
          border: '1px solid var(--border)', borderRadius: 8, cursor: subiendo ? 'wait' : 'pointer',
          background: 'var(--surface-2, var(--surface))',
        }}>
          {subiendo ? 'Leyendo la factura…' : '📄 Aportar factura de Sique Brilla'}
          <input type="file" accept="application/pdf,image/*" onChange={subir} disabled={subiendo} style={{ display: 'none' }} />
        </label>
        {msg && (
          <span style={{ color: msg.tipo === 'ok' ? 'var(--success, #16a34a)' : 'var(--danger, #dc2626)' }}>
            {msg.texto}
          </span>
        )}
      </div>
      {(degradado || inferidos.length > 0) && (
        <p style={{ margin: '8px 0 0', color: 'var(--muted)', fontSize: 12 }}>
          Con la factura delante el desglose deja de ser una estimación: se leen sus líneas y solo se
          aplica si cuadran con el total de la factura.
        </p>
      )}
    </div>
  )
}
