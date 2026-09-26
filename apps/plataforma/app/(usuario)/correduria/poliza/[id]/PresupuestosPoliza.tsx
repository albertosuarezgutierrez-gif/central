'use client'
import { useCallback, useEffect, useState } from 'react'

import {
  ROTULO_ESTADO_PRESUPUESTO, accionesPresupuesto, fraseDatosEmision, leerPresupuestoEnLista, necesidadesEditables, textoAviso,
  type PresupuestoEnLista,
} from '@/lib/presupuesto-asegura'
import { eur } from '@/lib/dinero'
import { btnStyle } from '@/components/ui'
import { preguntasNecesidades, textoNecesidades, validarRespuestasNecesidades } from '@central/module-seguros'

/**
 * Los presupuestos de esta póliza y su aviso al cliente (spec 2026-09-21, PR 3).
 *
 * Nada sale sin que Alberto pulse, presupuesto a presupuesto. El correo lo manda asegura; el
 * WhatsApp lo manda él desde su móvil (aquí solo se abre con el texto escrito), y por eso
 * «enlazado» no es «enviado» hasta que pulse «Ya lo he mandado».
 */
export default function PresupuestosPoliza({ polizaId, ramo }: { polizaId: string; ramo?: string | null }) {
  const [lista, setLista] = useState<PresupuestoEnLista[] | null | 'error'>(null)
  const [datosEmision, setDatosEmision] = useState<Record<string, unknown>>({})
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null)

  const cargar = useCallback(() => {
    fetch(`/api/correduria/presupuesto?polizaId=${encodeURIComponent(polizaId)}`, { cache: 'no-store' })
      .then(async (r) => {
        const j = (await r.json().catch(() => null)) as { estado?: string; presupuestos?: unknown[]; datosEmision?: Record<string, unknown> } | null
        if (!r.ok || j?.estado !== 'ok' || !Array.isArray(j.presupuestos)) { setLista('error'); return }
        setDatosEmision(j.datosEmision && typeof j.datosEmision === 'object' ? j.datosEmision : {})
        const filas = j.presupuestos.map(leerPresupuestoEnLista)
        setLista(filas.some((f) => f === null) ? 'error' : (filas as PresupuestoEnLista[]))
      })
      .catch(() => setLista('error'))
  }, [polizaId])
  useEffect(() => { cargar() }, [cargar])

  async function patch(p: PresupuestoEnLista, cuerpo: Record<string, unknown>, ventana?: Window | null) {
    setOcupado(p.id); setAviso(null)
    try {
      const r = await fetch('/api/correduria/presupuesto', {
        method: 'PATCH', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: p.id, ...cuerpo }),
      })
      const j = await r.json().catch(() => null)
      if (cuerpo.accion === 'necesidades') {
        const o = (j ?? {}) as { estado?: string; detalle?: string }
        setAviso(r.ok && o.estado === 'ok' ? { ok: true, texto: 'Necesidades guardadas.' } : { ok: false, texto: `NO guardadas: ${o.detalle ?? `HTTP ${r.status}`}` })
      } else if (cuerpo.accion === undefined) {
        const o = (j ?? {}) as { estado?: string; detalle?: string }
        setAviso(r.ok && o.estado === 'ok' ? { ok: true, texto: 'Retirado.' } : { ok: false, texto: `NO retirado: ${o.detalle ?? `HTTP ${r.status}`}` })
      } else {
        const t = textoAviso(r.status, j)
        // La ventana se abrió en el clic (si se abre tras el await, el navegador la bloquea).
        if (t.whatsapp && ventana) ventana.location.href = t.whatsapp
        else if (t.whatsapp) window.location.href = t.whatsapp
        else ventana?.close()
        setAviso(t)
      }
    } catch {
      ventana?.close()
      setAviso({ ok: false, texto: 'NO se sabe si ha salido: se cortó la conexión. Recarga antes de repetir.' })
    } finally {
      setOcupado(null)
      cargar()
    }
  }

  if (lista === null) return null
  if (lista === 'error') {
    return <p style={NOTA}>Presupuestos: no se han podido leer. No quiere decir que no haya ninguno.</p>
  }
  if (lista.length === 0) return null

  return (
    <section style={{ display: 'grid', gap: 10, padding: 14, border: '1px solid var(--border)', borderRadius: 12 }}>
      <strong style={{ fontSize: 15 }}>Presupuestos</strong>
      {lista.map((p) => {
        const a = accionesPresupuesto(p.estado)
        const libre = ocupado === null
        return (
          <div key={p.id} style={{ display: 'grid', gap: 8, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
            <span style={{ fontSize: 14 }}>
              {ROTULO_ESTADO_PRESUPUESTO[p.estado]} · {p.opciones} opción{p.opciones === 1 ? '' : 'es'}
              {p.desdeEur !== null ? ` · desde ${eur(p.desdeEur)}` : ''} · vale hasta el {new Date(p.venceEl).toLocaleDateString('es-ES')}
            </span>
            {p.clienteId && p.estado !== 'retirado' && p.estado !== 'emitido' && p.estado !== 'caducado' && (() => {
              const d = fraseDatosEmision(datosEmision[p.clienteId])
              return <span style={{ fontSize: 13, color: d.alerta ? 'var(--negative)' : 'var(--muted)' }}>{d.texto}</span>
            })()}
            <Necesidades p={p} ramo={ramo ?? null} deshabilitado={!libre} onGuardar={(texto, respuestas) => void patch(p, { accion: 'necesidades', texto, respuestas })} />
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {a.avisar && (
                <button type="button" disabled={!libre} style={btnStyle('primario')} onClick={() => {
                  const txt = a.reenvio
                    ? 'Se le vuelve a mandar el aviso por correo. El enlace del aviso anterior dejará de abrir. ¿Enviar?'
                    : 'Se le manda por correo el aviso con el enlace (sin precios: los ve al entrar con su código). ¿Enviar?'
                  if (window.confirm(txt)) void patch(p, { accion: 'avisar', canal: 'email' })
                }}>{a.reenvio ? 'Reenviar por correo' : 'Enviar por correo'}</button>
              )}
              {a.avisar && (
                <button type="button" disabled={!libre} style={btnStyle('secundario')}
                  onClick={() => {
                    // Rotar la llave mata el enlace que ya tenga: si ya se le avisó, se pregunta antes.
                    if (a.reenvio && !window.confirm('Se le abrirá un WhatsApp con un enlace NUEVO: el que ya tiene dejará de abrir. ¿Seguir?')) return
                    void patch(p, { accion: 'avisar', canal: 'whatsapp_enlace' }, window.open('', '_blank'))
                  }}>Por WhatsApp</button>
              )}
              {a.confirmarWhatsapp && (
                <button type="button" disabled={!libre} style={btnStyle('secundario')}
                  onClick={() => { if (window.confirm('¿Le has mandado ya el WhatsApp desde tu móvil?')) void patch(p, { accion: 'confirmar_whatsapp' }) }}>
                  Ya lo he mandado
                </button>
              )}
              {a.emitir && (
                <button type="button" disabled={!libre} style={btnStyle('primario')}
                  onClick={() => { if (window.confirm('¿La compañía ya ha EMITIDO la póliza nueva? Si el cliente firmó la anulación de la anterior, se te propondrá mandarla.')) void patch(p, { accion: 'emitido' }) }}>
                  Ya está emitida
                </button>
              )}
              {a.retirar && (
                <button type="button" disabled={!libre} style={btnStyle('sutil')} onClick={() => {
                  if (p.estado === 'aceptado' && !window.confirm('El cliente ya lo ACEPTÓ y firmó. Si firmó también la anulación de su póliza actual, se desiste: no saldrá a la compañía. ¿Retirar?')) return
                  const motivo = window.prompt('¿Por qué se retira? (se guarda con el presupuesto)')
                  if (motivo && motivo.trim() !== '') void patch(p, { motivo })
                }}>Retirar</button>
              )}
            </div>
          </div>
        )
      })}
      {aviso && <span role="status" style={{ fontSize: 13, color: aviso.ok ? 'var(--positive)' : 'var(--negative)' }}>{aviso.texto}</span>}
      <span style={NOTA}>El aviso no lleva precio ni compañía: el cliente los ve en su portal entrando con un código a su correo.</span>
    </section>
  )
}

const NOTA: React.CSSProperties = { margin: 0, fontSize: 13, color: 'var(--muted)' }

/**
 * Exigencias y necesidades del cliente (IDD, art. 20 Ley 16/2018). Sin ellas asegura no deja avisarle.
 * Cuestionario cerrado por ramo (`preguntasNecesidades`): se guarda como la declaración de texto de
 * siempre, que es lo que el cliente firma con la aceptación, y las respuestas van a la auditoría.
 */
function Necesidades({ p, ramo, deshabilitado, onGuardar }: {
  p: PresupuestoEnLista; ramo: string | null; deshabilitado: boolean
  onGuardar: (texto: string, respuestas: Record<string, string>) => void
}) {
  const editable = necesidadesEditables(p.estado)
  const preguntas = preguntasNecesidades(ramo)
  const [resp, setResp] = useState<Record<string, string>>({})
  const [otras, setOtras] = useState('')
  if (!editable) {
    return p.necesidades
      ? <span style={NOTA}>Necesidades: «{p.necesidades}»</span>
      : <span style={NOTA}>Necesidades: no constan por escrito.</span>
  }
  const v = validarRespuestasNecesidades(ramo, resp)
  const texto = textoNecesidades(ramo, resp, otras)
  const pendientes = v.ok ? 0 : v.faltan.length + v.invalidas.length
  return (
    <details open={!p.necesidades}>
      <summary style={{ cursor: 'pointer', fontSize: 13, minHeight: 44, display: 'flex', alignItems: 'center', color: p.necesidades ? 'var(--muted)' : 'var(--negative)' }}>
        {p.necesidades ? `Necesidades: «${p.necesidades.length > 80 ? `${p.necesidades.slice(0, 80)}…` : p.necesidades}»` : 'Falta el cuestionario de necesidades: sin él no se le puede avisar'}
      </summary>
      <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'minmax(0, 1fr)' }}>
        {p.necesidades && <span style={NOTA}>Guardado ahora: «{p.necesidades}». Rellenar el cuestionario lo sustituye.</span>}
        {preguntas.map((q) => (
          <label key={q.id} style={{ display: 'grid', gap: 4, fontSize: 14, gridTemplateColumns: 'minmax(0, 1fr)' }}>
            {q.texto}
            <select value={resp[q.id] ?? ''} onChange={(e) => setResp((r) => ({ ...r, [q.id]: e.target.value }))}
              style={{ minHeight: 44, fontSize: 14, padding: '6px 8px', width: '100%', minWidth: 0 }}>
              <option value="">— Elige —</option>
              {q.opciones.map((o) => <option key={o.valor} value={o.valor}>{o.texto}</option>)}
            </select>
          </label>
        ))}
        <label style={{ display: 'grid', gap: 4, fontSize: 14 }}>
          Algo más que haya pedido (opcional)
          <textarea value={otras} onChange={(e) => setOtras(e.target.value)} rows={2} maxLength={600}
            placeholder="Taller concertado, una cobertura concreta…"
            style={{ width: '100%', boxSizing: 'border-box', fontSize: 14, padding: '8px 10px' }} />
        </label>
        {v.ok && <span style={NOTA}>Quedará así (y es lo que el cliente firma): «{texto}»</span>}
        <button type="button" disabled={deshabilitado || !v.ok} onClick={() => v.ok && onGuardar(texto, v.respuestas)}
          style={{ ...btnStyle('secundario'), minHeight: 44, justifySelf: 'start' }}>
          {v.ok ? 'Guardar necesidades' : `Faltan ${pendientes} respuesta(s)`}
        </button>
      </div>
    </details>
  )
}
