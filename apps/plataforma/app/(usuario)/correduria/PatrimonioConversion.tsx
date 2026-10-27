'use client'

// «Referencia» → Panel de conversión de Patrimonio (27/10/2026, ESTUDIO-PATRIMONIO-MERCADO §7 punto 10): por titular con
// patrimonio en el portal, lo que cuesta (lecturas de IA) frente a lo que aporta (pólizas en vigor, nuevas, comisión).
// Lógica en `lib/correduria/patrimonio-conversion.ts` (pura, con test); aquí solo se pinta.
//
// 🚨 Tres estados, nunca colapsados: «—»/«sin dato» (no se sabe) ≠ 0 (revisado). La comisión NO es la anual consolidada (no
// existe): es la suma de `comision_bruta` de los recibos de los últimos 12 meses y se rotula así. El coste de IA es ESTIMADO.
// Responsive ≥320 px: tarjetas (no tabla) con rejilla auto-fit; ~50 + «Ver más».

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Building2, TriangleAlert } from 'lucide-react'
import { Badge, Stat } from '@/components/ui'
import { eur } from '@/lib/dinero'
import { MOTIVOS_PUERTO } from '@/lib/correduria-puerto'
import type { FilaConversion, LecturaConversion } from '@/lib/correduria/patrimonio-conversion'
import Bloque from './Bloque'

const POR_PAGINA = 50
const SIN_DATO = '—'

const n = (v: number | null, suelo = false) => (v === null ? SIN_DATO : `${suelo ? '≥' : ''}${v.toLocaleString('es-ES')}`)
const fecha = (iso: string) => {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? SIN_DATO : d.toLocaleDateString('es-ES', { timeZone: 'Europe/Madrid' })
}
const costeTxt = (c: FilaConversion['costeMes']) => (c === null ? SIN_DATO : `${c.esSuelo ? '≥' : ''}${eur(c.euros)} (estimado)`)

function comisionTxt(f: FilaConversion): string {
  if (f.comision) return `${eur(f.comision.euros)}${f.comision.ilegibles > 0 ? ` (+${f.comision.ilegibles} recibo(s) sin leer)` : ''}`
  if (f.comisionMotivo === 'sin_recibos') return 'sin dato: sin recibos en 12 meses'
  if (f.comisionMotivo === 'ilegibles') return 'sin dato: importes ilegibles'
  return 'sin dato: no se pudieron leer'
}

function Dato({ etiqueta, children, title }: { etiqueta: string; children: React.ReactNode; title?: string }) {
  return (
    <div style={{ minWidth: 0 }} title={title}>
      <div style={{ fontSize: 11, color: 'var(--muted)' }}>{etiqueta}</div>
      <div style={{ fontSize: 14, fontWeight: 600, overflowWrap: 'anywhere', fontVariantNumeric: 'tabular-nums' }}>{children}</div>
    </div>
  )
}

export default function PatrimonioConversion() {
  const [d, setD] = useState<LecturaConversion | null>(null)
  const [ver, setVer] = useState(POR_PAGINA)

  useEffect(() => {
    let vivo = true
    fetch('/api/correduria/patrimonio-conversion', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : { estado: 'error', motivo: `HTTP ${r.status}` }))
      .then((x: LecturaConversion) => { if (vivo) setD(x) })
      .catch(() => { if (vivo) setD({ estado: 'error', motivo: 'red' }) })
    return () => { vivo = false }
  }, [])

  if (d === null) return null

  if (d.estado === 'sin_configurar') {
    return (
      <Bloque titulo="Patrimonio · conversión" Icono={Building2}>
        <p style={pMuted}>El puerto con asegura no está conectado: no se puede mirar.</p>
      </Bloque>
    )
  }
  if (d.estado === 'error') {
    const texto = d.motivo in MOTIVOS_PUERTO ? MOTIVOS_PUERTO[d.motivo as keyof typeof MOTIVOS_PUERTO] : d.motivo
    return (
      <Bloque titulo="Patrimonio · conversión" Icono={TriangleAlert} tono="malo">
        <p style={{ ...pMuted, color: 'var(--negative)' }}>No se ha podido leer: {texto} No significa que no haya titulares con patrimonio.</p>
      </Bloque>
    )
  }

  const { filas, resumen: r } = d
  return (
    <Bloque
      titulo={`Patrimonio · conversión (${r.titulares} titular(es))`}
      sub="Coste de la IA frente a lo que aportan. La comisión NO es la anual consolidada (no existe): es la suma de comision_bruta de los recibos de los últimos 12 meses. El coste de IA es ESTIMADO, no medido. «—» = no se sabe (≠ 0)."
      Icono={Building2}
    >
      {filas.length === 0 ? (
        <p style={pMuted}>Ningún titular ha activado patrimonio todavía.</p>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 12, marginBottom: 12 }}>
            <Stat label="Lecturas IA del mes" value={n(r.lecturasMes, !r.lecturasCompletas)} />
            <Stat label="Lecturas IA acumuladas" value={n(r.lecturasTotal, !r.lecturasCompletas)} />
            <Stat label="Coste IA acumulado (estimado)" value={`${r.costeTotalEsSuelo ? '≥' : ''}${eur(r.costeTotalEuros)}`} />
            <Stat label="Pólizas en vigor" value={n(r.polizasEnVigor)} />
            <Stat label="Pólizas nuevas" value={n(r.polizasNuevas)} />
            <Stat
              label="Comisión recibos 12 m"
              value={r.comisionEuros === null ? SIN_DATO : `${r.titularesSinComision > 0 ? '≥' : ''}${eur(r.comisionEuros)}`}
              sub={r.titularesSinComision > 0 ? `${r.titularesSinComision} titular(es) sin dato` : undefined}
            />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 8 }}>
            {filas.slice(0, ver).map((f) => (
              <div key={f.titularId} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 12, minWidth: 0 }}>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'baseline' }}>
                  <Link href={`/correduria/cliente/${f.clienteId}`} style={{ fontWeight: 700, fontSize: 15, overflowWrap: 'anywhere' }}>{f.cliente}</Link>
                  <Badge tono="neutral">Patrimonio desde {fecha(f.activoDesde)}</Badge>
                  {!f.lecturasCompletas && <Badge tono="aviso" title="Falta el recuento de volcados (SQL pendiente de aplicar): las lecturas son un mínimo.">lecturas parciales</Badge>}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10, marginTop: 10 }}>
                  <Dato etiqueta="Inmuebles">{n(f.inmuebles)}</Dato>
                  <Dato etiqueta="Unidades">{n(f.unidades)}</Dato>
                  <Dato etiqueta="Lecturas IA mes">{n(f.lecturasMes, !f.lecturasCompletas)}</Dato>
                  <Dato etiqueta="Lecturas IA acumuladas">{n(f.lecturasTotal, !f.lecturasCompletas)}</Dato>
                  <Dato etiqueta="Coste IA mes">{costeTxt(f.costeMes)}</Dato>
                  <Dato etiqueta="Coste IA acumulado">{costeTxt(f.costeTotal)}</Dato>
                  <Dato etiqueta="Pólizas en vigor">{n(f.polizasEnVigor)}</Dato>
                  <Dato etiqueta="Pólizas nuevas" title="En vigor y dadas de alta en la cartera desde que activó patrimonio.">{n(f.polizasNuevas)}</Dato>
                  <Dato etiqueta="Comisión recibos 12 m" title="Suma de comision_bruta de los recibos de los últimos 12 meses. No es la comisión anual consolidada.">{comisionTxt(f)}</Dato>
                </div>
              </div>
            ))}
          </div>
          {ver < filas.length && (
            <button type="button" onClick={() => setVer((v) => v + POR_PAGINA)} style={{ marginTop: 10, minHeight: 44, padding: '0 16px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', cursor: 'pointer', fontWeight: 600 }}>
              Ver {Math.min(POR_PAGINA, filas.length - ver)} más
            </button>
          )}
        </>
      )}
    </Bloque>
  )
}

const pMuted: React.CSSProperties = { fontSize: 12, color: 'var(--muted)', lineHeight: 1.5, margin: 0 }
