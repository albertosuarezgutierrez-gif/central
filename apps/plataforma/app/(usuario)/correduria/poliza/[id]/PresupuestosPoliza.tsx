'use client'
import { useCallback, useEffect, useState } from 'react'

import {
  ROTULO_ESTADO_PRESUPUESTO, accionesPresupuesto, leerPresupuestoEnLista, textoAviso,
  type PresupuestoEnLista,
} from '@/lib/presupuesto-asegura'
import { eur } from '@/lib/dinero'
import { btnStyle } from '@/components/ui'

/**
 * Los presupuestos de esta póliza y su aviso al cliente (spec 2026-09-21, PR 3).
 *
 * Nada sale sin que Alberto pulse, presupuesto a presupuesto. El correo lo manda asegura; el
 * WhatsApp lo manda él desde su móvil (aquí solo se abre con el texto escrito), y por eso
 * «enlazado» no es «enviado» hasta que pulse «Ya lo he mandado».
 */
export default function PresupuestosPoliza({ polizaId }: { polizaId: string }) {
  const [lista, setLista] = useState<PresupuestoEnLista[] | null | 'error'>(null)
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null)

  const cargar = useCallback(() => {
    fetch(`/api/correduria/presupuesto?polizaId=${encodeURIComponent(polizaId)}`, { cache: 'no-store' })
      .then(async (r) => {
        const j = (await r.json().catch(() => null)) as { estado?: string; presupuestos?: unknown[] } | null
        if (!r.ok || j?.estado !== 'ok' || !Array.isArray(j.presupuestos)) { setLista('error'); return }
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
      if (cuerpo.accion === undefined) {
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
      {aviso && <span role="status" style={{ fontSize: 13, color: aviso.ok ? 'var(--positive, #1e7e34)' : 'var(--negative, #c0392b)' }}>{aviso.texto}</span>}
      <span style={NOTA}>El aviso no lleva precio ni compañía: el cliente los ve en su portal entrando con un código a su correo.</span>
    </section>
  )
}

const NOTA: React.CSSProperties = { margin: 0, fontSize: 13, color: 'var(--muted)' }
