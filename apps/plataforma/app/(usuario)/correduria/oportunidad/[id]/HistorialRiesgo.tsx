'use client'

// «Historial» del riesgo (10/10/2026): seguro anterior, años asegurado, años en la compañía, años sin siniestros,
// siniestros en los últimos 5 años y carné. Años asegurado / en la compañía se editan aquí (POST `editar` con
// `historialDeclarado`, que se guarda FUERA de `seguroAnterior`; vacío = «sin dato», 0 = revisado); el resto es SOLO LECTURA: lo que hay se lee del papel de la póliza de hoy y de la ficha del conductor;
// se corrige en la ficha o al pedir precio (la pantalla de precio lo declara). Va entre «Datos del vehículo»/figuras y
// «Pedir precio» para verlo antes de tarificar.
//
// Tres estados por fila (lógica en `lib/historial-riesgo.ts`): «Sin dato» (borde discontinuo) = no se sabe, nunca un 0;
// 0 = revisado (se pinta el valor); con valor = el dato.

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Pendiente, btnStyle, cardStyle } from '@/components/ui'
import { filasHistorial } from '@/lib/historial-riesgo'
import type { Riesgo } from '@/lib/riesgo-asegura'

const INPUT: React.CSSProperties = { minHeight: 44, minWidth: 0, width: '100%', boxSizing: 'border-box', borderRadius: 8, border: '1px solid var(--border)', padding: '0 10px', fontSize: 14, background: 'var(--surface)', color: 'var(--text)' }

/** Edición inline de los dos campos de años. Vacío = null (sin dato); solo se envían las claves que cambian. */
function EditorAnios({ oportunidadId, inicial, onCerrar }: { oportunidadId: string; inicial: { asegurado: number | null; compania: number | null }; onCerrar: () => void }) {
  const router = useRouter()
  const [asegurado, setAsegurado] = useState(inicial.asegurado === null ? '' : String(inicial.asegurado))
  const [compania, setCompania] = useState(inicial.compania === null ? '' : String(inicial.compania))
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)

  const valor = (t: string): number | null | 'invalido' => {
    const v = t.trim()
    if (v === '') return null
    return /^\d{1,3}$/.test(v) && Number(v) <= 100 ? Number(v) : 'invalido'
  }

  async function guardar() {
    const a = valor(asegurado)
    const c = valor(compania)
    if (a === 'invalido' || c === 'invalido') return setError('Pon un número entero de 0 a 100, o déjalo vacío si no se sabe.')
    const historialDeclarado: Record<string, number | null> = {}
    if (a !== inicial.asegurado) historialDeclarado.aniosAsegurado = a
    if (c !== inicial.compania) historialDeclarado.aniosEnCompania = c
    if (Object.keys(historialDeclarado).length === 0) return onCerrar()
    setGuardando(true)
    setError(null)
    try {
      const r = await fetch('/api/correduria/oportunidad', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ accion: 'editar', id: oportunidadId, historialDeclarado }) })
      const json = (await r.json().catch(() => null)) as { estado?: string; motivo?: string } | null
      if (!r.ok || json?.estado !== 'ok') return setError(`No se ha guardado: ${json?.motivo ?? `HTTP ${r.status}`}`)
      onCerrar()
      router.refresh()
    } catch {
      setError('No se ha guardado: sin conexión. Inténtalo de nuevo.')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div style={{ display: 'grid', gap: 10, minWidth: 0 }}>
      <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))' }}>
        <label style={{ display: 'grid', gap: 4, fontSize: 12, color: 'var(--muted)', fontWeight: 600, minWidth: 0 }}>
          Años asegurado
          <input style={INPUT} inputMode="numeric" value={asegurado} onChange={(e) => setAsegurado(e.target.value)} placeholder="sin dato" />
        </label>
        <label style={{ display: 'grid', gap: 4, fontSize: 12, color: 'var(--muted)', fontWeight: 600, minWidth: 0 }}>
          Años en la compañía
          <input style={INPUT} inputMode="numeric" value={compania} onChange={(e) => setCompania(e.target.value)} placeholder="sin dato" />
        </label>
      </div>
      <div style={{ fontSize: 12, color: 'var(--muted)' }}>Vacío = sin dato (no se sabe). 0 = menos de un año, revisado.</div>
      {error && <p role="alert" style={{ margin: 0, fontSize: 13, color: 'var(--negative)' }}>{error}</p>}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button type="button" onClick={guardar} disabled={guardando} style={btnStyle('primario')}>{guardando ? 'Guardando…' : 'Guardar'}</button>
        <button type="button" onClick={onCerrar} disabled={guardando} style={btnStyle('secundario')}>Cancelar</button>
      </div>
    </div>
  )
}

const REJILLA: React.CSSProperties = { display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))' }

/** `hoy` (aaaa-mm-dd, Madrid) lo calcula el SERVIDOR (page.tsx) y baja por prop: calcularlo aquí daba un desajuste de hidratación. */
export default function HistorialRiesgo({ riesgo, hoy }: { riesgo: Riesgo; hoy: string }) {
  const op = riesgo.oportunidad
  const [editando, setEditando] = useState(false)
  const hd = riesgo.historial?.historialDeclarado ?? null
  const r = filasHistorial(riesgo.historial, { compania: op.aseguradoraActual === true ? op.aseguradora : null, hoy })

  return (
    <section id="historial-riesgo" aria-labelledby="historial-riesgo-titulo" style={{ ...cardStyle, display: 'grid', gap: 12, minWidth: 0 }}>
      <div>
        <div id="historial-riesgo-titulo" style={{ fontSize: 14, fontWeight: 600 }}>Historial</div>
        <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
          Lo que se sabe del seguro de hoy y del conductor, tal como consta. «Sin dato» es que no se sabe, no que sea cero: al pedir precio se declara.
        </div>
      </div>

      {r.estado === 'sin_leer' ? (
        <p role="status" style={{ margin: 0, fontSize: 13, color: 'var(--warning)' }}>
          No se ha podido leer el historial de este riesgo ahora. No es que no tenga: recarga la página.
        </p>
      ) : (
        <dl style={{ ...REJILLA, margin: 0 }}>
          {r.filas.map((f) => (
            <div key={f.clave} style={{ display: 'grid', gap: 2, minWidth: 0, alignContent: 'start' }}>
              <dt style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600 }}>{f.etiqueta}</dt>
              <dd style={{ margin: 0, minWidth: 0, overflowWrap: 'anywhere' }}>
                {f.estado === 'pendiente' ? (
                  <Pendiente texto="Sin dato" />
                ) : (
                  <span style={{ fontWeight: 600, color: f.tono === 'aviso' ? 'var(--warning)' : 'var(--text)' }}>{f.texto}</span>
                )}
                {f.nota && <span style={{ display: 'block', fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{f.nota}</span>}
              </dd>
            </div>
          ))}
        </dl>
      )}

      {r.estado === 'ok' && (editando ? (
        <EditorAnios
          oportunidadId={op.id}
          inicial={{ asegurado: hd?.aniosAsegurado ?? null, compania: hd?.aniosEnCompania ?? null }}
          onCerrar={() => setEditando(false)}
        />
      ) : (
        <div>
          <button type="button" onClick={() => setEditando(true)} style={btnStyle('secundario')}>Editar años asegurado y en la compañía</button>
        </div>
      ))}
    </section>
  )
}
