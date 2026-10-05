'use client'
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { RefreshCw, TriangleAlert } from 'lucide-react'
import type { EjemploAgenda, EjemploFicha, InformeSimulacion, Lista } from '@central/module-seguros/google-contactos-simulacion'
import { btnStyle } from '@/components/ui'
import Bloque from './Bloque'
import { ConIcono } from './iconos'

/**
 * Simular → revisar → activar la sincronización CRM → Google Contacts (05/10/2026). Alberto ya volcó
 * clientes a su agenda a mano (.vcf): antes de la primera pasada real se ve qué pasaría. «Simular» es
 * SOLO LECTURA en Google; hasta «Activar» el cron no escribe nada. PII mínima: nombre como quedará
 * (🟢 cliente / 🟡 lead) y teléfono con solo los 3 últimos dígitos.
 *
 * 🚨 Sin lectura buena no se dice «nada»: un fallo es un error visible.
 */

type Estado = { conectada: boolean; cuentaGoogle?: string | null; simuladaEn?: string | null; syncActivadaEn?: string | null }
type Fase = 'cargando' | 'ok' | 'sin_configurar' | 'error'

const pMuted = { fontSize: 13, color: 'var(--muted)', margin: 0 } as const
const numero = (n: number) => n.toLocaleString('es-ES', { useGrouping: 'always' } as Intl.NumberFormatOptions)

function fecha(iso: string): string {
  return new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(iso))
}

const MOTIVO: Record<string, string> = {
  sin_conexion: 'No hay cuenta de Google conectada.',
  revocada: 'El acceso a Google está revocado: hay que volver a conectar.',
  pii_no_descifra: 'La clave de cifrado no abre la cartera: no se puede simular.',
  sin_simular: 'Primero hay que simular.',
}

function Seccion<T>({ titulo, ayuda, lista, fila }: { titulo: string; ayuda: string; lista: Lista<T>; fila: (x: T) => React.ReactNode }) {
  const [abierta, setAbierta] = useState(false)
  return (
    <section style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 12, display: 'grid', gap: 6, minWidth: 0 }}>
      <button type="button" onClick={() => setAbierta((a) => !a)} disabled={lista.total === 0} aria-expanded={abierta}
        style={{ ...btnStyle('secundario'), minHeight: 44, justifyContent: 'space-between', textAlign: 'left', width: '100%' }}>
        <span style={{ overflowWrap: 'anywhere' }}>{titulo}</span><strong>{numero(lista.total)}</strong>
      </button>
      <p style={pMuted}>{ayuda}</p>
      {abierta && lista.total > 0 && (
        <ul style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 4, fontSize: 13 }}>
          {lista.ejemplos.map((x, i) => <li key={i} style={{ overflowWrap: 'anywhere' }}>{fila(x)}</li>)}
          {lista.total > lista.ejemplos.length && <li style={{ color: 'var(--muted)' }}>… y {numero(lista.total - lista.ejemplos.length)} más</li>}
        </ul>
      )}
    </section>
  )
}

function Ficha({ x }: { x: EjemploFicha }) {
  return (
    <>
      {x.clienteId.startsWith('compania:')
        ? <Link href="/correduria/companias">{x.nombre}</Link>
        : <Link href={`/correduria/cliente/${x.clienteId}`}>{x.nombre}</Link>}
      {x.telefono ? ` · ${x.telefono}` : ' · sin teléfono'}
      {x.nombreEnAgenda ? ` · en tu agenda: «${x.nombreEnAgenda}»` : ''}
      {x.motivo === 'mismo_email' ? ' · mismo correo' : x.motivo === 'mismo_nombre' ? ' · mismo nombre' : x.motivo === 'varios_candidatos' ? ' · varios posibles' : ''}
      {x.contactosConEseTelefono !== undefined ? ` · ${x.contactosConEseTelefono} contactos con ese número` : ''}
      {x.fueraDeEtiqueta && <span style={{ color: 'var(--muted)' }}> · fuera de la etiqueta</span>}
    </>
  )
}

export default function GoogleContactosSimulacion() {
  const [fase, setFase] = useState<Fase>('cargando')
  const [estado, setEstado] = useState<Estado | null>(null)
  const [informe, setInforme] = useState<InformeSimulacion | null>(null)
  const [ocupado, setOcupado] = useState<'simular' | 'activar' | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    setFase('cargando')
    try {
      const r = await fetch('/api/correduria/google-contactos-sync', { cache: 'no-store' })
      const j = (await r.json().catch(() => null)) as (Estado & { estado?: string }) | null
      if (r.status === 503 && j?.estado === 'sin_configurar') return setFase('sin_configurar')
      // Conectada, `estado` trae el de la conexión ('conectada'|'revocada'…), no 'ok': manda `conectada`.
      if (!r.ok || !j || typeof j.conectada !== 'boolean') return setFase('error')
      setEstado(j)
      setFase('ok')
    } catch {
      setFase('error')
    }
  }, [])
  useEffect(() => { void cargar() }, [cargar])

  async function accion(a: 'simular' | 'activar') {
    setOcupado(a)
    setAviso(null)
    try {
      const r = await fetch('/api/correduria/google-contactos-sync', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ accion: a }),
      })
      const j = (await r.json().catch(() => null)) as { estado?: string; informe?: InformeSimulacion } | null
      if (a === 'simular' && r.ok && j?.estado === 'ok' && j.informe) {
        setInforme(j.informe)
        setEstado((e) => (e ? { ...e, simuladaEn: new Date().toISOString() } : e))
        return
      }
      if (a === 'activar' && r.ok) {
        await cargar()
        return
      }
      setAviso(MOTIVO[j?.estado ?? ''] ?? `No se ha podido ${a} (HTTP ${r.status}).`)
    } catch {
      setAviso(`No se ha podido ${a}. Inténtalo de nuevo.`)
    } finally {
      setOcupado(null)
    }
  }

  function confirmarActivar() {
    const i = informe
    const texto = i
      ? `La primera sincronización creará ${numero(i.real.crear)} contactos en Google, vinculará ${numero(i.real.vincular)}` +
        ` y adoptará ${numero(i.real.adoptar)} que ya tienes en la agenda (los mete en «Grupo ASegura»). ¿Activar?`
      : '¿Activar la sincronización?'
    if (window.confirm(texto)) void accion('activar')
  }

  const titulo = 'Google Contacts: simular y activar'
  if (fase === 'cargando') return <Bloque titulo={titulo} Icono={RefreshCw}><p style={pMuted}>Cargando…</p></Bloque>
  if (fase === 'sin_configurar') {
    return <Bloque titulo={titulo} Icono={RefreshCw} tono="aviso"><p style={pMuted}>El puerto con asegura no está conectado.</p></Bloque>
  }
  if (fase === 'error' || !estado) {
    return (
      <Bloque titulo={titulo} Icono={RefreshCw} tono="malo"
        accion={<button type="button" onClick={() => void cargar()} style={{ ...btnStyle('secundario', 'sm'), minHeight: 44 }}>Reintentar</button>}>
        <p style={{ ...pMuted, color: 'var(--negative)' }}><ConIcono i={TriangleAlert}>No se ha podido leer el estado de la conexión.</ConIcono></p>
      </Bloque>
    )
  }
  if (!estado.conectada) {
    return <Bloque titulo={titulo} Icono={RefreshCw}><p style={pMuted}>No hay cuenta de Google conectada: conéctala arriba («Conectar Google»).</p></Bloque>
  }

  const activa = !!estado.syncActivadaEn
  const i = informe
  return (
    <Bloque titulo={titulo} Icono={RefreshCw}
      sub={activa
        ? <>Sincronización ACTIVA desde el {fecha(estado.syncActivadaEn!)}{estado.cuentaGoogle ? ` (${estado.cuentaGoogle})` : ''}.</>
        : <>Pendiente de activar{estado.cuentaGoogle ? ` (${estado.cuentaGoogle})` : ''}: el cron no escribe nada hasta que actives. Simular no toca Google.</>}>
      <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'minmax(0, 1fr)' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <button type="button" disabled={ocupado !== null} onClick={() => void accion('simular')} style={{ ...btnStyle(activa ? 'secundario' : 'primario'), minHeight: 44 }}>
            {ocupado === 'simular' ? 'Leyendo tu agenda…' : 'Simular sincronización'}
          </button>
          {!activa && (
            <button type="button" disabled={ocupado !== null || !i} onClick={confirmarActivar} style={{ ...btnStyle('primario'), minHeight: 44 }}
              title={i ? undefined : 'Simula primero y revisa el informe'}>
              {ocupado === 'activar' ? 'Activando…' : 'Activar sincronización'}
            </button>
          )}
        </div>
        {aviso && <p role="alert" style={{ ...pMuted, color: 'var(--negative)' }}>{aviso}</p>}
        {i && (
          <>
            {i.avisos.map((a, k) => <p key={k} role="note" style={{ ...pMuted, color: 'var(--warning)' }}><ConIcono i={TriangleAlert}>{a}</ConIcono></p>)}
            <p style={pMuted}>
              Leídos {numero(i.contactosLeidos)} contactos de Google ({numero(i.contactosEnEtiqueta)} en la etiqueta «Grupo ASegura»)
              {i.totalCuenta !== null ? `; la cuenta tiene ${numero(i.totalCuenta)}` : ''}. Tras la primera pasada quedarían {numero(i.contactosTras)}
              {i.superaTope ? <strong style={{ color: 'var(--negative)' }}> — SUPERA el tope de 25.000 de Google: no se escribiría nada.</strong> : ' (tope de Google: 25.000).'}
              {' '}Fichas del CRM: {numero(i.fichasCrm)}{i.seleccionIncompleta ? ' (selección INCOMPLETA: no se retiraría nada)' : ''}.
            </p>
            <Seccion titulo="Se crearán nuevas" ayuda="Nadie en tu agenda tiene ese teléfono." lista={i.crear} fila={(x) => <Ficha x={x} />} />
            <Seccion titulo="Se vincularán a un contacto de la etiqueta" ayuda="Ya está en «Grupo ASegura» con el mismo teléfono y el mismo nombre." lista={i.vincular} fila={(x) => <Ficha x={x} />} />
            <Seccion titulo="Se adoptarán de tu agenda" ayuda="Están fuera de la etiqueta (el volcado del .vcf) con el mismo teléfono y el mismo nombre o el sufijo «· AS …»: se meten en «Grupo ASegura» sin duplicarlos y nunca se borran." lista={i.adoptar} fila={(x) => <Ficha x={x} />} />
            <Seccion titulo="Conflictos de nombre" ayuda="Mismo teléfono, otro nombre (fuera de la etiqueta, probablemente un contacto tuyo): a la cola de revisión, sin pisarlo ni crear otro." lista={i.conflictosNombre} fila={(x) => <Ficha x={x} />} />
            <Seccion titulo="Teléfonos ambiguos" ayuda="Varios contactos con el mismo número: a la cola, sin crear ni adoptar." lista={i.ambiguos} fila={(x) => <Ficha x={x} />} />
            {i.yaEnAgenda && (
              <Seccion titulo="Ya en tu agenda (mismo correo o nombre)" ayuda="El teléfono no casa, pero fuera de la etiqueta hay un contacto con el mismo correo o el mismo nombre completo: NO se crean (serían duplicados). Van a la cola para que las unifiques («Varios posibles»: sin «Unificar», decides tú)." lista={i.yaEnAgenda} fila={(x) => <Ficha x={x} />} />
            )}
            <Seccion titulo="Teléfonos que no son E.164" ayuda="No se pueden emparejar por teléfono." lista={i.telefonosNoNormalizables}
              fila={(x: EjemploAgenda) => <>{x.nombre}{x.telefono ? ` · ${x.telefono}` : ''}</>} />
            <p style={pMuted}>
              Números repetidos en tu agenda: {numero(i.telefonosRepetidosEnAgenda)}. Propuestas de lead (contactos de la etiqueta sin ficha): {numero(i.real.propuestasLead)}.
              {i.real.ilegibles > 0 ? ` Fichas ilegibles (no se tocan): ${numero(i.real.ilegibles)}.` : ''}
            </p>
          </>
        )}
      </div>
    </Bloque>
  )
}
