'use client'
import { useCallback, useEffect, useState } from 'react'

type Aviso = {
  id: string
  titulo: string
  que: string
  cuando: string
  categoria: string
  critico?: boolean
  activo: boolean
  enviados: number | null
  omitidos: number | null
  ultimo: string | null
}
type Categoria = { id: string; nombre: string; icono: string }
type Datos = {
  categorias: Categoria[]
  avisos: Aviso[]
  dias: number
  registroDesde: string | null
  bitacoraDisponible: boolean
  preferenciasDisponibles: boolean
}

const card: React.CSSProperties = {
  background: 'var(--surface)', border: '1px solid var(--border)',
  borderRadius: 12, padding: 16, marginBottom: 12,
}

function fecha(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

/** Interruptor táctil (≥44 px de alto de zona activa, se usa desde el móvil). */
function Interruptor({ activo, onClick, disabled }: { activo: boolean; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={activo}
      aria-label={activo ? 'Silenciar este aviso' : 'Activar este aviso'}
      style={{
        width: 52, minWidth: 52, height: 30, borderRadius: 15, position: 'relative',
        border: '1px solid var(--border)', cursor: disabled ? 'not-allowed' : 'pointer',
        background: activo ? 'var(--primary)' : 'var(--border)',
        opacity: disabled ? 0.5 : 1, padding: 0, transition: 'background .15s',
      }}
    >
      <span style={{
        position: 'absolute', top: 3, left: activo ? 25 : 3, width: 22, height: 22,
        borderRadius: '50%', background: '#fff', transition: 'left .15s',
        boxShadow: '0 1px 3px rgba(0,0,0,.3)',
      }} />
    </button>
  )
}

export default function TelegramClient() {
  const [datos, setDatos] = useState<Datos | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState<string | null>(null)
  const [abiertas, setAbiertas] = useState<Set<string>>(new Set())

  const cargar = useCallback(async () => {
    const r = await fetch('/api/telegram/avisos')
    if (!r.ok) { setError('No se pudo cargar el panel.'); return }
    setDatos(await r.json())
  }, [])
  useEffect(() => { cargar() }, [cargar])

  async function cambiar(cuerpo: { avisoId?: string; categoria?: string; activo: boolean }, marca: string) {
    if (!datos) return
    setGuardando(marca)
    setError(null)
    // Optimista: la lista sigue en pantalla y solo se atenúa la fila que se está guardando.
    const afectados = new Set(
      cuerpo.categoria
        ? datos.avisos.filter(a => a.categoria === cuerpo.categoria && !a.critico).map(a => a.id)
        : [cuerpo.avisoId!],
    )
    const previo = datos
    setDatos({ ...datos, avisos: datos.avisos.map(a => afectados.has(a.id) ? { ...a, activo: cuerpo.activo } : a) })
    const r = await fetch('/api/telegram/avisos', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo),
    })
    if (!r.ok) {
      setDatos(previo)
      const d = await r.json().catch(() => ({}))
      setError(d.error || 'No se pudo guardar el cambio.')
    }
    setGuardando(null)
  }

  if (error && !datos) return <div style={{ padding: 24, color: 'var(--negative)' }}>{error}</div>
  if (!datos) return <div style={{ padding: 24, color: 'var(--muted)' }}>Cargando…</div>

  const total = datos.avisos.length
  const silenciados = datos.avisos.filter(a => !a.activo).length
  const recibidos = datos.bitacoraDisponible
    ? datos.avisos.reduce((s, a) => s + (a.enviados ?? 0), 0)
    : null
  const ahorrados = datos.bitacoraDisponible
    ? datos.avisos.reduce((s, a) => s + (a.omitidos ?? 0), 0)
    : null

  return (
    <div style={{ padding: '20px 16px', maxWidth: 900, margin: '0 auto' }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 4px' }}>🔔 Avisos de Telegram</h1>
      <p style={{ color: 'var(--muted)', fontSize: 14, margin: '0 0 16px' }}>
        Todo lo que el bot te manda por su cuenta, y el interruptor de cada cosa. Lo que apagues
        aquí deja de enviarse (los agentes lo siguen haciendo y lo puedes ver en su pantalla).
      </p>

      {/* Titular */}
      <div style={{ ...card, display: 'flex', gap: 20, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 24, fontWeight: 700 }}>{total}</div>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>tipos de aviso</div>
        </div>
        <div>
          <div style={{ fontSize: 24, fontWeight: 700, color: silenciados ? 'var(--warning, #b45309)' : 'var(--text)' }}>{silenciados}</div>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>silenciados</div>
        </div>
        <div>
          <div style={{ fontSize: 24, fontWeight: 700 }}>{recibidos ?? '—'}</div>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>recibidos ({datos.dias} días)</div>
        </div>
        <div>
          <div style={{ fontSize: 24, fontWeight: 700, color: ahorrados ? 'var(--positive, #15803d)' : 'var(--text)' }}>{ahorrados ?? '—'}</div>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>no enviados por ti</div>
        </div>
      </div>

      {/* Qué se sabe y qué no. Un 0 sin registro NO es «no llega ninguno». */}
      {!datos.preferenciasDisponibles && (
        <div style={{ ...card, borderColor: 'var(--negative, #b91c1c)', fontSize: 13 }}>
          ⚠️ No se pueden leer las preferencias (¿falta aplicar la migración
          {' '}<code>2026-09-01_telegram_avisos.sql</code>?). Mientras tanto <b>todos los avisos siguen
          llegando</b> — los interruptores no guardarán nada.
        </div>
      )}
      {!datos.bitacoraDisponible ? (
        <div style={{ ...card, fontSize: 13, color: 'var(--muted)' }}>
          ℹ️ No se ha podido leer el registro de envíos, así que <b>no se sabe</b> cuántos avisos han
          llegado. Los interruptores funcionan igual.
        </div>
      ) : datos.registroDesde === null ? (
        <div style={{ ...card, fontSize: 13, color: 'var(--muted)' }}>
          ℹ️ El registro de envíos acaba de empezar: los contadores están a cero porque <b>aún no se
          ha medido nada</b>, no porque no lleguen avisos. En un par de días esta pantalla ya dirá
          cuáles te llegan de verdad y cuántas veces.
        </div>
      ) : (
        <div style={{ fontSize: 12, color: 'var(--muted)', margin: '0 0 12px' }}>
          Contadores de los últimos {datos.dias} días · registro desde el {fecha(datos.registroDesde)}
        </div>
      )}

      {error && <div style={{ ...card, borderColor: 'var(--negative, #b91c1c)', fontSize: 13 }}>⚠️ {error}</div>}

      {datos.categorias.map(cat => {
        const items = datos.avisos.filter(a => a.categoria === cat.id)
        if (items.length === 0) return null
        const activos = items.filter(a => a.activo).length
        const silenciables = items.filter(a => !a.critico)
        const abierta = abiertas.has(cat.id)
        return (
          <div key={cat.id} style={card}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => setAbiertas(s => {
                  const n = new Set(s); n.has(cat.id) ? n.delete(cat.id) : n.add(cat.id); return n
                })}
                style={{
                  flex: 1, minWidth: 180, minHeight: 44, display: 'flex', alignItems: 'center', gap: 10,
                  background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                  color: 'var(--text)', font: 'inherit', textAlign: 'left',
                }}
              >
                <span style={{ fontSize: 18 }}>{cat.icono}</span>
                <span style={{ fontWeight: 600 }}>{cat.nombre}</span>
                <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                  {activos}/{items.length} activos
                </span>
                <span style={{ marginLeft: 'auto', color: 'var(--muted)' }}>{abierta ? '▲' : '▼'}</span>
              </button>
              {silenciables.length > 0 && (
                <button
                  type="button"
                  disabled={guardando === `cat:${cat.id}`}
                  onClick={() => cambiar(
                    { categoria: cat.id, activo: silenciables.some(a => !a.activo) },
                    `cat:${cat.id}`,
                  )}
                  style={{
                    minHeight: 44, padding: '0 14px', borderRadius: 8, fontSize: 13,
                    border: '1px solid var(--border)', background: 'var(--surface)',
                    color: 'var(--text)', cursor: 'pointer',
                  }}
                >
                  {silenciables.some(a => !a.activo) ? 'Activar todos' : 'Silenciar todos'}
                </button>
              )}
            </div>

            {/* Montaje perezoso: el detalle de la categoría solo existe en el DOM si está abierta. */}
            {abierta && (
              <div style={{ marginTop: 12, borderTop: '1px solid var(--border)' }}>
                {items.map(a => (
                  <div key={a.id} style={{
                    display: 'flex', gap: 12, alignItems: 'flex-start',
                    padding: '12px 0', borderBottom: '1px solid var(--border)',
                    opacity: guardando === a.id ? 0.5 : 1,
                  }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>
                        {a.titulo}
                        {a.critico && (
                          <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--muted)' }}>
                            · no se puede silenciar
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 2 }}>{a.que}</div>
                      <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
                        🕐 {a.cuando}
                        {datos.bitacoraDisponible && datos.registroDesde !== null && (
                          <>
                            {' · '}
                            {a.enviados === 0 && a.omitidos === 0
                              ? 'no ha llegado ninguno en este periodo'
                              : `${a.enviados} enviado(s)${a.omitidos ? ` · ${a.omitidos} silenciado(s)` : ''}`}
                            {a.ultimo && ` · último el ${fecha(a.ultimo)}`}
                          </>
                        )}
                      </div>
                    </div>
                    <Interruptor
                      activo={a.activo}
                      disabled={!!a.critico || guardando === a.id}
                      onClick={() => { if (!a.critico) cambiar({ avisoId: a.id, activo: !a.activo }, a.id) }}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })}

      <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 16 }}>
        Aquí solo están los avisos que el bot manda <b>por su cuenta</b>. Sus respuestas a tus
        mensajes y a los botones (agente contable, borradores de huéspedes, clasificar un
        movimiento…) no se silencian: apagarlas rompería la conversación, no quitaría ruido.
      </p>
    </div>
  )
}
