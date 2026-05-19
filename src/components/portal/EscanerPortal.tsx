'use client'
import { useState, useEffect } from 'react'
import { C, SE, SN, SM } from '@/lib/colors'
import dynamic from 'next/dynamic'

const SmartScanFAB = dynamic(() => import('@/components/SmartScanFAB'), { ssr: false })

interface Doc {
  id: string; tipo: string; confianza: number; estado: string
  created_at: string; camarero_nombre: string | null
  datos: Record<string, unknown> | null
}
interface SessionMin { id: string; restaurante_id: string; nombre?: string }
interface Props { sh: () => Record<string, string>; session: SessionMin }

const TIPO_LABEL: Record<string, string> = {
  cv: 'Currículum', albaran: 'Albarán', factura_proveedor: 'Factura prov.', carta: 'Carta', otro: 'Otro'
}

export default function EscanerPortal({ sh, session }: Props) {
  const [docs, setDocs] = useState<Doc[]>([])
  const [loading, setLoading] = useState(true)

  const cargar = async () => {
    setLoading(true)
    const r = await fetch('/api/scanner/clasificar?lista=1', { headers: sh() })
    const d = await r.json()
    setDocs(d.documentos ?? [])
    setLoading(false)
  }

  useEffect(() => { cargar() }, [])

  if (loading) return <div style={{ padding: 24, fontFamily: SN, fontSize: 12, color: C.ink3 }}>Cargando documentos...</div>

  return (
    <div style={{ maxWidth: 720 }}>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontFamily: SM, fontSize: 10, color: C.ink3, letterSpacing: '.1em', marginBottom: 4 }}>ESCÁNER IA</div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <div style={{ fontFamily: SE, fontStyle: 'italic', fontSize: 22, color: C.ink }}>Documentos</div>
          <div style={{ fontFamily: SN, fontSize: 12, color: C.ink3 }}>{docs.length} documentos</div>
        </div>
        <div style={{ fontFamily: SN, fontSize: 12, color: C.ink3, marginTop: 6 }}>
          Sube albaranes, facturas o CVs con la cámara. La IA los clasifica automáticamente.
        </div>
      </div>

      {docs.length === 0 ? (
        <div style={{ background: C.paper2, border: `1px solid ${C.rule}`, borderRadius: 10, padding: 32, textAlign: 'center', color: C.ink3, fontFamily: SN, fontSize: 13 }}>
          Sin documentos escaneados aún
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {docs.map(d => (
            <div key={d.id} style={{ background: C.bone, border: `1px solid ${C.rule}`, borderRadius: 9, padding: '12px 14px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                  <span style={{ fontFamily: SM, fontSize: 10, fontWeight: 700, background: C.paper2, color: C.ink2, padding: '2px 7px', borderRadius: 4 }}>
                    {TIPO_LABEL[d.tipo] ?? d.tipo}
                  </span>
                  <span style={{ fontFamily: SM, fontSize: 9, color: d.estado === 'procesado' ? C.green : C.amber }}>
                    {d.estado}
                  </span>
                </div>
                {d.datos && Object.keys(d.datos).length > 0 && (
                  <div style={{ fontFamily: SN, fontSize: 11, color: C.ink3 }}>
                    {Object.entries(d.datos).slice(0, 3).map(([k, v]) => `${k}: ${v}`).join(' · ')}
                  </div>
                )}
                <div style={{ fontFamily: SN, fontSize: 10, color: C.ink4, marginTop: 2 }}>
                  {new Date(d.created_at).toLocaleDateString('es-ES')}
                  {d.camarero_nombre && ` · ${d.camarero_nombre}`}
                </div>
              </div>
              <div style={{ fontFamily: SM, fontSize: 10, color: C.ink4, flexShrink: 0 }}>
                {Math.round(d.confianza * 100)}%
              </div>
            </div>
          ))}
        </div>
      )}

      {/* FAB escáner */}
      <SmartScanFAB session={session} bottom={20} right={20} />
    </div>
  )
}
