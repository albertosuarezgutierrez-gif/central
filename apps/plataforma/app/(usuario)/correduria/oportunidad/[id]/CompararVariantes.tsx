'use client'

// Comparar dos presupuestos del riesgo (29/09/2026): qué cambia de Px a Py y, compañía a compañía,
// la prima de cada una. La más ANTIGUA es siempre `a`. Tres estados que no se colapsan: cambios
// `null` = «no se puede comparar», `[]` = «mismos datos»; una compañía sin precio en una → «—», no 0.

import { useEffect, useState } from 'react'
import { Badge, btnStyle, cardStyle } from '@/components/ui'
import { eur } from '@/lib/dinero'
import {
  diferenciaComparacion, mejoresComparacion,
  type Comparacion, type FilaComparacion, type LecturaComparacion, type VarianteRiesgo,
} from '@/lib/riesgo-asegura'
import { CeldaCompania } from '../../CeldaCompania'

export default function CompararVariantes({ oportunidadId, a, b, onCerrar }: {
  oportunidadId: string
  a: VarianteRiesgo
  b: VarianteRiesgo
  onCerrar: () => void
}) {
  const [lectura, setLectura] = useState<LecturaComparacion | null>(null)

  useEffect(() => {
    let vivo = true
    setLectura(null)
    const q = new URLSearchParams({ id: oportunidadId, a: a.id, b: b.id })
    fetch(`/api/correduria/oportunidad/comparar?${q.toString()}`, { cache: 'no-store' })
      .then(async (res) => (await res.json().catch(() => null)) as LecturaComparacion | null)
      .then((j) => { if (vivo) setLectura(j && typeof j === 'object' && 'estado' in j ? j : { estado: 'error', motivo: 'respuesta ilegible' }) })
      .catch(() => { if (vivo) setLectura({ estado: 'error', motivo: 'sin conexión' }) })
    return () => { vivo = false }
  }, [oportunidadId, a.id, b.id])

  return (
    <section aria-label={`Comparar ${a.referencia} y ${b.referencia}`} style={{ ...cardStyle, border: '1px solid var(--primary)', display: 'grid', gap: 12, minWidth: 0 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <div style={{ fontSize: 14, fontWeight: 600 }}>Comparar {a.referencia} y {b.referencia}</div>
        <button type="button" onClick={onCerrar} style={{ ...btnStyle('sutil', 'sm'), minHeight: 44 }}>Cerrar</button>
      </div>
      {lectura === null && <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)' }}>Comparando…</p>}
      {lectura?.estado === 'no_encontrado' && (
        <p style={{ margin: 0, fontSize: 13, color: 'var(--negative)' }}>Alguna de las dos no es de este riesgo o ya no existe. Recarga la página.</p>
      )}
      {lectura?.estado === 'error' && (
        <p style={{ margin: 0, fontSize: 13, color: 'var(--negative)' }}>
          No se ha podido comparar ({lectura.motivo}). No es que no haya diferencias: no se han podido mirar.
        </p>
      )}
      {lectura?.estado === 'ok' && <Resultado c={lectura.comparacion} pa={a.referencia} pb={b.referencia} />}
    </section>
  )
}

function Resultado({ c, pa, pb }: { c: Comparacion; pa: string; pb: string }) {
  const mejores = mejoresComparacion(c.companias)
  return (
    <>
      <div style={{ display: 'grid', gap: 6 }}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>Qué cambia de {pa} a {pb}</div>
        {c.cambios === null ? (
          <div style={{ fontSize: 13, color: 'var(--muted)' }}>No se puede comparar lo que se pidió en cada una.</div>
        ) : c.cambios.length === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--muted)' }}>Mismos datos en las dos.</div>
        ) : (
          <ul style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 2, fontSize: 13 }}>
            {c.cambios.map((d, i) => (
              <li key={`${d.campo}-${i}`} style={{ overflowWrap: 'anywhere' }}>
                <strong>{d.campo}</strong>: {d.antes ?? '—'} → {d.despues ?? '—'}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div style={{ display: 'grid', gap: 6, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>Precio por compañía</div>
        {c.companias.length === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--muted)' }}>Ninguna de las dos tiene precios guardados.</div>
        ) : (
          <div style={{ overflowX: 'auto', minWidth: 0 }}>
            <table style={{ width: '100%', minWidth: 420, borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ textAlign: 'left', color: 'var(--muted)' }}>
                  <th style={th}>Compañía</th>
                  <th style={{ ...th, textAlign: 'right' }}>{pa}</th>
                  <th style={{ ...th, textAlign: 'right' }}>{pb}</th>
                  <th style={{ ...th, textAlign: 'right' }}>Diferencia</th>
                </tr>
              </thead>
              <tbody>
                {c.companias.map((f) => <FilaPrecio key={f.compania} f={f} mejorA={mejores.a} mejorB={mejores.b} />)}
              </tbody>
            </table>
          </div>
        )}
        <div style={{ fontSize: 12, color: 'var(--muted)' }}>
          La mejor prima de cada una va destacada. «—» = esa compañía no dio precio en esa variante. Diferencia = {pb} menos {pa}.
        </div>
      </div>
    </>
  )
}

const th: React.CSSProperties = { padding: '6px 8px', borderBottom: '1px solid var(--border)', fontWeight: 600, whiteSpace: 'nowrap' }
const td: React.CSSProperties = { padding: '8px', borderBottom: '1px solid var(--border)', verticalAlign: 'middle' }

function FilaPrecio({ f, mejorA, mejorB }: { f: FilaComparacion; mejorA: number | null; mejorB: number | null }) {
  const dif = diferenciaComparacion(f)
  return (
    <tr>
      <td style={{ ...td, minWidth: 110 }}><CeldaCompania compania={f.compania} producto={null} /></td>
      <Prima p={f.a} mejor={mejorA} />
      <Prima p={f.b} mejor={mejorB} />
      <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap', color: dif === null || dif === 0 ? 'var(--muted)' : dif < 0 ? 'var(--positive)' : 'var(--negative)' }}>
        {dif === null ? '—' : dif === 0 ? 'igual' : `${dif > 0 ? '+' : '−'}${eur(Math.abs(dif))}`}
      </td>
    </tr>
  )
}

function Prima({ p, mejor }: { p: FilaComparacion['a']; mejor: number | null }) {
  if (p === null) return <td style={{ ...td, textAlign: 'right', color: 'var(--muted)' }}>—</td>
  const esMejor = mejor !== null && p.primaEur === mejor
  return (
    <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap', background: esMejor ? 'var(--primary-light)' : undefined }}>
      <div style={{ fontWeight: esMejor ? 700 : 400 }}>{eur(p.primaEur)}</div>
      {esMejor && <Badge tono="positivo">mejor</Badge>}
      {p.modalidad && <div style={{ fontSize: 11, color: 'var(--muted)', whiteSpace: 'normal' }}>{p.modalidad}</div>}
    </td>
  )
}
