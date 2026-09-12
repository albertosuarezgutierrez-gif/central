'use client'

// El panel de EMISIÓN REAL, construido el 11/09/2026 sobre el caso de Pilar
// Franco Ruz. Sustituye a la maqueta `preemision-mock.tsx` (borrada): esto SÍ
// llama a Codeoscopic, dos veces.
//
// 🚨 SIN SANDBOX y sin fixture del fabricante para las dos llamadas de aquí
// detrás (ReRate y Submit) — ver `apps/asegura/lib/codeoscopic/emitir.ts`.
// Por eso el paso 2 (los «campos adicionales») es un JSON en bruto y no un
// formulario bonito por compañía: los nombres de esos campos NO están
// confirmados contra el fabricante, y un formulario con etiquetas inventadas
// prometería un contrato que no existe. Lo que SÍ hace el paso 2 es mostrar,
// literalmente, la lista que el propio vendor dice que le falta (`faltan` +
// `campos`, servidos por `GET .../policy-application-fields`) para que se
// puedan rellenar con esos nombres exactos, no con una suposición.
//
// Dos pasos, cada uno con su propia confirmación — nunca uno solo que
// encadene las dos llamadas: el coste/compromiso de cada una es distinto y
// ninguna de las dos se puede deshacer sola.

import { useState } from 'react'
import { eur } from '@/lib/dinero'
import { pedirOferta, pedirEmision } from './acciones'

type EstadoPanel =
  | { paso: 'inicio' }
  | { paso: 'confirmando' }
  | {
      paso: 'oferta'
      offerId: string
      primaEur: number | null
      firmeza: string
      caducaEn: string | null
      avisos: string[]
      // El `projectId` que hace falta para el Submit lo devuelve `pedirOferta`.
      projectId: string
    }
  | { paso: 'emitiendo' }
  | { paso: 'faltan_campos'; faltan: string[]; campos: unknown; projectId: string }
  | { paso: 'emitido'; referenciaVendor: string | null }
  | { paso: 'emitido_sin_acunar'; mensaje: string }
  | { paso: 'error'; mensaje: string }

function euroODash(n: number | null): string {
  return n === null || !Number.isFinite(n) ? '—' : eur(n)
}

export function Emision({
  tarificacionId,
  compania,
  categoria,
  primaEur,
  onCerrar,
}: {
  tarificacionId: string
  compania: string
  categoria: string
  primaEur: number | null
  onCerrar: () => void
}) {
  const [estado, setEstado] = useState<EstadoPanel>({ paso: 'inicio' })
  const [camposJson, setCamposJson] = useState('{}')
  const [fechaEfectoCorregida, setFechaEfectoCorregida] = useState('')

  async function confirmarPrecio() {
    setEstado({ paso: 'confirmando' })
    const r = await pedirOferta({
      tarificacionId,
      compania,
      categoria,
      ...(fechaEfectoCorregida ? { fechaEfectoCorregida } : {}),
    })
    if (r.estado === 'ok') {
      setEstado({
        paso: 'oferta',
        offerId: r.offerId,
        primaEur: r.primaEur,
        firmeza: r.firmeza,
        caducaEn: r.caducaEn,
        avisos: r.avisos,
        projectId: r.projectId,
      })
      return
    }
    setEstado({ paso: 'error', mensaje: r.mensaje })
  }

  async function emitir(projectId: string) {
    let campos: Record<string, unknown>
    try {
      campos = JSON.parse(camposJson || '{}')
    } catch {
      setEstado({ paso: 'error', mensaje: 'Los campos adicionales no son un JSON válido.' })
      return
    }
    setEstado({ paso: 'emitiendo' })
    const r = await pedirEmision({ projectId, campos, primaAnual: primaEur })
    if (r.estado === 'faltan_campos') {
      setEstado({ paso: 'faltan_campos', faltan: r.faltan, campos: r.campos, projectId })
      return
    }
    if (r.estado === 'ok') {
      setEstado({ paso: 'emitido', referenciaVendor: r.referenciaVendor })
      return
    }
    if (r.estado === 'emitido_sin_acunar') {
      setEstado({ paso: 'emitido_sin_acunar', mensaje: r.mensaje })
      return
    }
    if (r.estado === 'en_vuelo') {
      setEstado({ paso: 'error', mensaje: r.mensaje })
      return
    }
    setEstado({ paso: 'error', mensaje: r.mensaje })
  }

  return (
    <div className="card" style={{ marginTop: 12, borderColor: 'var(--brand)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ margin: 0 }}>Emisión · {compania || '—'}</h2>
          {categoria && (
            <p className="muted" style={{ margin: '2px 0 0' }}>
              {categoria}
            </p>
          )}
        </div>
        <button type="button" className="ghost" onClick={onCerrar}>
          Cerrar
        </button>
      </div>

      <div
        style={{
          marginTop: 10,
          border: '2px solid var(--warn)',
          background: 'rgba(217, 119, 6, 0.1)',
          borderRadius: 10,
          padding: 12,
        }}
      >
        <p style={{ margin: 0, fontWeight: 800, color: 'var(--warn)' }}>
          🚨 Esto llama de verdad a Codeoscopic — sin sandbox
        </p>
        <p style={{ margin: '4px 0 0' }}>
          Un solo intento por paso. Si algo sale raro, el mensaje de la compañía se enseña tal cual:
          no se reintenta solo.
        </p>
      </div>

      {estado.paso === 'inicio' && (
        <div style={{ marginTop: 14 }}>
          <p className="muted">
            Precio en pantalla: <strong>{euroODash(primaEur)}</strong>. El primer paso lo confirma con
            la compañía (puede cambiar de «estimado» a un precio firme).
          </p>
          <details style={{ marginTop: 8 }}>
            <summary className="muted" style={{ cursor: 'pointer' }}>
              Corregir fecha de efecto (opcional — solo si la compañía ya la rechazó)
            </summary>
            <p className="muted" style={{ fontSize: 12 }}>
              Algunas compañías rechazan la fecha guardada al cotizar (p. ej. «más de 90 días en el
              futuro»). Rellena esto SOLO si ya viste ese error, con la fecha que quiere el cliente.
            </p>
            <input
              type="date"
              value={fechaEfectoCorregida}
              onChange={(e) => setFechaEfectoCorregida(e.target.value)}
            />
          </details>
          <button type="button" className="primary" onClick={confirmarPrecio} style={{ marginTop: 8 }}>
            Confirmar precio con la compañía
          </button>
        </div>
      )}

      {estado.paso === 'confirmando' && <p style={{ marginTop: 14 }}>Confirmando con la compañía…</p>}

      {estado.paso === 'oferta' && (
        <div style={{ marginTop: 14 }}>
          <p>
            Precio confirmado: <strong>{euroODash(estado.primaEur)}</strong>{' '}
            <span className={`badge ${estado.firmeza === 'firme' ? 'ok' : 'warn'}`}>{estado.firmeza}</span>
          </p>
          {estado.caducaEn && <p className="muted">Caduca: {estado.caducaEn}</p>}
          {estado.avisos.length > 0 && (
            <ul>
              {estado.avisos.map((a, i) => (
                <li key={i}>{a}</li>
              ))}
            </ul>
          )}
          <details style={{ marginTop: 8 }}>
            <summary className="muted" style={{ cursor: 'pointer' }}>
              Campos adicionales (avanzado, opcional)
            </summary>
            <p className="muted" style={{ fontSize: 12 }}>
              JSON con lo que pida la compañía. Si falta algo, la respuesta dirá exactamente qué
              claves espera — no hay que adivinarlas.
            </p>
            <p className="err" style={{ fontSize: 12, margin: '4px 0 8px' }}>
              ⚠️ Si la compañía pide una fecha de efecto, tiene que ser <strong>HOY</strong> (o más
              tarde) — nunca una fecha pasada de esta cotización. Las compañías no admiten pólizas
              retroactivas.
            </p>
            <textarea
              value={camposJson}
              onChange={(e) => setCamposJson(e.target.value)}
              rows={4}
              style={{ width: '100%', fontFamily: 'monospace' }}
            />
          </details>
          <div style={{ marginTop: 10 }}>
            <button type="button" className="primary" onClick={() => emitir(estado.projectId)}>
              Emitir la póliza
            </button>
          </div>
        </div>
      )}

      {estado.paso === 'emitiendo' && <p style={{ marginTop: 14 }}>Enviando la emisión…</p>}

      {estado.paso === 'faltan_campos' && (
        <div style={{ marginTop: 14 }}>
          <p className="err">La compañía pide estos datos antes de emitir:</p>
          <ul>
            {estado.faltan.map((f) => (
              <li key={f}>
                <code>{f}</code>
              </li>
            ))}
          </ul>
          <p className="muted" style={{ fontSize: 12 }}>
            Añádelos al JSON de arriba con esas claves exactas y vuelve a pulsar «Emitir».
          </p>
          <textarea
            value={camposJson}
            onChange={(e) => setCamposJson(e.target.value)}
            rows={4}
            style={{ width: '100%', fontFamily: 'monospace' }}
          />
          <div style={{ marginTop: 10 }}>
            <button type="button" className="primary" onClick={() => emitir(estado.projectId)}>
              Reintentar con los campos añadidos
            </button>
          </div>
        </div>
      )}

      {estado.paso === 'emitido' && (
        <div className="ok" style={{ marginTop: 14 }}>
          ✅ Emitida. {estado.referenciaVendor && <>Referencia de la compañía: {estado.referenciaVendor}. </>}
          Queda como «pendiente de confirmación por CIMA» en la ficha de la póliza.
        </div>
      )}

      {estado.paso === 'emitido_sin_acunar' && (
        <div className="err" style={{ marginTop: 14 }}>
          ⚠️ {estado.mensaje}
        </div>
      )}

      {estado.paso === 'error' && (
        <div className="err" style={{ marginTop: 14 }}>
          {estado.mensaje}
        </div>
      )}
    </div>
  )
}
