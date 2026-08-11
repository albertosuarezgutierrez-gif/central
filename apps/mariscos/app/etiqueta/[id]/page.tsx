import { notFound } from 'next/navigation'
import { getSession } from '@/lib/session'
import { getEtiqueta } from '@/lib/mariscos-repo'
import { CANAL_NOMBRE, type MetodoProduccion } from '@central/module-pesca'
import { eur, kg, fecha } from '@/lib/format'
import PrintButton from './print-button'

export const dynamic = 'force-dynamic'

const METODO: Record<MetodoProduccion, string> = {
  capturado: 'Capturado',
  capturado_agua_dulce: 'Capturado en agua dulce',
  criado: 'Criado',
}

function Fila({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '2px 0' }}>
      <span style={{ color: '#555' }}>{k}</span>
      <span style={{ fontWeight: 600, textAlign: 'right' }}>{v}</span>
    </div>
  )
}

export default async function EtiquetaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getSession()
  if (!session) return null
  const eti = await getEtiqueta(session.id, id)
  if (!eti) notFound()

  return (
    <>
      {/* CSS de impresión: el toolbar desaparece, la etiqueta se ajusta a ~72mm. */}
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: #fff !important; }
          .etiqueta { border: none !important; box-shadow: none !important; margin: 0 !important; }
          @page { margin: 6mm; }
        }
        .etiqueta {
          width: 72mm;
          max-width: 96vw;
          margin: 16px auto;
          background: #fff;
          border: 1px solid #cbd5e1;
          border-radius: 8px;
          padding: 12px 14px;
          font-size: 12px;
          line-height: 1.35;
        }
      `}</style>

      <PrintButton />

      <div className="etiqueta">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, borderBottom: '2px solid #1b3461', paddingBottom: 6, marginBottom: 8 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logos/mariscos-gonzalez.png" alt="Mariscos González" style={{ height: 30 }} />
          <div>
            <div style={{ fontWeight: 800, color: '#1b3461', fontSize: 13 }}>Mariscos González</div>
            <div style={{ color: '#64748b', fontSize: 10 }}>{CANAL_NOMBRE[eti.canal]}</div>
          </div>
        </div>

        <div style={{ fontWeight: 800, fontSize: 15 }}>{eti.producto}</div>
        {eti.nombreCientifico && (
          <div style={{ fontStyle: 'italic', color: '#555', marginBottom: 6 }}>{eti.nombreCientifico}</div>
        )}

        <div style={{ borderTop: '1px dashed #cbd5e1', margin: '6px 0', paddingTop: 6 }}>
          {eti.metodoProduccion && <Fila k="Método" v={METODO[eti.metodoProduccion]} />}
          {eti.zonaCaptura && <Fila k="Zona de captura" v={eti.zonaCaptura} />}
          {eti.artePesca && <Fila k="Arte de pesca" v={eti.artePesca} />}
          {eti.calibre && <Fila k="Calibre" v={eti.calibre} />}
        </div>

        {/* Lote: SOLO si el canal lo exige (catering/hotel). En mostrador no aparece. */}
        {eti.lote && (
          <div style={{ background: '#1b3461', color: '#fff', borderRadius: 6, padding: '6px 8px', margin: '6px 0', textAlign: 'center' }}>
            <div style={{ fontSize: 10, opacity: 0.85 }}>LOTE</div>
            <div style={{ fontWeight: 800, fontSize: 16, letterSpacing: 0.5 }}>{eti.lote}</div>
          </div>
        )}

        <div style={{ borderTop: '1px dashed #cbd5e1', margin: '6px 0', paddingTop: 6 }}>
          <Fila k="Peso" v={kg(eti.pesoKg)} />
          <Fila k="Precio" v={eur(eti.precioKg) + '/kg'} />
          <Fila k="Importe" v={<span style={{ fontSize: 15, color: '#1b3461' }}>{eur(eti.importe)}</span>} />
        </div>

        <div style={{ borderTop: '1px dashed #cbd5e1', margin: '6px 0', paddingTop: 6 }}>
          <Fila k="Envasado" v={fecha(eti.fechaEnvasado)} />
          <Fila k="Consumir antes de" v={fecha(eti.fechaCaducidad)} />
          {eti.cliente && <Fila k="Cliente" v={eti.cliente} />}
        </div>

        {/* Trazabilidad interna: solo cuando la etiqueta lleva lote (catering/hotel). */}
        {eti.lote && (eti.trazabilidad.barco || eti.trazabilidad.marea || eti.trazabilidad.proveedor) && (
          <div style={{ borderTop: '1px dashed #cbd5e1', margin: '6px 0', paddingTop: 6, fontSize: 10, color: '#64748b' }}>
            <div style={{ fontWeight: 700, color: '#475569', marginBottom: 2 }}>Trazabilidad</div>
            {eti.trazabilidad.proveedor && <div>Proveedor: {eti.trazabilidad.proveedor}</div>}
            {eti.trazabilidad.barco && <div>Barco: {eti.trazabilidad.barco}</div>}
            {eti.trazabilidad.marea && <div>Marea: {eti.trazabilidad.marea}</div>}
            {eti.trazabilidad.albaran && <div>Albarán: {eti.trazabilidad.albaran}</div>}
            {eti.trazabilidad.fechaCaptura && <div>Captura: {fecha(eti.trazabilidad.fechaCaptura)}</div>}
          </div>
        )}

        {eti.codigo && (
          <div style={{ textAlign: 'center', fontFamily: 'monospace', fontSize: 11, marginTop: 6, color: '#334155' }}>
            {eti.codigo}
          </div>
        )}
      </div>
    </>
  )
}
