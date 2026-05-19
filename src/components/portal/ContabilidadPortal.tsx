'use client'
import { useState, useEffect } from 'react'
import { C, SE, SN, SM } from '@/lib/colors'

interface Factura {
  id: string; numero_completo: string; cliente_razon_social: string
  cliente_nif: string; base_imponible: number; cuota_iva: number
  total_factura: number; created_at: string; estado: string
}
interface Props { sh: () => Record<string, string> }

export default function ContabilidadPortal({ sh }: Props) {
  const [facturas, setFacturas] = useState<Factura[]>([])
  const [loading, setLoading] = useState(true)
  const [mes, setMes] = useState(() => {
    const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`
  })

  useEffect(() => {
    setLoading(true)
    fetch(`/api/factura/cliente?mes=${mes}`, { headers: sh() })
      .then(r => r.json())
      .then(d => { setFacturas(d.facturas ?? []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [mes, sh])

  const totalBase = facturas.reduce((s, f) => s + (f.base_imponible ?? 0), 0)
  const totalIva = facturas.reduce((s, f) => s + (f.cuota_iva ?? 0), 0)
  const totalFact = facturas.reduce((s, f) => s + (f.total_factura ?? 0), 0)

  if (loading) return <div style={{ padding: 24, fontFamily: SN, fontSize: 12, color: C.ink3 }}>Cargando facturas...</div>

  return (
    <div style={{ maxWidth: 720 }}>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontFamily: SM, fontSize: 10, color: C.ink3, letterSpacing: '.1em', marginBottom: 4 }}>CONTABILIDAD · VeriFactu</div>
        <div style={{ fontFamily: SE, fontStyle: 'italic', fontSize: 22, color: C.ink, marginBottom: 4 }}>Facturas emitidas</div>
        <div style={{ fontFamily: SN, fontSize: 12, color: C.ink3 }}>Facturas con hash SHA-256 encadenado según normativa AEAT.</div>
      </div>

      {/* Selector mes */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <div style={{ fontFamily: SN, fontSize: 12, color: C.ink3 }}>Mes:</div>
        <input type="month" value={mes} onChange={e => setMes(e.target.value)}
          style={{ fontFamily: SN, fontSize: 13, background: C.paper, border: `1px solid ${C.rule}`, borderRadius: 6, padding: '6px 10px', color: C.ink, outline: 'none' }} />
      </div>

      {/* Resumen */}
      {facturas.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 20 }}>
          {[
            { label: 'Base imponible', val: totalBase },
            { label: 'IVA', val: totalIva },
            { label: 'Total facturado', val: totalFact },
          ].map(s => (
            <div key={s.label} style={{ background: C.paper2, border: `1px solid ${C.rule}`, borderRadius: 8, padding: '10px 14px' }}>
              <div style={{ fontFamily: SN, fontSize: 10, color: C.ink3, marginBottom: 3 }}>{s.label}</div>
              <div style={{ fontFamily: SM, fontSize: 16, fontWeight: 700, color: C.ink }}>{s.val.toFixed(2)}€</div>
            </div>
          ))}
        </div>
      )}

      {/* Lista */}
      {facturas.length === 0 ? (
        <div style={{ background: C.paper2, border: `1px solid ${C.rule}`, borderRadius: 10, padding: 32, textAlign: 'center', color: C.ink3, fontFamily: SN, fontSize: 13 }}>
          Sin facturas en {mes}
        </div>
      ) : (
        <div style={{ background: C.bone, border: `1px solid ${C.rule}`, borderRadius: 10, overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr 90px 90px', padding: '8px 14px', borderBottom: `1px solid ${C.rule}`, background: C.paper2 }}>
            {['Nº Factura', 'Cliente', 'Base', 'Total'].map((h, i) => (
              <div key={i} style={{ fontFamily: SM, fontSize: 9, color: C.ink3, fontWeight: 700, letterSpacing: '.08em', textAlign: i > 1 ? 'right' : 'left' }}>{h}</div>
            ))}
          </div>
          {facturas.map(f => (
            <div key={f.id} style={{ display: 'grid', gridTemplateColumns: '110px 1fr 90px 90px', padding: '10px 14px', borderBottom: `1px solid ${C.ruleS}`, background: C.bone }}>
              <div style={{ fontFamily: SM, fontSize: 11, color: C.ink }}>{f.numero_completo}</div>
              <div>
                <div style={{ fontFamily: SN, fontSize: 12, color: C.ink }}>{f.cliente_razon_social}</div>
                <div style={{ fontFamily: SN, fontSize: 10, color: C.ink4 }}>{f.cliente_nif}</div>
              </div>
              <div style={{ textAlign: 'right', fontFamily: SM, fontSize: 12, color: C.ink }}>{(f.base_imponible ?? 0).toFixed(2)}€</div>
              <div style={{ textAlign: 'right', fontFamily: SM, fontSize: 12, fontWeight: 700, color: C.ink }}>{(f.total_factura ?? 0).toFixed(2)}€</div>
            </div>
          ))}
        </div>
      )}
      <div style={{ marginTop: 14, fontFamily: SN, fontSize: 11, color: C.ink3 }}>
        Auditoría completa → <a href="/owner?tab=facturas" style={{ color: C.red }}>Panel del dueño · Facturas</a>
      </div>
    </div>
  )
}
