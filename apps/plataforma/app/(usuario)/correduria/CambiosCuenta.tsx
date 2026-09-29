'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Landmark } from 'lucide-react'
import { Badge, btnStyle } from '@/components/ui'
import Bloque from './Bloque'
import {
  avisoAcceso,
  contadorCambiosCuenta,
  interpretarCambiosCuenta,
  type RespuestaCambiosCuenta,
  type SolicitudCuenta,
} from '@/lib/cambios-cuenta-asegura'

/**
 * Las cuentas nuevas que piden los clientes desde el portal (29/09/2026). Alberto: «si cambia el
 * IBAN, me avisa para yo cambiarla». Pedirla NO la cambia en la compañía: hasta que Alberto lo hace,
 * los recibos siguen cargándose en la vieja. Por eso está en «Hoy» y no se va hasta que la marca.
 *
 * - La lista solo trae máscaras. «Ver IBAN» lo pide completo (queda auditado) para teclearlo.
 * - «Hecha» copia la cuenta a la ficha; «Descartar», no.
 * - Si no se ha podido leer, se dice: un bloque que desaparece en silencio se lee como «nada pendiente».
 * - Sin pendientes no pinta nada.
 */
export default function CambiosCuenta({ onContador }: { onContador?: (n: number | null) => void }) {
  const [lectura, setLectura] = useState<RespuestaCambiosCuenta | null>(null)
  const [ibanes, setIbanes] = useState<Record<string, string>>({})
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [mensaje, setMensaje] = useState<string | null>(null)
  const avisar = useRef(onContador)
  avisar.current = onContador

  const leer = useCallback(async () => {
    let r: RespuestaCambiosCuenta
    try {
      const res = await fetch('/api/correduria/cambios-cuenta')
      r = interpretarCambiosCuenta(res.status, await res.json().catch(() => null))
    } catch {
      r = { estado: 'error', motivo: 'red' }
    }
    setLectura((prev) => (r.estado === 'ok' || !prev ? r : prev))
    avisar.current?.(contadorCambiosCuenta(r))
  }, [])

  useEffect(() => { void leer() }, [leer])

  async function verIban(id: string) {
    setOcupado(id)
    setMensaje(null)
    try {
      const res = await fetch('/api/correduria/cambios-cuenta/iban', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id }),
      })
      const j = (await res.json().catch(() => null)) as { estado?: string; iban?: string } | null
      if (res.ok && j?.estado === 'ok' && typeof j.iban === 'string') setIbanes((p) => ({ ...p, [id]: j.iban! }))
      else setMensaje(j?.estado === 'ilegible' ? 'No se ha podido descifrar el IBAN (clave de asegura).' : 'No se ha podido leer el IBAN completo.')
    } catch {
      setMensaje('No se ha podido leer el IBAN completo.')
    } finally {
      setOcupado(null)
    }
  }

  async function resolver(s: SolicitudCuenta, estado: 'hecha' | 'descartada') {
    if (estado === 'hecha' && !confirm(`¿Ya has cambiado la cuenta a ${s.mascara} en la compañía? Se guardará también en su ficha.`)) return
    setOcupado(s.id)
    setMensaje(null)
    try {
      const res = await fetch('/api/correduria/cambios-cuenta', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: s.id, estado }),
      })
      // La fila NO se quita hasta que asegura confirma.
      if (res.status === 404) { setMensaje('Esa solicitud ya no está pendiente (el cliente pidió otra cuenta, o ya estaba cerrada).'); await leer() }
      else if (!res.ok) setMensaje('No se ha podido guardar. Sigue pendiente.')
      else { setIbanes((p) => { const { [s.id]: _, ...resto } = p; return resto }); await leer() }
    } catch {
      setMensaje('No se ha podido guardar. Sigue pendiente.')
    } finally {
      setOcupado(null)
    }
  }

  if (lectura === null) return null
  if (lectura.estado === 'error') {
    return (
      <Bloque tono="aviso" Icono={Landmark} titulo="Cambios de cuenta de clientes" accion={<Badge tono="aviso">No se han podido leer</Badge>}
        sub={<>No se han podido leer ({lectura.motivo}). <strong>No significa que no haya ninguno pendiente.</strong></>}>
        <button type="button" style={btnStyle('secundario')} onClick={() => void leer()}>Reintentar</button>
      </Bloque>
    )
  }
  const pendientes = lectura.solicitudes.filter((s) => s.estado === 'pendiente')
  if (pendientes.length === 0 && lectura.ilegibles === 0) return null

  return (
    <Bloque destacado tono="aviso" Icono={Landmark} titulo="Cambios de cuenta de clientes"
      accion={<Badge tono="aviso">{pendientes.length} pendiente{pendientes.length === 1 ? '' : 's'}</Badge>}
      sub="El cliente lo pidió en el portal. Cámbiala en la compañía y márcala: hasta entonces los recibos van a la cuenta vieja.">
      {lectura.ilegibles > 0 && <p style={{ margin: '0 0 8px', fontSize: 13, color: 'var(--warning)' }}>{lectura.ilegibles} solicitud(es) no se han sabido leer.</p>}
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 10 }}>
        {pendientes.map((s) => (
          <li key={s.id} style={{ fontSize: 14 }}>
            <div>
              <Link href={`/correduria/cliente/${s.clienteId}`} style={{ fontWeight: 600 }}>{s.cliente ?? 'Cliente sin nombre'}</Link>
              {' '}· nueva <strong>{ibanes[s.id] ?? s.mascara}</strong>
              {' '}· antes {s.mascaraActual ?? <span style={{ color: 'var(--muted)' }}>sin cuenta en la ficha</span>}
            </div>
            {avisoAcceso(s.diasAcceso) && <div style={{ fontSize: 13, color: 'var(--warning)', fontWeight: 600 }}>⚠️ {avisoAcceso(s.diasAcceso)}</div>}
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>pedida el {s.pedidaEn.slice(8, 10)}/{s.pedidaEn.slice(5, 7)}/{s.pedidaEn.slice(0, 4)} a las {s.pedidaEn.slice(11, 16)}</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 6 }}>
              {!ibanes[s.id] && (
                <button type="button" style={btnStyle('secundario')} disabled={ocupado !== null} onClick={() => void verIban(s.id)}>Ver IBAN completo</button>
              )}
              <button type="button" style={btnStyle('primario')} disabled={ocupado !== null} onClick={() => void resolver(s, 'hecha')}>Hecha en la compañía</button>
              <button type="button" style={btnStyle('secundario')} disabled={ocupado !== null} onClick={() => void resolver(s, 'descartada')}>Descartar</button>
            </div>
          </li>
        ))}
      </ul>
      {mensaje && <p role="status" style={{ margin: '8px 0 0', fontSize: 13, color: 'var(--negative)' }}>{mensaje}</p>}
    </Bloque>
  )
}
