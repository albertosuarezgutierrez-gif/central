// E-recibo digital — vista mobile-first. Server component puro (sin estado).
import { C } from '@/lib/colors'
import type { ReciboSnapshot } from '@/lib/recibo'

const eur = (v: number) => v.toFixed(2).replace('.', ',') + ' €'

export function ReciboNoDisponible() {
  return (
    <div style={{ minHeight: '100vh', background: C.dark, color: C.darkFg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'system-ui, sans-serif', padding: 24 }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>🧾</div>
        <p style={{ fontSize: 16, fontWeight: 600 }}>Este recibo ya no está disponible</p>
        <p style={{ fontSize: 13, color: C.darkFg3, marginTop: 6 }}>gestionado con ia.rest</p>
      </div>
    </div>
  )
}

export default function ReciboView({ snapshot }: { snapshot: ReciboSnapshot }) {
  const s = snapshot
  const inicial = (s.restaurante.nombre || '?').trim().charAt(0).toUpperCase()
  const fecha = new Date(s.fecha).toLocaleString('es-ES', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })

  return (
    <div style={{ minHeight: '100vh', background: C.dark, display: 'flex', justifyContent: 'center', fontFamily: 'system-ui, -apple-system, sans-serif', padding: '24px 14px' }}>
      <div style={{ width: '100%', maxWidth: 360, background: C.bone, borderRadius: 20, overflow: 'hidden', boxShadow: '0 10px 30px rgba(0,0,0,.4)', color: C.ink, alignSelf: 'flex-start' }}>
        {/* Cabecera */}
        <div style={{ background: C.dark1, color: C.darkFg, padding: '20px 18px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 38, height: 38, borderRadius: 10, background: C.amber, color: C.dark1, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17 }}>{inicial}</div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 16 }}>{s.restaurante.nombre}</div>
              <div style={{ fontSize: 11, color: C.darkFg3 }}>
                {(s.zona_nombre ? s.zona_nombre + ' · ' : '')}Mesa {s.mesa_label} · {fecha}
              </div>
            </div>
          </div>
        </div>

        {/* Items */}
        <div style={{ padding: '14px 18px 4px' }}>
          {s.items.map((it, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, padding: '7px 0', color: C.ink2 }}>
              <span>{it.cantidad}× {it.nombre}</span>
              <span>{eur(it.precio_unitario * it.cantidad)}</span>
            </div>
          ))}
          <div style={{ borderTop: `1px dashed ${C.rule}`, marginTop: 8, paddingTop: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <span style={{ fontWeight: 700, fontSize: 16 }}>Total</span>
            <span style={{ fontWeight: 800, fontSize: 22 }}>{eur(s.total)}</span>
          </div>
          <div style={{ fontSize: 11, color: C.ink4, marginTop: 2 }}>
            IVA {s.iva.tipo}% incluido · {eur(s.iva.cuota)}
          </div>
        </div>

        {/* Verificación AEAT (si hay factura) */}
        {s.aeat && (
          <div style={{ padding: '14px 18px 0', textAlign: 'center' }}>
            <a href={s.aeat.url} style={{ fontSize: 12, color: C.red, textDecoration: 'none' }}>
              Factura {s.aeat.numero_factura} · verificable en AEAT
            </a>
          </div>
        )}

        {/* Pie */}
        <div style={{ padding: '18px', textAlign: 'center', fontSize: 11, color: C.ink4 }}>
          ⚡ gestionado con ia.rest
        </div>
      </div>
    </div>
  )
}
