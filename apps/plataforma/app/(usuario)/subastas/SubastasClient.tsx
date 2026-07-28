'use client'
// Pantalla del radar de subastas. Sigue el patrón de `/empresas` (tokens de
// tema, 50 filas + «Ver más», controles de 44 px) y NO el de `/concursos`, que
// hardcodea colores y se vuelve ilegible en modo oscuro.
import { useCallback, useEffect, useState } from 'react'
import { eur } from '@/lib/dinero'

const PAGE = 50
const PROVINCIAS = ['Sevilla', 'Huelva', 'Cádiz', 'Asturias']

interface Oportunidad {
  puntuacion: number | null
  descuento: number | null
  deposito: number | null
  valorMercado: number | null
  origenValor?: 'tasacion' | 'valor_referencia' | 'comparables' | null
  coste: { total: number; impuestoTransmision: number; impuestoConcepto: string; baseImponible: number }
  motivos: string[]
  avisos: string[]
}
interface Subasta {
  dedupeKey: string
  identificador?: string | null
  tipo: string
  provincia?: string | null
  descripcion?: string | null
  url?: string | null
  fechaFin?: string | null
  valorSubasta?: number | null
  tasacion?: number | null
  situacionPosesoria?: string
}
interface Resultado { subasta: Subasta; oportunidad: Oportunidad }
interface Criterios {
  activo: boolean
  provincias: string[]
  palabras_clave: string[]
  precio_min: number | null
  precio_max: number | null
  descuento_min: number
  excluir_ocupadas: boolean
}
interface FilaRadar {
  id: string
  dedupe_key: string
  subasta: Subasta
  puntuacion: number | null
  motivos: string[]
  avisos: string[]
  coste_total: string | number | null
  visto: boolean
  fecha_fin: string | null
}
interface Tesoreria {
  origen: 'seguidas' | 'radar'
  plan: {
    total: number
    pico: number
    picoDesde: string | null
    picoSubastas: string[]
    tramos: Array<{ desde: string; hasta: string; importe: number; subastas: string[] }>
    deficit: number | null
    incompletos: string[]
  }
  saldo: { total: number; cuentas: number; masAntiguo: string | null; desactualizado: boolean }
}
interface Inicial {
  resultados: Resultado[]
  total: number
  criterios: Criterios
  radar: FilaRadar[]
  tesoreria: Tesoreria | null
}

const card: React.CSSProperties = {
  border: '1px solid var(--border)', borderRadius: 'var(--radius, 10px)',
  background: 'var(--surface)', padding: 14, marginBottom: 12,
}
const control: React.CSSProperties = {
  minHeight: 44, padding: '0 10px', borderRadius: 'var(--radius, 10px)',
  border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)',
}
const boton = (activo = false): React.CSSProperties => ({
  minHeight: 44, padding: '0 14px', borderRadius: 999, cursor: 'pointer',
  border: `1px solid ${activo ? 'var(--primary)' : 'var(--border)'}`,
  background: activo ? 'var(--primary)' : 'var(--surface)',
  color: activo ? '#fff' : 'var(--text)',
})

function fecha(iso: string | null | undefined): string | null {
  if (!iso) return null
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString('es-ES')
}

/** De dónde sale el valor con el que se compara. Nunca se oculta. */
const ORIGEN_VALOR: Record<string, string> = {
  tasacion: 'tasación publicada',
  valor_referencia: 'valor de referencia del Catastro',
  comparables: '⚠️ ESTIMADO con anuncios de la zona, no es una tasación',
}

/** Semáforo de la puntuación. `null` se pinta distinto a 0: no es lo mismo. */
function Puntuacion({ v }: { v: number | null }) {
  if (v == null) {
    return <span style={{ fontSize: 12, color: 'var(--muted)' }}>sin datos para puntuar</span>
  }
  const color = v >= 40 ? 'var(--positive, #15803d)' : v >= 20 ? 'var(--warning, #b45309)' : 'var(--muted)'
  return <span style={{ fontWeight: 700, color }}>{v}/100</span>
}

const fechaCorta = (iso: string) => new Date(iso).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })

/**
 * Dinero que hay que tener bloqueado para poder pujar. Lo que importa NO es la
 * suma de depósitos sino el máximo simultáneo: los que no se solapan reutilizan
 * el mismo dinero.
 */
function PanelTesoreria({ t }: { t: Tesoreria }) {
  const { plan, saldo } = t
  if (plan.pico <= 0) return null
  const falta = plan.deficit != null && plan.deficit > 0

  return (
    <div style={{ ...card, borderLeft: `4px solid ${falta ? 'var(--danger, #dc2626)' : 'var(--success, #16a34a)'}` }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'baseline' }}>
        <strong style={{ color: 'var(--text)', fontSize: 15 }}>💰 Depósitos para pujar</strong>
        <span style={{ fontSize: 12, color: 'var(--muted)' }}>
          {t.origen === 'seguidas'
            ? 'de las subastas que sigues'
            : 'simulación: si pujaras en todo lo que ha casado con tu radar'}
        </span>
      </div>

      <p style={{ margin: '8px 0 0', color: 'var(--text)', fontSize: 14 }}>
        Necesitas <strong>{eur(plan.pico)}</strong> bloqueados a la vez
        {plan.picoDesde && ` desde el ${fechaCorta(plan.picoDesde)}`}
        {plan.picoSubastas.length > 1 && ` (${plan.picoSubastas.length} subastas solapadas)`}.
      </p>
      {plan.total > plan.pico && (
        <p style={{ margin: '2px 0 0', color: 'var(--muted)', fontSize: 12 }}>
          La suma de todos los depósitos es {eur(plan.total)}, pero no coinciden todos en el tiempo.
        </p>
      )}

      <p style={{ margin: '6px 0 0', fontSize: 14, color: falta ? 'var(--danger, #dc2626)' : 'var(--text)' }}>
        {saldo.cuentas === 0
          ? '⚠️ No hay saldo de cuentas corrientes con el que contrastar.'
          : falta
            ? `🚨 Disponible ${eur(saldo.total)} → faltan ${eur(plan.deficit!)}.`
            : `✅ Disponible ${eur(saldo.total)}, suficiente.`}
      </p>
      {saldo.desactualizado && saldo.masAntiguo && (
        <p style={{ margin: '2px 0 0', color: 'var(--muted)', fontSize: 12 }}>
          Ojo: el saldo más antiguo que se ha sumado es del {fechaCorta(saldo.masAntiguo)}.
        </p>
      )}

      {plan.tramos.length > 1 && (
        <details style={{ marginTop: 8 }}>
          <summary style={{ cursor: 'pointer', fontSize: 12, color: 'var(--muted)', minHeight: 44, display: 'flex', alignItems: 'center' }}>
            Calendario del dinero inmovilizado
          </summary>
          <ul style={{ margin: '4px 0 0', paddingLeft: 18, fontSize: 12, color: 'var(--muted)' }}>
            {plan.tramos.map((tr) => (
              <li key={tr.desde}>
                {fechaCorta(tr.desde)} → {fechaCorta(tr.hasta)}: <strong>{eur(tr.importe)}</strong> ({tr.subastas.join(', ')})
              </li>
            ))}
          </ul>
        </details>
      )}
      {plan.incompletos.length > 0 && (
        <p style={{ margin: '6px 0 0', color: 'var(--muted)', fontSize: 12 }}>
          Sin depósito ni fecha de cierre publicados: {plan.incompletos.join(', ')}.
        </p>
      )}
    </div>
  )
}

function FichaSubasta({ s, o, acciones }: { s: Subasta; o?: Oportunidad | null; acciones?: React.ReactNode }) {
  const [abierto, setAbierto] = useState(false)
  const cierre = fecha(s.fechaFin)

  return (
    <div style={card}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'baseline', justifyContent: 'space-between' }}>
        <strong style={{ color: 'var(--text)' }}>{s.identificador ?? s.dedupeKey}</strong>
        {o && <Puntuacion v={o.puntuacion} />}
      </div>

      {s.descripcion && (
        <p style={{ margin: '8px 0', color: 'var(--text)', fontSize: 14, lineHeight: 1.45 }}>
          {s.descripcion.slice(0, 240)}
          {s.descripcion.length > 240 ? '…' : ''}
        </p>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, fontSize: 12, color: 'var(--muted)' }}>
        {s.provincia && <span>📍 {s.provincia}</span>}
        {cierre && <span>⏰ cierra {cierre}</span>}
        {s.valorSubasta != null && <span>salida {eur(s.valorSubasta)}</span>}
        {s.tasacion != null && <span>tasación {eur(s.tasacion)}</span>}
        {s.situacionPosesoria === 'ocupada' && <span>⚠️ ocupada</span>}
      </div>

      {/* El origen del valor va SIEMPRE junto a la cifra: una estimación por
          comparables no puede parecer una tasación. */}
      {o?.valorMercado != null && (
        <div style={{ marginTop: 8, fontSize: 12, color: 'var(--muted)' }}>
          Valor de mercado {eur(o.valorMercado)} · {ORIGEN_VALOR[o.origenValor ?? 'tasacion']}
        </div>
      )}

      {o && o.coste.total > 0 && (
        <div style={{ marginTop: 10, fontSize: 13, color: 'var(--text)' }}>
          Coste real estimado: <strong>{eur(o.coste.total)}</strong>
          {o.deposito != null && <> · depósito para pujar {eur(o.deposito)}</>}
        </div>
      )}

      {/* Montaje perezoso: el detalle solo se renderiza al abrirlo. */}
      {o && (
        <>
          <button onClick={() => setAbierto((v) => !v)} style={{ ...boton(), marginTop: 10, minHeight: 36 }}>
            {abierto ? 'Ocultar detalle' : 'Ver detalle del coste'}
          </button>
          {abierto && (
            <div style={{ marginTop: 10, fontSize: 13, color: 'var(--text)' }}>
              <div style={{ marginBottom: 6 }}>
                {o.coste.impuestoConcepto} sobre {eur(o.coste.baseImponible)} ={' '}
                <strong>{eur(o.coste.impuestoTransmision)}</strong>
              </div>
              {o.motivos.length > 0 && (
                <ul style={{ margin: '6px 0', paddingLeft: 18 }}>
                  {o.motivos.map((m, i) => <li key={i}>{m}</li>)}
                </ul>
              )}
              {o.avisos.length > 0 && (
                <div style={{ marginTop: 8, padding: 10, borderRadius: 8, background: 'var(--warning-bg, #fef3c7)' }}>
                  <strong style={{ fontSize: 12 }}>Ojo:</strong>
                  <ul style={{ margin: '4px 0 0', paddingLeft: 18, fontSize: 12 }}>
                    {o.avisos.map((a, i) => <li key={i}>{a}</li>)}
                  </ul>
                </div>
              )}
            </div>
          )}
        </>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
        {s.url && (
          <a href={s.url} target="_blank" rel="noreferrer" style={{ ...boton(), display: 'inline-flex', alignItems: 'center', textDecoration: 'none' }}>
            Ver ficha oficial
          </a>
        )}
        {acciones}
      </div>
    </div>
  )
}

export default function SubastasClient({ inicial }: { inicial: Inicial | null }) {
  const [tab, setTab] = useState<'radar' | 'todas' | 'criterios'>('radar')
  const [datos, setDatos] = useState<Inicial | null>(inicial)
  const [visibles, setVisibles] = useState(PAGE)
  const [crit, setCrit] = useState<Criterios>(
    inicial?.criterios ?? {
      activo: false, provincias: [], palabras_clave: [],
      precio_min: null, precio_max: null, descuento_min: 0, excluir_ocupadas: false,
    },
  )
  const [guardando, setGuardando] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)

  const recargarRadar = useCallback(async () => {
    try {
      const r = await fetch('/api/subastas/radar')
      if (!r.ok) return
      const j = await r.json()
      setDatos((d) => (d ? { ...d, radar: j.anuncios ?? [] } : d))
    } catch { /* la vista previa se mantiene */ }
  }, [])

  async function guardarCriterios() {
    setGuardando(true)
    setAviso(null)
    try {
      const r = await fetch('/api/subastas/criterios', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(crit),
      })
      setAviso(r.ok ? 'Criterios guardados.' : 'No se pudieron guardar.')
    } catch {
      setAviso('No se pudieron guardar.')
    } finally {
      setGuardando(false)
    }
  }

  async function accionRadar(id: string, accion: 'visto' | 'descartar') {
    setDatos((d) => (d ? { ...d, radar: d.radar.filter((r) => (accion === 'descartar' ? r.id !== id : true)) } : d))
    await fetch('/api/subastas/radar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, accion }),
    }).catch(() => {})
  }

  async function seguir(s: Subasta) {
    await fetch('/api/subastas/seguidas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dedupe_key: s.dedupeKey, subasta: s }),
    }).catch(() => {})
    setAviso(`Siguiendo ${s.identificador ?? s.dedupeKey}.`)
  }

  useEffect(() => { setVisibles(PAGE) }, [tab])

  if (!datos) {
    return (
      <main style={{ padding: 16, maxWidth: 900, margin: '0 auto' }}>
        <h1 style={{ color: 'var(--text)' }}>⚖️ Subastas</h1>
        <p style={{ color: 'var(--muted)' }}>No se han podido cargar los datos. Reintenta en un momento.</p>
      </main>
    )
  }

  const toggleProvincia = (p: string) =>
    setCrit((c) => ({
      ...c,
      provincias: c.provincias.includes(p) ? c.provincias.filter((x) => x !== p) : [...c.provincias, p],
    }))

  return (
    <main style={{ padding: 16, maxWidth: 900, margin: '0 auto' }}>
      <h1 style={{ color: 'var(--text)', fontSize: 24, marginBottom: 4 }}>⚖️ Subastas</h1>
      <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 0 }}>
        Subastas de inmuebles del Portal del BOE. El coste y el descuento son <strong>estimaciones</strong> —
        incluyen el impuesto de transmisión pero no sustituyen a un análisis jurídico ni fiscal.
      </p>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '14px 0' }}>
        <button onClick={() => setTab('radar')} style={boton(tab === 'radar')}>
          🎯 Mi radar {datos.radar.length > 0 && `(${datos.radar.length})`}
        </button>
        <button onClick={() => setTab('todas')} style={boton(tab === 'todas')}>
          📋 Todas ({datos.total})
        </button>
        <button onClick={() => setTab('criterios')} style={boton(tab === 'criterios')}>⚙️ Criterios</button>
      </div>

      {aviso && (
        <div style={{ ...card, background: 'var(--primary-light, #eef2ff)', fontSize: 13 }}>{aviso}</div>
      )}

      {tab === 'radar' && (
        <section>
          {datos.tesoreria && <PanelTesoreria t={datos.tesoreria} />}
          {!crit.activo && (
            <div style={{ ...card, fontSize: 13 }}>
              El radar está <strong>desactivado</strong>. Actívalo en ⚙️ Criterios para recibir avisos por Telegram.
            </div>
          )}
          {datos.radar.length === 0 ? (
            <p style={{ color: 'var(--muted)' }}>
              Todavía no ha casado ninguna subasta con tus criterios.
            </p>
          ) : (
            <>
              {datos.radar.slice(0, visibles).map((r) => (
                <FichaSubasta
                  key={r.id}
                  s={r.subasta}
                  o={{
                    puntuacion: r.puntuacion,
                    descuento: null,
                    deposito: null,
                    valorMercado: null,
                    coste: { total: Number(r.coste_total ?? 0), impuestoTransmision: 0, impuestoConcepto: '', baseImponible: 0 },
                    motivos: r.motivos ?? [],
                    avisos: r.avisos ?? [],
                  }}
                  acciones={
                    <>
                      <button onClick={() => seguir(r.subasta)} style={boton()}>👀 Seguir</button>
                      <button onClick={() => accionRadar(r.id, 'descartar')} style={boton()}>🚫 Descartar</button>
                    </>
                  }
                />
              ))}
              {datos.radar.length > visibles && (
                <button onClick={() => setVisibles((v) => v + PAGE)} style={boton()}>
                  Ver más ({datos.radar.length - visibles} restantes)
                </button>
              )}
            </>
          )}
        </section>
      )}

      {tab === 'todas' && (
        <section>
          {datos.resultados.length === 0 ? (
            <p style={{ color: 'var(--muted)' }}>
              El corpus está vacío. La ingesta corre a diario desde las alertas del BOE en tu correo.
            </p>
          ) : (
            datos.resultados.slice(0, visibles).map((r) => (
              <FichaSubasta
                key={r.subasta.dedupeKey}
                s={r.subasta}
                o={r.oportunidad}
                acciones={<button onClick={() => seguir(r.subasta)} style={boton()}>👀 Seguir</button>}
              />
            ))
          )}
          {datos.resultados.length > visibles && (
            <button onClick={() => setVisibles((v) => v + PAGE)} style={boton()}>Ver más</button>
          )}
        </section>
      )}

      {tab === 'criterios' && (
        <section style={card}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 44, color: 'var(--text)' }}>
            <input type="checkbox" checked={crit.activo} onChange={(e) => setCrit({ ...crit, activo: e.target.checked })} />
            Radar activo (avisos por Telegram)
          </label>

          <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 6 }}>Provincias</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {PROVINCIAS.map((p) => (
                <button key={p} onClick={() => toggleProvincia(p)} style={boton(crit.provincias.includes(p))}>{p}</button>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 14 }}>
            <label style={{ display: 'grid', gap: 4, fontSize: 13, color: 'var(--muted)' }}>
              Precio máximo (€)
              <input
                type="number" inputMode="numeric" style={{ ...control, width: 160 }}
                value={crit.precio_max ?? ''}
                onChange={(e) => setCrit({ ...crit, precio_max: e.target.value === '' ? null : Number(e.target.value) })}
              />
            </label>
            <label style={{ display: 'grid', gap: 4, fontSize: 13, color: 'var(--muted)' }}>
              Descuento mínimo (%)
              <input
                type="number" inputMode="numeric" min={0} max={100} style={{ ...control, width: 160 }}
                value={crit.descuento_min}
                onChange={(e) => setCrit({ ...crit, descuento_min: Number(e.target.value) || 0 })}
              />
            </label>
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 44, marginTop: 8, color: 'var(--text)' }}>
            <input
              type="checkbox" checked={crit.excluir_ocupadas}
              onChange={(e) => setCrit({ ...crit, excluir_ocupadas: e.target.checked })}
            />
            Excluir inmuebles ocupados
          </label>
          <p style={{ fontSize: 12, color: 'var(--muted)', margin: '0 0 10px' }}>
            Ojo: también descarta las de posesión desconocida, que son muchas.
          </p>

          <button onClick={guardarCriterios} disabled={guardando} style={boton(true)}>
            {guardando ? 'Guardando…' : 'Guardar criterios'}
          </button>
        </section>
      )}
    </main>
  )
}
