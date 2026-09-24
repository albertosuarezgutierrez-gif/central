'use client'
import { useCallback, useEffect, useState } from 'react'
import { CATEGORIAS_GASTO, PROPS_GASTO } from '@/lib/sivra/constantes'
import { eur } from '@/lib/dinero'
import { pareceIngresoDeCorreduria } from '@/lib/agente-facturas/no-es-gasto'
import type { SugerenciaIA } from '@/lib/agente-facturas/sugerencia-ia'

type Sugerencia = { propiedad: string | null; categoria: string | null; motivo: string | null }
type Pendiente = {
  id: string; fecha: string; proveedor: string | null; nif_proveedor: string | null
  numero_factura: string | null; concepto: string | null; categoria: string | null
  propiedad: string | null; base_imponible: number | null; iva: number | null
  total: number; drive_url: string | null; origen: string | null
  motivo_revision: string | null; historico: number; sugerencia: Sugerencia
  pendientesProveedor: number
}

// Regla de rendimiento del monorepo: no montar cientos de filas de golpe.
const PAGE = 25

// 🚨 Dos valores distintos que antes eran el mismo `''`:
//   SIN_ELEGIR = «no lo has decidido» → el botón de confirmar está bloqueado.
//   CORREDURIA = «va a la correduría, sin piso» → se manda como '' (vaciar a propósito) al PATCH.
// Colapsarlos convertía un hueco en una afirmación, y esa afirmación nacía como regla.
const SIN_ELEGIR = ''
const CORREDURIA = '__correduria__'

/** Lo que se manda al PATCH: la correduría es la AUSENCIA de piso. */
function propiedadParaApi(v: string): string {
  return v === CORREDURIA ? '' : v
}

const inp: React.CSSProperties = {
  padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13,
  background: 'var(--surface)', color: 'var(--text)', width: '100%', boxSizing: 'border-box',
  minHeight: 44,
}
const btn: React.CSSProperties = {
  padding: '10px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer',
  border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', minHeight: 44,
}

export default function PendientesClient() {
  const [items, setItems] = useState<Pendiente[]>([])
  const [total, setTotal] = useState(0)
  const [cargando, setCargando] = useState(true)
  const [err, setErr] = useState('')
  const [visibles, setVisibles] = useState(PAGE)
  const [trabajando, setTrabajando] = useState<string | null>(null)
  // Lo que la IA propuso por fila, para poder contar en qué se basó (o que no supo).
  const [ia, setIa] = useState<Record<string, SugerenciaIA | null>>({})
  // Ediciones locales por fila, sembradas con la sugerencia al cargar.
  const [edit, setEdit] = useState<Record<string, { categoria: string; propiedad: string }>>({})

  const cargar = useCallback(async () => {
    setErr('')
    try {
      const r = await fetch('/api/expenses/pendientes', { cache: 'no-store' })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const d = await r.json()
      const lista: Pendiente[] = d.pendientes ?? []
      setItems(lista)
      setTotal(Number(d.total ?? 0))
      setEdit(Object.fromEntries(lista.map((p) => [p.id, {
        categoria: p.sugerencia.categoria ?? p.categoria ?? '',
        // Sin propuesta NI valor previo se queda en SIN_ELEGIR: preseleccionar «correduría»
        // sería proponer un negocio que nadie ha deducido.
        propiedad: p.sugerencia.propiedad ?? p.propiedad ?? SIN_ELEGIR,
      }])))
    } catch (e) {
      // Un fallo de carga NO se pinta como «no hay nada pendiente»: se dice que no se pudo mirar.
      setErr(e instanceof Error ? e.message : 'error')
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => { void cargar() }, [cargar])

  async function accion(p: Pendiente, tipo: 'confirmar' | 'descartar', todasDelProveedor = false) {
    if (tipo === 'descartar' && !confirm(`¿Descartar «${p.proveedor ?? 'sin proveedor'}» de ${eur(p.total)}?\n\nSe borra de gastos. El PDF sigue en Drive y en el correo.`)) return
    if (todasDelProveedor && !confirm(`¿Confirmar las ${p.pendientesProveedor} facturas pendientes de «${p.proveedor ?? 'este proveedor'}» con la misma clasificación?`)) return
    setTrabajando(p.id)
    setErr('')
    try {
      const e = edit[p.id] ?? { categoria: '', propiedad: SIN_ELEGIR }
      const r = await fetch(`/api/expenses/pendientes/${p.id}`, {
        method: tipo === 'confirmar' ? 'PATCH' : 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: tipo === 'confirmar'
          ? JSON.stringify({ categoria: e.categoria, propiedad: propiedadParaApi(e.propiedad), todasDelProveedor })
          : undefined,
      })
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `HTTP ${r.status}`)
      const d = await r.json().catch(() => ({})) as { confirmadas?: string[] }
      // Se quitan de la lista las que el servidor dice que confirmó, no las que la pantalla creía
      // que iba a confirmar: entre pintar y pulsar, otra pasada del agente pudo mover la bandeja.
      const fuera = new Set(d.confirmadas ?? [p.id])
      setItems((prev) => {
        const quitadas = prev.filter((x) => fuera.has(x.id))
        setTotal((t) => t - quitadas.reduce((s, x) => s + x.total, 0))
        return prev.filter((x) => !fuera.has(x.id))
      })
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'error')
    } finally {
      setTrabajando(null)
    }
  }

  /** Pide a la IA que proponga. Solo rellena los desplegables; no escribe nada. */
  async function pedirIA(p: Pendiente) {
    setTrabajando(p.id)
    setErr('')
    setIa((s) => ({ ...s, [p.id]: null }))
    try {
      const r = await fetch(`/api/expenses/pendientes/${p.id}/sugerir-ia`, { method: 'POST' })
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `HTTP ${r.status}`)
      const d = await r.json() as { sugerencia: SugerenciaIA }
      const s = d.sugerencia
      setIa((s2) => ({ ...s2, [p.id]: s }))
      // Solo se aplica lo que la IA propuso de verdad. Un `null` deja el campo como estaba: no
      // se borra lo que ya había ni se rellena con un valor por defecto.
      setEdit((prev) => {
        const actual = prev[p.id] ?? { categoria: '', propiedad: SIN_ELEGIR }
        return {
          ...prev,
          [p.id]: {
            categoria: s.categoria ?? actual.categoria,
            propiedad: s.propiedad == null ? actual.propiedad : (s.propiedad === '' ? CORREDURIA : s.propiedad),
          },
        }
      })
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'error')
    } finally {
      setTrabajando(null)
    }
  }

  if (cargando) return <p style={{ color: 'var(--muted)' }}>Cargando la bandeja…</p>

  return (
    <>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'baseline', marginBottom: 16 }}>
        <div><strong style={{ fontSize: 24 }}>{items.length}</strong>{' '}
          <span style={{ color: 'var(--muted)' }}>factura{items.length === 1 ? '' : 's'} por revisar</span></div>
        <div style={{ color: 'var(--muted)' }}>·{' '}<strong>{eur(total)}</strong> sin contabilizar</div>
      </div>

      {err && (
        <div style={{ padding: 12, borderRadius: 8, background: 'var(--warning-bg)', marginBottom: 16 }}>
          No se pudo completar la operación: {err}. <b>Esto no significa que la bandeja esté vacía.</b>
        </div>
      )}

      {items.length === 0 && !err && (
        <p style={{ color: 'var(--muted)' }}>Nada pendiente. Las facturas nuevas aparecerán aquí.</p>
      )}

      <div style={{ display: 'grid', gap: 12 }}>
        {items.slice(0, visibles).map((p) => {
          const e = edit[p.id] ?? { categoria: '', propiedad: SIN_ELEGIR }
          const ocupado = trabajando === p.id
          const sinElegir = e.propiedad === SIN_ELEGIR
          const sospecha = pareceIngresoDeCorreduria(p)
          const sug = ia[p.id]
          return (
            <div key={p.id} style={{
              border: '1px solid var(--border)', borderRadius: 10, padding: 14,
              background: 'var(--surface)', opacity: ocupado ? 0.5 : 1,
            }}>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'space-between' }}>
                <div style={{ minWidth: 0, flex: '1 1 260px' }}>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>{p.proveedor || '(sin proveedor)'}</div>
                  <div style={{ color: 'var(--muted)', fontSize: 13, marginTop: 2 }}>
                    {p.fecha}{p.numero_factura ? ` · nº ${p.numero_factura}` : ''}
                    {p.historico > 0 ? ` · ${p.historico} factura(s) anteriores` : ' · sin histórico'}
                  </div>
                  {p.concepto && (
                    <div style={{ fontSize: 13, marginTop: 6, color: 'var(--text)' }}>{p.concepto}</div>
                  )}
                </div>
                <div style={{ textAlign: 'right', flex: '0 0 auto' }}>
                  <div style={{ fontWeight: 700, fontSize: 18 }}>{eur(p.total)}</div>
                  {p.drive_url && (
                    <a href={p.drive_url} target="_blank" rel="noreferrer"
                       style={{ fontSize: 13, color: 'var(--info)' }}>📎 Ver factura</a>
                  )}
                </div>
              </div>

              {sospecha.esSospechoso && (
                <div style={{ padding: 10, borderRadius: 8, background: 'var(--warning-bg)', marginTop: 10, fontSize: 13 }}>
                  {sospecha.tipo === 'ingreso_correduria' ? (
                    <>⚠️ <b>Esto parece un INGRESO de tu correduría, no un gasto</b> — {sospecha.motivo}.
                    Confirmarlo lo contaría como gasto deducible. El cobro ya está en el banco
                    (abono con negocio «seguros»): aquí lo suyo es <b>descartarlo</b>.</>
                  ) : (
                    <>⚠️ <b>Esta comisión YA está contada</b> — {sospecha.motivo}. Confirmarla como
                    gasto la restaría <b>dos veces</b> y hundiría el resultado del piso sin que nada
                    lo delate. Aquí lo suyo es <b>descartarla</b>.</>
                  )}
                </div>
              )}
              {p.motivo_revision && (
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 8 }}>⏳ {p.motivo_revision}</div>
              )}
              {p.sugerencia.motivo && (
                <div style={{ fontSize: 12, color: 'var(--info)', marginTop: 4 }}>💡 Propuesto: {p.sugerencia.motivo}</div>
              )}
              {sug && (
                <div style={{ fontSize: 12, marginTop: 4, color: sug.estado === 'propuesta' ? 'var(--info)' : 'var(--muted)' }}>
                  {sug.estado === 'propuesta' && <>🤖 IA: {sug.motivo ?? 'propuesta aplicada'}{sug.confianza != null ? ` (confianza ${Math.round(sug.confianza * 100)} %)` : ''}</>}
                  {/* Los dos «no» se dicen distinto a propósito: uno pide que mires tú, el otro
                      que lo reintentes. Colapsarlos manda al sitio equivocado. */}
                  {sug.estado === 'sin_criterio' && <>🤖 IA: no ha sabido proponer nada{sug.motivo ? ` — ${sug.motivo}` : ''}. Decide tú.</>}
                  {sug.estado === 'ilegible' && <>🤖 No se pudo leer la respuesta de la IA. Esto NO significa que no haya propuesta: vuelve a intentarlo.</>}
                </div>
              )}

              <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', marginTop: 12 }}>
                <label style={{ fontSize: 12, color: 'var(--muted)' }}>Categoría
                  <select value={e.categoria} disabled={ocupado} style={{ ...inp, marginTop: 4, cursor: 'pointer' }}
                          onChange={(ev) => setEdit((s) => ({ ...s, [p.id]: { ...e, categoria: ev.target.value } }))}>
                    <option value="">— sin categoría —</option>
                    {CATEGORIAS_GASTO.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </label>
                <label style={{ fontSize: 12, color: 'var(--muted)' }}>Piso / negocio
                  <select value={e.propiedad} disabled={ocupado} style={{ ...inp, marginTop: 4, cursor: 'pointer' }}
                          onChange={(ev) => setEdit((s) => ({ ...s, [p.id]: { ...e, propiedad: ev.target.value } }))}>
                    {/* 🚨 El valor vacío es «todavía no lo has decidido», NO «correduría». Hasta el
                        29/08/2026 esta opción se llamaba «— correduría / sin piso —», así que una
                        fila SIN propuesta (proveedor nuevo, que son casi todas) se leía como si el
                        sistema propusiera correduría: los 938,25 € de comisiones de Booking, que
                        son de los pisos, salían así. Y confirmar no solo equivocaba esa factura —
                        creaba la regla que manda ahí todas las futuras del proveedor. */}
                    <option value={SIN_ELEGIR}>— elige a qué negocio va —</option>
                    <option value={CORREDURIA}>🛡️ Correduría / infraestructura (sin piso)</option>
                    {PROPS_GASTO.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                  </select>
                </label>
              </div>

              <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                <button onClick={() => void accion(p, 'confirmar')} disabled={ocupado || sinElegir}
                        title={sinElegir ? 'Elige antes a qué negocio va' : undefined}
                        style={{ ...btn, background: sinElegir ? 'var(--surface)' : 'var(--positive)',
                                 color: sinElegir ? 'var(--muted)' : '#fff',
                                 borderColor: sinElegir ? 'var(--border)' : 'transparent',
                                 cursor: sinElegir ? 'not-allowed' : 'pointer' }}>
                  ✅ Confirmar y aprender
                </button>
                {/* Petición de Alberto: resuelto uno, los demás del mismo proveedor van igual.
                    Explícito y con el número delante — hay proveedores cuyas facturas NO son
                    equivalentes (una reparación es de UN piso), así que no se hace solo. */}
                {p.pendientesProveedor > 1 && (
                  <button onClick={() => void accion(p, 'confirmar', true)} disabled={ocupado || sinElegir}
                          title={sinElegir ? 'Elige antes a qué negocio va' : undefined}
                          style={{ ...btn, borderColor: 'var(--positive)', color: 'var(--positive)', fontWeight: 700,
                                   opacity: sinElegir ? 0.5 : 1, cursor: sinElegir ? 'not-allowed' : 'pointer' }}>
                    ✅✅ Y las otras {p.pendientesProveedor - 1} de este proveedor
                  </button>
                )}
                <button onClick={() => void pedirIA(p)} disabled={ocupado}
                        style={{ ...btn, color: 'var(--info)' }}>
                  🤖 Que lo proponga la IA
                </button>
                <button onClick={() => void accion(p, 'descartar')} disabled={ocupado}
                        style={{ ...btn, color: 'var(--negative)' }}>
                  🗑️ No es un gasto mío
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {items.length > visibles && (
        <button onClick={() => setVisibles((v) => v + PAGE)} style={{ ...btn, marginTop: 16 }}>
          Ver más ({items.length - visibles} restantes)
        </button>
      )}
    </>
  )
}
