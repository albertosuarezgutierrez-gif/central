'use client'

// «Presupuestos de este riesgo»: una fila por variante (P1…Pn), la más reciente arriba, con qué
// cambió respecto a la anterior. Tres estados que NO se colapsan: `cambios = []` en la primera es
// «Primera»; `null` es «no se puede comparar» (nunca «igual»); un `nPrecios` o un presupuesto que
// no se pudo leer se dice como tal, nunca como 0 o «sin enviar».

import { Badge, BtnLink, cardStyle } from '@/components/ui'
import { eur } from '@/lib/dinero'
import { estadoPresupuestoVariante, type Riesgo, type VarianteRiesgo } from '@/lib/riesgo-asegura'
import { fechaEs } from './piezas-riesgo'
import { ramoVariante, rutaVariante, tomadorDelRiesgo } from './variante'

export default function HistorialVariantes({ riesgo }: { riesgo: Riesgo }) {
  const op = riesgo.oportunidad
  const ramo = ramoVariante(op.ramo)
  const vs = riesgo.variantes
  // «Abrir» cotiza con los intervinientes VIGENTES del riesgo: solo se ofrece en las variantes cuyo
  // tomador es el vigente, o la pantalla mezclaría el tomador de P1 con las figuras de hoy.
  const tomadorVigente = tomadorDelRiesgo(riesgo)
  return (
    <section style={{ ...cardStyle, display: 'grid', gap: 10, minWidth: 0 }}>
      <div>
        <div style={{ fontSize: 14, fontWeight: 600 }}>Presupuestos de este riesgo</div>
        {vs.length > 0 && <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>De la más reciente a la más antigua. «Qué cambió» es contra la anterior.</div>}
      </div>
      {vs.length === 0 ? (
        <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)' }}>Aún no se ha pedido precio para este riesgo.</p>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 8 }}>
          {vs.map((v, i) => <Fila key={v.id} v={v} primera={i === vs.length - 1} abrir={ramo && v.tomador.clienteId === tomadorVigente ? rutaVariante(ramo, tomadorVigente, op.id, v.id) : null} otroTomador={v.tomador.clienteId !== null && v.tomador.clienteId !== tomadorVigente} />)}
        </ul>
      )}
    </section>
  )
}

function Fila({ v, primera, abrir, otroTomador }: { v: VarianteRiesgo; primera: boolean; abrir: string | null; otroTomador: boolean }) {
  const estado = estadoPresupuestoVariante(v.presupuesto)
  return (
    <li style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 12, display: 'grid', gap: 6, minWidth: 0 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'baseline' }}>
        <strong style={{ fontSize: 15 }}>{v.referencia}</strong>
        {v.creadoAt && <span style={{ color: 'var(--muted)', fontSize: 13 }}>{fechaEs(v.creadoAt)}</span>}
        <span style={{ fontSize: 13, minWidth: 0, overflowWrap: 'anywhere' }}>
          · Tomador: {v.tomador.nombre ?? <span style={{ color: 'var(--muted)' }}>no consta</span>}
        </span>
        {v.simulado && <Badge tono="aviso">simulado</Badge>}
      </div>
      {v.nota && <div style={{ fontSize: 13, fontStyle: 'normal', color: 'var(--text)' }}>«{v.nota}»</div>}

      <Cambios cambios={v.cambios} primera={primera} />

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', fontSize: 13 }}>
        {v.mejor
          ? <span>Mejor prima <strong>{eur(v.mejor.primaEur)}</strong>{v.mejor.compania ? ` (${v.mejor.compania})` : ''}</span>
          : <span style={{ color: 'var(--muted)' }}>Sin precio</span>}
        <span style={{ color: 'var(--muted)' }}>· {v.nPrecios === null ? '—' : `${v.nPrecios} ${v.nPrecios === 1 ? 'opción' : 'opciones'}`}</span>
        <Badge tono={estado === null ? 'neutral' : estado === 'Retirado' ? 'negativo' : estado === 'Emitido' || estado === 'Aceptado' ? 'positivo' : 'info'}>
          {estado ?? 'Sin preparar'}
        </Badge>
        {otroTomador && (
          <span style={{ marginLeft: 'auto', color: 'var(--muted)' }}>Para repetirla, pon a {v.tomador.nombre ?? 'su tomador'} de tomador en Intervinientes.</span>
        )}
        {abrir && (
          <span style={{ marginLeft: 'auto' }}>
            <BtnLink href={abrir} variante="secundario">Abrir</BtnLink>
          </span>
        )}
      </div>
    </li>
  )
}

function Cambios({ cambios, primera }: { cambios: VarianteRiesgo['cambios']; primera: boolean }) {
  if (cambios === null) return <div style={{ fontSize: 13, color: 'var(--muted)' }}>Qué cambió: no se puede comparar con la anterior.</div>
  if (cambios.length === 0) return <div style={{ fontSize: 13, color: 'var(--muted)' }}>{primera ? 'Primera' : 'Mismos datos que la anterior'}</div>
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', minWidth: 0 }}>
      {cambios.map((c, i) => (
        <span key={`${c.campo}-${i}`} style={{ fontSize: 12, padding: '3px 8px', borderRadius: 999, background: 'var(--primary-light)', color: 'var(--text)', overflowWrap: 'anywhere', maxWidth: '100%' }}>
          {c.campo}: {c.antes ?? '—'} → {c.despues ?? '—'}
        </span>
      ))}
    </div>
  )
}
