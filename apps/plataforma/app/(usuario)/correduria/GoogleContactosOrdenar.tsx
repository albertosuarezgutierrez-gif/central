'use client'
import { useState } from 'react'
import Link from 'next/link'
import { ListChecks, TriangleAlert } from 'lucide-react'
import type { ContactoAgenda, FichaOtroNombre, GrupoDuplicado, InformeOrdenar, PareceTrabajo } from '@central/module-seguros/google-contactos-ordenar'
import type { Lista } from '@central/module-seguros/google-contactos-simulacion'
import { btnStyle } from '@/components/ui'
import Bloque from './Bloque'
import { ConIcono } from './iconos'

/**
 * «Ordenar agenda» (05/10/2026): informe SOLO LECTURA de la agenda de Google de Alberto. Nada se
 * escribe: los duplicados se fusionan en Google («Fusionar y corregir»), las fichas con otro nombre
 * se unifican desde la cola, y un contacto de trabajo se da de alta con el alta normal del CRM.
 * Listas plegadas de 50 en 50 («Ver más»).
 */
const pMuted = { fontSize: 13, color: 'var(--muted)', margin: 0 } as const
const numero = (n: number) => n.toLocaleString('es-ES', { useGrouping: 'always' } as Intl.NumberFormatOptions)
const PASO = 50

const MOTIVO: Record<string, string> = {
  sin_conexion: 'No hay cuenta de Google conectada.',
  revocada: 'El acceso a Google está revocado: hay que volver a conectar.',
  pii_no_descifra: 'La clave de cifrado no abre la cartera: no se puede leer.',
  sin_configurar: 'El puerto con asegura no está conectado.',
}

function Seccion<T>({ titulo, ayuda, lista, fila }: { titulo: string; ayuda: string; lista: Lista<T>; fila: (x: T) => React.ReactNode }) {
  const [abierta, setAbierta] = useState(false)
  const [ver, setVer] = useState(PASO)
  const visibles = lista.ejemplos.slice(0, ver)
  return (
    <section style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 12, display: 'grid', gap: 6, minWidth: 0 }}>
      <button type="button" onClick={() => setAbierta((a) => !a)} disabled={lista.total === 0} aria-expanded={abierta}
        style={{ ...btnStyle('secundario'), minHeight: 44, justifyContent: 'space-between', textAlign: 'left', width: '100%' }}>
        <span style={{ overflowWrap: 'anywhere' }}>{titulo}</span><strong>{numero(lista.total)}</strong>
      </button>
      <p style={pMuted}>{ayuda}</p>
      {abierta && lista.total > 0 && (
        <>
          <ul style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 6, fontSize: 13 }}>
            {visibles.map((x, i) => <li key={i} style={{ overflowWrap: 'anywhere' }}>{fila(x)}</li>)}
          </ul>
          {lista.ejemplos.length > ver && (
            <button type="button" onClick={() => setVer((v) => v + PASO)} style={{ ...btnStyle('secundario'), minHeight: 44, justifySelf: 'start' }}>Ver más</button>
          )}
          {lista.total > lista.ejemplos.length && ver >= lista.ejemplos.length && (
            <p style={pMuted}>… y {numero(lista.total - lista.ejemplos.length)} más (el informe enseña los {numero(lista.ejemplos.length)} primeros).</p>
          )}
        </>
      )}
    </section>
  )
}

const contacto = (x: ContactoAgenda) => <>{x.nombre}{x.telefono ? ` · ${x.telefono}` : ''}</>

export default function GoogleContactosOrdenar() {
  const [informe, setInforme] = useState<InformeOrdenar | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)

  async function leer() {
    setOcupado(true)
    setAviso(null)
    try {
      const r = await fetch('/api/correduria/google-contactos-ordenar', { cache: 'no-store' })
      const j = (await r.json().catch(() => null)) as { estado?: string; informe?: InformeOrdenar } | null
      if (r.ok && j?.estado === 'ok' && j.informe) setInforme(j.informe)
      else setAviso(MOTIVO[j?.estado ?? ''] ?? `No se ha podido leer la agenda (HTTP ${r.status}).`)
    } catch {
      setAviso('No se ha podido leer la agenda. Inténtalo de nuevo.')
    } finally {
      setOcupado(false)
    }
  }

  const i = informe
  return (
    <Bloque titulo="Ordenar agenda" Icono={ListChecks}
      sub={<>Para fusionar duplicados usa «Fusionar y corregir» de Google Contactos; se deshace en ⚙️ → Deshacer cambios (30 días).</>}>
      <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'minmax(0, 1fr)' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <button type="button" disabled={ocupado} onClick={() => void leer()} style={{ ...btnStyle(i ? 'secundario' : 'primario'), minHeight: 44 }}>
            {ocupado ? 'Leyendo tu agenda…' : i ? 'Volver a leer' : 'Revisar mi agenda'}
          </button>
        </div>
        <p style={pMuted}>Solo lectura: no cambia nada en Google ni en el CRM.</p>
        {aviso && <p role="alert" style={{ ...pMuted, color: 'var(--negative)' }}><ConIcono i={TriangleAlert}>{aviso}</ConIcono></p>}
        {i && (
          <>
            <p style={pMuted}>Leídos {numero(i.contactosLeidos)} contactos.</p>
            <Seccion titulo="Duplicados por teléfono" lista={i.duplicadosTelefono}
              ayuda="Fuera de «Grupo ASegura», varios contactos con el mismo número (primero los escritos distinto, que Google no siempre detecta)."
              fila={(x: GrupoDuplicado) => <>{x.telefono ?? '—'}{x.escritoDistinto ? ' · escrito distinto' : ''}: {x.contactos.map((c) => c.nombre).join(' / ')}</>} />
            <Seccion titulo="Sin nombre" lista={i.sinNombre} ayuda="Contactos sin ningún nombre." fila={contacto} />
            <Seccion titulo="Teléfonos que no son E.164" lista={i.noE164} ayuda="No se pueden emparejar con el CRM por teléfono: corrígelos en Google." fila={contacto} />
            <Seccion titulo="Fichas guardadas con otro nombre" lista={i.fichasOtroNombre}
              ayuda="Clientes del CRM que tienes guardados con tu propio nombre: unifícalos desde la cola de revisión (tu nombre queda como mote)."
              fila={(x: FichaOtroNombre) => <>En tu agenda: <strong>{x.nombreEnAgenda}</strong> · En el CRM: <Link href={`/correduria/cliente/${x.clienteId}`}>{x.nombreCrm}</Link> · <a href="#revision-google">ir a la cola</a></>} />
            <Seccion titulo="Parecen de trabajo y no están en el CRM" lista={i.pareceTrabajo}
              ayuda="Por su nombre o empresa (seguro, taller, perito, una compañía…). Nunca se dan de alta solos."
              fila={(x: PareceTrabajo) => (
                <span style={{ display: 'inline-flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                  <span>{contacto(x)} · <span style={{ color: 'var(--muted)' }}>{x.pista}</span></span>
                  <Link href={`/correduria/cliente/nuevo?q=${encodeURIComponent(x.nombre)}`} style={{ ...btnStyle('secundario', 'sm'), minHeight: 44 }}>Crear como lead</Link>
                </span>
              )} />
          </>
        )}
      </div>
    </Bloque>
  )
}
