'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { RefreshCcw } from 'lucide-react'
import { ROTULO_CAMPO_CIMA, type CampoCima } from '@central/module-seguros'
import { Badge, btnStyle } from '@/components/ui'
import Bloque from './Bloque'
import { contadorSincroCima, interpretarSincroCima, type LecturaSincroCima } from '@/lib/cima-sincro-asegura'

/**
 * Ficha ↔ CIMA (25/09/2026). Alberto: «primero CIMA manda; luego, si hay
 * discrepancia con CIMA, avisarme y yo intervengo si cambiar o no».
 *
 * - Los HUECOS (la ficha no lo tiene y CIMA sí) los rellena el cron cada día,
 *   sin preguntar: aquí solo se cuentan.
 * - Las DIFERENCIAS se enseñan con los dos valores y dos botones: «Usar CIMA»
 *   (lo escribe en la ficha) o «Mantener el mío» (se recuerda para ESE valor;
 *   si CIMA manda otro distinto, se vuelve a avisar).
 * - «Aplicar CIMA en todas» es el volcado inicial: CIMA manda en todo.
 *
 * Tres pintados: sin diferencias ni huecos → nada; con algo → bloque; no se
 * pudo leer → «sin comprobar» (nunca «no hay diferencias»).
 */
type Estado = { fase: 'cargando' } | { fase: 'hecho'; l: LecturaSincroCima }

export default function DiferenciasCima({ onContador }: { onContador?: (n: number | null) => void }) {
  const [estado, setEstado] = useState<Estado>({ fase: 'cargando' })
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const avisar = useRef(onContador)
  useEffect(() => { avisar.current = onContador }, [onContador])

  const leer = useCallback(() => {
    let vivo = true
    fetch('/api/correduria/cima-sincro')
      .then(async (res) => interpretarSincroCima(res.status, await res.json().catch(() => null)))
      .catch((): LecturaSincroCima => ({ estado: 'error', motivo: 'red' }))
      .then((l) => {
        if (!vivo) return
        setEstado({ fase: 'hecho', l })
        avisar.current?.(contadorSincroCima(l))
      })
    return () => { vivo = false }
  }, [])
  useEffect(() => leer(), [leer])

  async function enviar(clave: string, body: Record<string, unknown>) {
    setOcupado(clave)
    setAviso(null)
    try {
      const res = await fetch('/api/correduria/cima-sincro', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
      const j = (await res.json().catch(() => null)) as Record<string, unknown> | null
      if (!res.ok) setAviso(`No se ha podido: ${String(j?.motivo ?? j?.causa ?? `HTTP ${res.status}`)}`)
      else if (typeof j?.aplicados === 'number') {
        const fallidos = Array.isArray(j.fallidos) ? j.fallidos.length : 0
        setAviso(`${j.aplicados} dato(s) copiados de CIMA${fallidos ? ` · ${fallidos} sin aplicar (se quedan en la lista)` : ''}.`)
      }
    } catch {
      setAviso('No se ha podido contactar. No se sabe si se aplicó: recarga antes de repetir.')
    } finally {
      setOcupado(null)
      leer()
    }
  }

  if (estado.fase === 'cargando') return null
  const l = estado.l
  if (l.estado !== 'ok') {
    const motivo = l.estado === 'sin_configurar' ? 'falta ASEGURA_OPERADOR_SECRET' : l.estado === 'no_desplegado' ? 'asegura aún no tiene este puerto' : l.motivo
    return (
      <Bloque Icono={RefreshCcw} titulo="Diferencias con CIMA" accion={<Badge tono="aviso">Sin comprobar</Badge>}
        sub={`No se ha podido comparar las fichas con CIMA (${motivo}). No significa que coincidan.`}>{null}</Bloque>
    )
  }
  const n = contadorSincroCima(l) ?? 0
  if (n === 0 && l.rellenos === 0 && l.ilegibles === 0) return null

  return (
    <Bloque
      destacado={n > 0}
      tono="aviso"
      Icono={RefreshCcw}
      titulo={n > 0 ? `${n} dato${n === 1 ? '' : 's'} distinto${n === 1 ? '' : 's'} de lo que manda CIMA` : 'Datos de CIMA por copiar'}
      sub={`Comparadas ${l.fichas} fichas de cartera viva con lo que CIMA manda de esa misma persona (por DNI).${l.rellenos ? ` ${l.rellenos} hueco(s) se rellenan solos cada día.` : ''}${l.ilegibles ? ` ${l.ilegibles} ficha(s) no se pudieron leer.` : ''}`}
      accion={
        <button type="button" disabled={ocupado !== null} style={{ ...btnStyle('secundario', 'sm'), minHeight: 44 }}
          onClick={() => { if (confirm('CIMA manda: se copiará lo de CIMA en TODAS las fichas (huecos y diferencias). Los teléfonos/emails anteriores se conservan como secundarios. ¿Seguir?')) void enviar('volcar', { accion: 'volcar' }) }}>
          {ocupado === 'volcar' ? 'Aplicando…' : 'Aplicar CIMA en todas'}
        </button>
      }
    >
      {aviso && <p style={{ margin: '0 0 8px', fontSize: 13 }} role="status">{aviso}</p>}
      <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 12 }}>
        {l.discrepancias.map((f) => (
          <li key={f.clienteId} style={{ display: 'grid', gap: 6, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 600, overflowWrap: 'anywhere' }}>
              <Link href={`/correduria/cliente/${f.clienteId}`}>{f.nombre}</Link>
              {f.poliza && <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--muted)' }}> · póliza {f.poliza}</span>}
            </div>
            {f.diferencias.map((d) => {
              const clave = `${f.clienteId}|${d.campo}`
              return (
                <div key={clave} style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', fontSize: 13, minWidth: 0 }}>
                  <span style={{ minWidth: 0, overflowWrap: 'anywhere', flex: '1 1 220px' }}>
                    <strong>{ROTULO_CAMPO_CIMA[d.campo as CampoCima]}</strong>: ficha «{d.ficha ?? '—'}» · CIMA «{d.cima}»
                  </span>
                  <button type="button" disabled={ocupado !== null} style={{ ...btnStyle('primario', 'sm'), minHeight: 44 }}
                    onClick={() => void enviar(clave, { accion: 'usar_cima', clienteId: f.clienteId, campo: d.campo, valor: d.cima })}>
                    {ocupado === clave ? '…' : 'Usar CIMA'}
                  </button>
                  <button type="button" disabled={ocupado !== null} style={{ ...btnStyle('sutil', 'sm'), minHeight: 44 }}
                    onClick={() => void enviar(clave, { accion: 'mantener', clienteId: f.clienteId, campo: d.campo, valor: d.cima })}>
                    Mantener el mío
                  </button>
                </div>
              )
            })}
          </li>
        ))}
      </ul>
    </Bloque>
  )
}
