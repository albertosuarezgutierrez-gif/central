'use client'
import Link from 'next/link'
import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

type Motivo = 'venta' | 'precio' | 'otro'
type Hecho = { liberada: boolean; liberaSolaAt: string | null; advertencia: string | null }

const DIAS_AVISO = 30
const MS_DIA = 86_400_000

function hoyMadrid(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' })
}

function restarDias(iso: string, dias: number): string {
  return new Date(Date.parse(`${iso}T12:00:00Z`) - dias * MS_DIA).toISOString().slice(0, 10)
}

function cuando(iso: string): string {
  const d = new Date(iso)
  const f = d.toLocaleDateString('es-ES', { timeZone: 'Europe/Madrid', day: '2-digit', month: '2-digit', year: 'numeric' })
  const h = d.toLocaleTimeString('es-ES', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit' })
  return `${f} a las ${h}`
}

/**
 * «Solicitar baja» de UNA póliza (en su fila de la bóveda): un botón y un modal.
 *
 * Reglas (diseño revisado por arquitectura):
 *  - El motivo es OBLIGATORIO: venta del bien, precio u otro (con texto).
 *  - «Precio»: ANTES de pedir la baja se le ofrece mejorárselo (enlace al flujo de «mejorar el precio»); solo si insiste
 *    («Sigo queriendo la baja») se piden, opcionales, con qué compañía se compara y qué precio le ofrecen.
 *  - «Venta»: pide la fecha de venta (hasta 90 días atrás, no futura).
 *  - Si falta menos de un mes para el vencimiento se avisa de que puede llegar tarde (art. 22 LCS).
 *  - Lo pedido NO se firma de inmediato: lo revisamos (te llamamos) y se libera a las 48 h. La pantalla lo dice.
 *  - La póliza la valida el servidor contra la ficha del cliente; aquí solo se pide.
 */
/** `puedeMejorarPrecio`: la página «Mejorar el precio» aceptaría esta póliza (si no, daría 404: no se enlaza). */
export function SolicitarBaja({ polizaId, titulo, vencimiento, puedeMejorarPrecio }: { polizaId: string; titulo: string; vencimiento: string | null; puedeMejorarPrecio: boolean }) {
  const router = useRouter()
  const dialogo = useRef<HTMLDialogElement>(null)
  const [motivo, setMotivo] = useState<Motivo | null>(null)
  const [sigue, setSigue] = useState(false)
  const [fechaVenta, setFechaVenta] = useState('')
  const [texto, setTexto] = useState('')
  const [competidor, setCompetidor] = useState('')
  const [precio, setPrecio] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)
  const [hecho, setHecho] = useState<Hecho | null>(null)

  const hoy = hoyMadrid()
  const diasAlVencimiento = vencimiento ? Math.round((Date.parse(`${vencimiento}T00:00:00Z`) - Date.parse(`${hoy}T00:00:00Z`)) / MS_DIA) : null
  const tarde = motivo !== null && motivo !== 'venta' && diasAlVencimiento !== null && diasAlVencimiento < DIAS_AVISO

  function abrir() {
    setAviso(null)
    dialogo.current?.showModal()
  }
  function cerrar() {
    dialogo.current?.close()
    // Tras pedirla, la página se recarga para que la baja aparezca en «Pendiente de tu firma» / «La estamos revisando».
    if (hecho) router.refresh()
  }

  const listo =
    motivo !== null &&
    (motivo === 'venta' ? fechaVenta !== '' : motivo === 'otro' ? texto.trim() !== '' : sigue || !puedeMejorarPrecio)

  async function enviar() {
    if (!motivo || !listo) return
    setOcupado(true)
    setAviso(null)
    try {
      const r = await fetch('/api/anulacion/solicitar', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          polizaId, motivo,
          ...(motivo === 'venta' ? { fechaVenta } : {}),
          ...(motivo === 'otro' ? { motivoTexto: texto } : {}),
          ...(motivo === 'precio' ? { ofertaPrecioVista: true, competidor, precioOfrecido: precio } : {}),
        }),
      })
      const j = ((await r.json().catch(() => null)) ?? {}) as Record<string, unknown>
      if (r.status === 201 && j.estado === 'ok') {
        setHecho({
          liberada: j.liberada === true,
          liberaSolaAt: typeof j.liberaSolaAt === 'string' ? j.liberaSolaAt : null,
          advertencia: typeof j.advertencia === 'string' ? j.advertencia : null,
        })
      } else if (j.estado === 'ofrecer_presupuesto') {
        setSigue(false)
        setAviso(typeof j.motivo === 'string' ? j.motivo : 'Antes de la baja, déjanos mejorarte el precio.')
      } else if (typeof j.motivo === 'string') {
        setAviso(j.motivo)
      } else if (r.status === 401) {
        setAviso('Tu sesión ha caducado. Vuelve a entrar.')
      } else {
        setAviso('No sabemos si la solicitud ha llegado. Recarga la página antes de volver a intentarlo, o llámanos.')
      }
    } catch {
      setAviso('No sabemos si la solicitud ha llegado. Recarga la página antes de volver a intentarlo, o llámanos.')
    } finally {
      setOcupado(false)
    }
  }

  return (
    <div style={{ padding: '0 12px 10px' }}>
      <button type="button" className="boton-tenue" style={{ minHeight: 44 }} onClick={abrir}>
        Solicitar baja
      </button>
      <dialog
        ref={dialogo}
        aria-labelledby={`baja-${polizaId}`}
        onClose={() => { if (hecho) router.refresh() }}
        style={{ width: '95vw', maxWidth: 520, maxHeight: '90vh', overflowY: 'auto', boxSizing: 'border-box', padding: 16, border: '1px solid var(--border)', borderRadius: 12, background: 'var(--surface)', color: 'var(--text)', fontFamily: 'inherit' }}
      >
        {hecho ? (
          <div style={{ display: 'grid', gap: 12 }}>
            <h2 id={`baja-${polizaId}`} style={{ margin: 0, fontSize: 18 }}>Solicitud recibida</h2>
            <p style={{ margin: 0, fontSize: 15 }}>
              {hecho.liberada
                ? 'Como el efecto es inminente, ya puedes firmarla: la verás en «Pendiente de tu firma».'
                : `La estamos revisando y te llamaremos. Podrás firmarla a partir del ${hecho.liberaSolaAt ? cuando(hecho.liberaSolaAt) : 'plazo de 48 horas'}, o antes si ya hemos hablado.`}
            </p>
            {hecho.advertencia && <p className="suave" style={{ margin: 0, fontSize: 14 }}>{hecho.advertencia}</p>}
            <button type="button" className="boton" style={{ minHeight: 48 }} onClick={cerrar}>Entendido</button>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 12 }}>
            <h2 id={`baja-${polizaId}`} style={{ margin: 0, fontSize: 18, overflowWrap: 'anywhere' }}>Solicitar la baja · {titulo}</h2>
            <p className="suave" style={{ margin: 0, fontSize: 14 }}>
              Cuéntanos por qué. No se da de baja nada todavía: primero lo revisamos contigo y luego la firmas tú.
            </p>

            <fieldset style={{ border: 0, margin: 0, padding: 0, display: 'grid', gap: 8 }}>
              <legend style={{ fontSize: 14, fontWeight: 600, padding: 0, marginBottom: 4 }}>Motivo</legend>
              {([['venta', 'He vendido el bien asegurado'], ['precio', 'Es por el precio'], ['otro', 'Otro motivo']] as const).map(([v, t]) => (
                <label key={v} style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 44, fontSize: 15 }}>
                  <input type="radio" name={`motivo-${polizaId}`} checked={motivo === v} onChange={() => { setMotivo(v); setSigue(false); setAviso(null) }} style={{ width: 20, height: 20 }} />
                  {t}
                </label>
              ))}
            </fieldset>

            {motivo === 'venta' && (
              <label style={{ display: 'grid', gap: 4, fontSize: 14 }}>
                Fecha de la venta
                <input className="campo" type="date" value={fechaVenta} min={restarDias(hoy, 90)} max={hoy} onChange={(e) => setFechaVenta(e.target.value)} />
              </label>
            )}

            {motivo === 'precio' && puedeMejorarPrecio && !sigue && (
              <div style={{ display: 'grid', gap: 10, padding: 12, border: '1px solid var(--border)', borderRadius: 8 }}>
                <p style={{ margin: 0, fontSize: 15 }}>
                  Antes de irte, déjanos intentar mejorártelo: te preparamos un presupuesto sin compromiso y, si hay uno mejor, ni te enteras del cambio.
                </p>
                <Link href={`/boveda/mejorar/${polizaId}`} className="boton" style={{ minHeight: 48, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                  Que me mejoren el precio
                </Link>
                <button type="button" className="boton-tenue" style={{ minHeight: 44 }} onClick={() => setSigue(true)}>
                  Sigo queriendo la baja
                </button>
              </div>
            )}

            {motivo === 'precio' && (sigue || !puedeMejorarPrecio) && (
              <div style={{ display: 'grid', gap: 10 }}>
                <label style={{ display: 'grid', gap: 4, fontSize: 14 }}>
                  ¿Con qué compañía? (opcional)
                  <input className="campo" maxLength={60} value={competidor} onChange={(e) => setCompetidor(e.target.value)} />
                </label>
                <label style={{ display: 'grid', gap: 4, fontSize: 14 }}>
                  ¿Qué precio te ofrecen al año? (opcional, en €)
                  <input className="campo" inputMode="decimal" maxLength={12} placeholder="123,45" value={precio} onChange={(e) => setPrecio(e.target.value.replace(/[^\d.,]/g, ''))} />
                </label>
              </div>
            )}

            {motivo === 'otro' && (
              <label style={{ display: 'grid', gap: 4, fontSize: 14 }}>
                Cuéntanos el motivo
                <textarea className="campo" rows={3} maxLength={500} value={texto} onChange={(e) => setTexto(e.target.value)} />
              </label>
            )}

            {tarde && (
              <p className="suave" style={{ margin: 0, fontSize: 14 }}>
                Falta menos de un mes para el vencimiento: la compañía podría renovarla otro año aunque pidas la baja ahora (art. 22 de la Ley de Contrato de Seguro). Te llamamos para verlo.
              </p>
            )}

            {aviso && <p className="error-linea" role="alert" style={{ margin: 0 }}>{aviso}</p>}

            <div style={{ display: 'grid', gap: 8 }}>
              <button type="button" className="boton" style={{ minHeight: 48 }} disabled={ocupado || !listo} onClick={enviar}>
                {ocupado ? 'Enviando…' : 'Solicitar la baja'}
              </button>
              <button type="button" className="boton-tenue" style={{ minHeight: 44 }} disabled={ocupado} onClick={cerrar}>
                Cancelar
              </button>
            </div>
          </div>
        )}
      </dialog>
    </div>
  )
}
