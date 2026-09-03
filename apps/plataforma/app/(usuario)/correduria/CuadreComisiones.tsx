'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Receipt, TriangleAlert, PenLine } from 'lucide-react'
import { eur } from '@/lib/dinero'
import { Badge, btnStyle, type Tono } from '@/components/ui'
import Bloque from './Bloque'
import type { EstadoCuadre } from '@/lib/correduria/cuadre'

// Libro de comisiones: DEVENGADO (recibos cobrados) → LIQUIDADO (extracto de la
// compañía) → COBRADO (BBVA). Cada salto tiene su propio fallo y su propio
// destinatario, así que la tabla los enseña en columnas separadas.
//
// 🚨 Un importe que no ha llegado se pinta «—», NUNCA «0,00€»: la diferencia
// entre «Mapfre no me ha liquidado» y «Mapfre me liquidó 0 €» es sobre la que
// Alberto decide si reclama.

interface Periodo {
  companiaCodigo: string
  compania: string
  inicio: string
  fin: string
  esperado: number | null
  recibos: number | null
  liqBruto: number | null
  liqRetencion: number | null
  liqRemesa: number | null
  liqOrigen: string | null
  banco: number | null
  estado: EstadoCuadre
}

interface Cobertura {
  compania_codigo: string
  compania: string
  tiene_recibos_cima: boolean
  tiene_liq_cima: boolean
  tiene_correo_importe: boolean
  nota_gestion: string | null
}

interface Libro {
  año: number
  periodos: Periodo[]
  cobertura: Cobertura[]
  total: { bruto: number; retencion: number; cerrado: boolean; pendientes: number }
}

// El estado se lee por la FORMA de la píldora, no por un círculo de color: 🟠 y
// 🟡 son indistinguibles a 12px —y ahí estaba justo la diferencia entre «la
// compañía no ha liquidado» y «entró dinero que nadie explica»— y cada sistema
// operativo los dibuja distintos.
const SEMAFORO: Record<EstadoCuadre, { texto: string; tono: Tono }> = {
  'no-comprobado': { texto: 'No comprobado', tono: 'neutral' },
  'sin-cobertura': { texto: 'Sin fuente', tono: 'neutral' },
  'sin-datos': { texto: 'Sin datos aún', tono: 'neutral' },
  'esperado-sin-liquidar': { texto: 'Devengado sin liquidar', tono: 'aviso' },
  'liquidado-sin-cobrar': { texto: 'Liquidado sin ingresar', tono: 'aviso' },
  'cobrado-sin-liquidar': { texto: 'Ingreso sin explicar', tono: 'aviso' },
  deudor: { texto: 'Saldo deudor', tono: 'info' },
  descuadra: { texto: 'Descuadra', tono: 'negativo' },
  cuadra: { texto: 'Cuadra', tono: 'positivo' },
}

// Los estados que significan «todavía no se sabe» — el total anual con alguno
// de estos es provisional, y la UI tiene que decirlo.
const AYUDA: Partial<Record<EstadoCuadre, string>> = {
  'no-comprobado': 'La última lectura de CIMA falló. Los importes que se ven pueden estar viejos.',
  'sin-cobertura': 'Esa compañía no tiene ninguna fuente de importe. Es una gestión pendiente (pedirlo a TIREA), no un dato por llegar.',
  'esperado-sin-liquidar': 'Los recibos se cobraron pero la compañía no ha mandado extracto. Es el caso de Mapfre: confirma el importe a mano cuando llegue.',
  'liquidado-sin-cobrar': 'La compañía reconoce la comisión y todavía no está en el BBVA.',
  'cobrado-sin-liquidar': 'Entró dinero de esa compañía que ninguna fuente explica.',
  deudor: 'Comisión negativa con remesa 0: la compañía se queda a deber. No hay nada que reclamar.',
  descuadra: 'Dos fuentes del mismo periodo no coinciden. Mira el desglose antes de reclamar.',
}

// `—` y no «0,00€»: null significa que el importe no ha llegado.
const imp = (n: number | null) => (n == null ? '—' : eur(n))

function fmt(iso: string) {
  const [y, m, d] = iso.split('-')
  return d && m && y ? `${d}/${m}` : iso
}

// La letra pequeña que califica el titular. NO se borra por minimalismo: sin
// ella, «bruto» y «remesa» parecen el mismo número mal sumado.
const SUB = (
  <>
    Devengado (recibos cobrados) → liquidado (extracto) → cobrado (BBVA).{' '}
    <b>La retención la hace y la ingresa la compañía</b>, no tú: cobras ya el neto. Ese 15 % lo
    declaran en el modelo 190 a tu nombre, así que en tu renta cuenta como <b>pago a cuenta</b> (se
    resta de la cuota), nunca como un gasto. De ahí que <b>a tu renta vaya el bruto</b> y al banco
    llegue la <b>remesa</b> (bruto − retención): comparar el bruto contra el banco descuadra
    siempre por ese 15 %. Un importe que no ha llegado se pinta «—», nunca 0,00€.
  </>
)

export default function CuadreComisiones({ año, onContador, primero }: {
  año: number
  /**
   * Cuántos periodos siguen SIN dato (`total.pendientes`), para el contador de
   * la sección. Se llama una vez por carga, nunca en el render.
   *
   * 🚨 `null` es «no se ha podido leer» (o «todavía cargando») y NO se colapsa
   * a 0: un 0 diría «el libro está cerrado», que es justo lo contrario.
   */
  onContador?: (n: number | null) => void
  primero?: boolean
}) {
  const [libro, setLibro] = useState<Libro | null>(null)
  const [fallo, setFallo] = useState(false)
  const [confirmando, setConfirmando] = useState<Periodo | null>(null)

  // El callback vive en una ref para que `cargar` no dependa de su identidad:
  // el padre suele pasar una flecha en línea, y meterla en las deps del
  // `useEffect` sería un fetch por render.
  const contador = useRef(onContador)
  useEffect(() => { contador.current = onContador })

  const cargar = useCallback(() => {
    setFallo(false)
    contador.current?.(null)
    fetch(`/api/correduria/comisiones?año=${año}`)
      .then(r => { if (!r.ok) throw new Error('no'); return r.json() })
      .then((l: Libro) => {
        setLibro(l)
        contador.current?.(typeof l?.total?.pendientes === 'number' ? l.total.pendientes : null)
      })
      .catch(() => { setLibro(null); setFallo(true); contador.current?.(null) })
  }, [año])

  useEffect(() => { cargar() }, [cargar])

  if (fallo) {
    return (
      <Bloque
        titulo={`Cuadre de comisiones ${año} · sin respuesta`}
        Icono={Receipt}
        tono="malo"
        primero={primero}
      >
        <div style={{ fontSize: 13, color: 'var(--muted)' }}>
          No se ha podido leer el libro de comisiones. Esto NO significa que no haya comisiones.
        </div>
      </Bloque>
    )
  }

  if (!libro) {
    return (
      <Bloque titulo={`Cuadre de comisiones ${año}`} Icono={Receipt} primero={primero}>
        <div style={{ fontSize: 13, color: 'var(--muted)' }}>Cargando cuadre de comisiones…</div>
      </Bloque>
    )
  }

  const { periodos, cobertura, total } = libro
  const sinFuente = cobertura.filter(c => !c.tiene_recibos_cima && !c.tiene_liq_cima && !c.tiene_correo_importe)

  return (
    <Bloque titulo={`Cuadre de comisiones ${libro.año}`} sub={SUB} Icono={Receipt} primero={primero}>

      {/* ── Total del año ─────────────────────────────────────────────────── */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))',
        gap: 12, marginBottom: 14,
      }}>
        <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px' }}>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>Comisión bruta (a tu renta)</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--primary)', fontVariantNumeric: 'tabular-nums' }}>
            {eur(total.bruto)}
          </div>
        </div>
        <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px' }}>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>Retención 15 % (modelo 190)</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>
            {eur(total.retencion)}
          </div>
        </div>
      </div>

      {/* 🚨 Un total con huecos NO se presenta como definitivo: es la cifra que
          Alberto manda a la asesoría. */}
      {!total.cerrado && (
        <div style={{
          display: 'flex', gap: 8, alignItems: 'flex-start',
          background: 'var(--warning-bg)', border: '1px solid var(--warning)', borderRadius: 8,
          padding: '10px 12px', fontSize: 13, color: 'var(--warning)', marginBottom: 14,
        }}>
          <TriangleAlert size={15} strokeWidth={1.75} aria-hidden style={{ flexShrink: 0, marginTop: 2 }} />
          <span>
            <b>Total provisional.</b> {total.pendientes} periodo(s) sin dato o sin fuente todavía, así
            que esta cifra puede subir. No la mandes a la asesoría como cerrada.
          </span>
        </div>
      )}

      {/* ── Periodos ──────────────────────────────────────────────────────── */}
      {periodos.length === 0 ? (
        <div style={{ fontSize: 13, color: 'var(--muted)', padding: '12px 0' }}>
          Todavía no hay ningún periodo del {libro.año} en el libro. Esto es «no ha llegado nada aún»,
          no «no has cobrado comisiones»: lo rellena el agente cuando lee la cartera de CIMA.
        </div>
      ) : (
        <div className="cuadre-wrap">
          <table className="cuadre-tabla">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                <th style={{ textAlign: 'left', color: 'var(--muted)', fontWeight: 600 }}>Compañía</th>
                <th style={{ textAlign: 'left', color: 'var(--muted)', fontWeight: 600 }}>Periodo</th>
                <th className="num" style={{ color: 'var(--muted)', fontWeight: 600 }}>Devengado</th>
                <th className="num" style={{ color: 'var(--muted)', fontWeight: 600 }}>Liquidado</th>
                <th className="num" style={{ color: 'var(--muted)', fontWeight: 600 }}>Retención</th>
                <th className="num" style={{ color: 'var(--muted)', fontWeight: 600 }}>Remesa</th>
                <th className="num" style={{ color: 'var(--muted)', fontWeight: 600 }}>Banco</th>
                <th style={{ textAlign: 'left', color: 'var(--muted)', fontWeight: 600 }}>Estado</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {periodos.map(p => {
                const s = SEMAFORO[p.estado]
                return (
                  <tr key={`${p.companiaCodigo}-${p.inicio}-${p.fin}`} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ fontWeight: 600 }}>{p.compania}</td>
                    <td style={{ color: 'var(--muted)' }}>{fmt(p.inicio)} → {fmt(p.fin)}</td>
                    <td className="num" title={p.recibos != null ? `${p.recibos} recibo(s) cobrado(s)` : 'sin recibos leídos'}>
                      {imp(p.esperado)}
                    </td>
                    <td className="num" style={{ fontWeight: 600 }}>
                      {imp(p.liqBruto)}
                      {p.liqOrigen === 'manual' && (
                        <span
                          title="confirmado a mano"
                          aria-label="confirmado a mano"
                          style={{ marginLeft: 4, color: 'var(--muted)', display: 'inline-flex', verticalAlign: '-2px' }}
                        >
                          <PenLine size={13} strokeWidth={1.75} aria-hidden />
                        </span>
                      )}
                    </td>
                    <td className="num">{imp(p.liqRetencion)}</td>
                    <td className="num">{imp(p.liqRemesa)}</td>
                    <td className="num">{imp(p.banco)}</td>
                    <td>
                      <Badge tono={s.tono} title={AYUDA[p.estado] ?? undefined}>{s.texto}</Badge>
                    </td>
                    <td>
                      <button
                        className="cuadre-btn"
                        onClick={() => setConfirmando(p)}
                        style={{ ...btnStyle('secundario', 'sm'), minHeight: 44, padding: '0 12px' }}
                      >Anotar</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Cobertura ─────────────────────────────────────────────────────── */}
      {/* Sin esto el total parecería completo estando ciego a compañías enteras. */}
      {sinFuente.length > 0 && (
        <div style={{
          marginTop: 14, border: '1px solid var(--border)', borderRadius: 8,
          padding: '10px 12px', fontSize: 13, color: 'var(--muted)',
        }}>
          <b>Sin ninguna fuente de importe:</b> {sinFuente.map(c => c.compania).join(', ')}. No es que no
          te paguen: es que no llega ni por CIMA ni por correo, así que sus comisiones NO están en el total
          de arriba. Pedirlo a TIREA es una gestión pendiente.
        </div>
      )}

      {confirmando && (
        <ModalConfirmar
          periodo={confirmando}
          onCerrar={() => setConfirmando(null)}
          onGuardado={() => { setConfirmando(null); cargar() }}
        />
      )}
    </Bloque>
  )
}

// ── Confirmación manual ─────────────────────────────────────────────────────
// El camino de Mapfre: manda la liquidación en un PDF cifrado tras un enlace que
// caduca, así que el agente avisa y Alberto teclea el importe. Queda marcado
// `manual` — el libro nunca mezcla en silencio lo tecleado con lo de CIMA.
function ModalConfirmar({ periodo, onCerrar, onGuardado }: {
  periodo: Periodo
  onCerrar: () => void
  onGuardado: () => void
}) {
  const [bruto, setBruto] = useState(periodo.liqBruto != null ? String(periodo.liqBruto) : '')
  const [retencion, setRetencion] = useState(periodo.liqRetencion != null ? String(periodo.liqRetencion) : '')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  const numero = (s: string): number | null => {
    const n = Number(s.replace(/\./g, '').replace(',', '.').trim())
    return s.trim() !== '' && Number.isFinite(n) ? n : null
  }

  const guardar = async () => {
    const b = numero(bruto)
    if (b == null) { setError('Escribe la comisión bruta del extracto.'); return }
    setGuardando(true)
    setError('')
    const r = await fetch('/api/correduria/comisiones/confirmar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        companiaCodigo: periodo.companiaCodigo,
        compania: periodo.compania,
        inicio: periodo.inicio,
        fin: periodo.fin,
        bruto: b,
        // Sin retención NO se deriva la remesa: se deja sin saber, que es la verdad.
        ...(numero(retencion) != null ? { retencion: numero(retencion) } : {}),
      }),
    }).catch(() => null)
    setGuardando(false)
    if (!r || !r.ok) { setError('No se ha podido guardar. Reinténtalo.'); return }
    onGuardado()
  }

  const campo: React.CSSProperties = {
    width: '100%', padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 8,
    background: 'var(--surface)', color: 'var(--text)', fontSize: 15, minHeight: 44,
  }

  return (
    <div
      onClick={onCerrar}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', display: 'flex',
        alignItems: 'center', justifyContent: 'center', padding: 12, zIndex: 50,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12,
          padding: 20, width: '95vw', maxWidth: 420,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontWeight: 700, fontSize: 15, marginBottom: 4 }}>
          <PenLine size={15} strokeWidth={1.75} aria-hidden />
          {periodo.compania} · {fmt(periodo.inicio)} → {fmt(periodo.fin)}
        </div>
        <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 14 }}>
          Copia los importes del extracto de la compañía. Queda marcado como confirmado a mano, y CIMA
          ya no lo pisa.
        </div>

        <label style={{ display: 'block', fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>
          Comisión bruta (€)
        </label>
        <input style={{ ...campo, marginBottom: 12 }} value={bruto} onChange={e => setBruto(e.target.value)} inputMode="decimal" placeholder="95,03" />

        <label style={{ display: 'block', fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>
          Retención IRPF (€) — opcional
        </label>
        <input style={campo} value={retencion} onChange={e => setRetencion(e.target.value)} inputMode="decimal" placeholder="14,26" />
        <div style={{ fontSize: 11, color: 'var(--muted)', margin: '6px 0 14px' }}>
          Si la dejas en blanco, la remesa se queda sin saber (no se inventa restando un 15 %).
        </div>

        {error && <div style={{ fontSize: 13, color: 'var(--negative)', marginBottom: 10 }}>{error}</div>}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <button onClick={onCerrar} style={btnStyle('secundario')}>Cancelar</button>
          <button
            onClick={guardar}
            disabled={guardando}
            style={{ ...btnStyle('primario'), opacity: guardando ? 0.6 : 1 }}
          >{guardando ? 'Guardando…' : 'Guardar'}</button>
        </div>
      </div>
    </div>
  )
}
