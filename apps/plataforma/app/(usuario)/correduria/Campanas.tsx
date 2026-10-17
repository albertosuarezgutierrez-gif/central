'use client'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Mail, Users, Layers, GitCompare } from 'lucide-react'
import { Badge, btnStyle } from '@/components/ui'
import { fechaEs, fechaHoraEs } from '@/lib/ficha-asegura'
import Bloque from './Bloque'
import {
  estadoPersona, fechaDelPaso, interpretarCampana, pasosEmbudo, personasDelPaso, textoNumero, textoPorcentaje,
  type EmbudoCampana, type GrupoEmbudo, type PersonaCampana, type RespuestaCampana,
} from '@/lib/campana-presentacion'

/**
 * Seguimiento de la campaña de correo «presentación app» (solo lectura).
 * El dato lo calcula asegura; aquí solo se pinta. `null` = «—», nunca 0.
 * Rendimiento: la lista por persona monta 50 y un «Ver más».
 */
const PAGINA = 50
const COLS = 'minmax(0, 1fr)'

function motivoTexto(r: Exclude<RespuestaCampana, { estado: 'ok' }>): string {
  if (r.estado === 'sin_migracion') return 'La campaña todavía no tiene su tabla creada en la base de datos de la correduría (falta aplicar la migración en asegura). No es que no se haya enviado nada.'
  if (r.estado === 'sin_configurar') return 'El puerto con asegura no está conectado en este proyecto (falta ASEGURA_OPERADOR_SECRET).'
  switch (r.motivo) {
    case 'secreto_rechazado': return 'asegura rechaza el secreto (ASEGURA_OPERADOR_SECRET no coincide entre los dos proyectos).'
    case 'ruta_no_desplegada': return 'la versión desplegada de asegura todavía no sirve esta ruta.'
    case 'respuesta_ilegible': return 'la respuesta de asegura no tenía la forma esperada.'
    case 'red': return 'no se pudo llegar a asegura (timeout, DNS o TLS).'
    default: return r.motivo
  }
}

const fecha = (iso: string | null) => (iso ? fechaEs(iso) : '—')

/** Lista de quien está en un paso del embudo: cliente (ficha), correo y fecha/hora del evento. 50 + «Ver más». */
function ListaPaso({ id, clave, etiqueta, valor, personas, parcial }: {
  id: string; clave: string; etiqueta: string; valor: number | null; personas: PersonaCampana[]; parcial: boolean
}) {
  const [visibles, setVisibles] = useState(PAGINA)
  const lista = useMemo(() => personasDelPaso(personas, clave), [personas, clave])
  const pMuted = { fontSize: 13, color: 'var(--muted)', margin: 0 } as const
  return (
    <div id={id} style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 12, marginTop: 12, minWidth: 0 }}>
      <div style={{ fontWeight: 700, marginBottom: 8 }}>{etiqueta}: {textoNumero(valor)}</div>
      {valor === null
        ? <p style={pMuted}>Sin detalle por persona: la cifra no se puede afirmar (algún envío no tiene eventos legibles), así que tampoco su lista.</p>
        : lista.length === 0
          ? <p style={pMuted}>Nadie en este paso todavía.</p>
          : <div style={{ display: 'grid', gridTemplateColumns: COLS, gap: 8 }}>
              {lista.slice(0, visibles).map((p) => {
                const f = fechaDelPaso(p, clave)
                return (
                  <div key={`${p.clienteId}-${p.lote}`} style={{ borderTop: '1px solid var(--border)', paddingTop: 8, minWidth: 0 }}>
                    <Link href={`/correduria/cliente/${p.clienteId}`} style={{ fontWeight: 700, overflowWrap: 'anywhere' }}>{p.nombre || 'Sin nombre'}</Link>
                    <div style={{ fontSize: 12, color: 'var(--muted)', overflowWrap: 'anywhere' }}>{p.email ?? 'Correo no legible'}</div>
                    <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                      {f ? fechaHoraEs(f.iso) : 'Sin fecha'}{f?.inferido ? ' (deducido de un paso posterior)' : ''}
                    </div>
                  </div>
                )
              })}
              {visibles < lista.length && (
                <button type="button" onClick={() => setVisibles((v) => v + PAGINA)} style={{ ...btnStyle('secundario', 'sm'), minHeight: 44 }}>
                  Ver más ({lista.length - visibles} restantes)
                </button>
              )}
            </div>}
      {valor !== null && lista.length !== valor && (
        <p style={{ ...pMuted, fontSize: 11, marginTop: 8 }}>
          {parcial
            ? `La lista solo trae las ${personas.length} personas más recientes; la cifra cuenta toda la campaña.`
            : 'La lista no cuadra con la cifra: avísalo, no te fíes de ninguna de las dos.'}
        </p>
      )}
    </div>
  )
}

function Tarjetas({ e, personas }: { e: EmbudoCampana; personas: PersonaCampana[] }) {
  const pasos = pasosEmbudo(e)
  const [abierto, setAbierto] = useState<string | null>(null)
  const sel = pasos.find((p) => p.clave === abierto) ?? null
  return (
    <>
      <div className="corr-kpis" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
        {pasos.map((p) => {
          const on = p.clave === abierto
          return (
            <button key={p.clave} type="button" aria-expanded={on} aria-controls={`paso-${p.clave}`}
              onClick={() => setAbierto(on ? null : p.clave)}
              style={{
                border: `1px solid ${on ? 'var(--primary)' : 'var(--border)'}`, background: on ? 'var(--primary-light)' : 'transparent',
                color: 'inherit', font: 'inherit', textAlign: 'left', cursor: 'pointer',
                borderRadius: 10, padding: '10px 12px', minWidth: 0, minHeight: 44,
              }}>
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>{p.etiqueta}</div>
              <div style={{ fontSize: 20, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{textoNumero(p.valor)}</div>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                {p.pctPrevio === null && p.clave === 'enviados' ? 'punto de partida' : `${textoPorcentaje(p.pctPrevio)} del paso anterior`}
              </div>
            </button>
          )
        })}
      </div>
      {sel && (
        <ListaPaso key={sel.clave} id={`paso-${sel.clave}`} clave={sel.clave} etiqueta={sel.etiqueta} valor={sel.valor}
          personas={personas} parcial={e.enviados > personas.length} />
      )}
      <p style={{ margin: '10px 0 0', fontSize: 11, color: 'var(--muted)' }}>
        No salieron: {textoNumero(e.fallidos)} · Rebotes: {textoNumero(e.rebotados)} · Bajas: {textoNumero(e.bajas)}.
        Un «—» es que no hay datos suficientes para afirmarlo, no que sea cero. Pulsa una tarjeta para ver quién está en ese paso.
      </p>
    </>
  )
}

function FilaResumen({ g }: { g: GrupoEmbudo }) {
  const pasos = pasosEmbudo(g.embudo)
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 12, minWidth: 0 }}>
      <div style={{ fontWeight: 700, marginBottom: 6 }}>{g.grupo}</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: '4px 12px', fontSize: 13 }}>
        {pasos.map((p) => (
          <div key={p.clave}>
            <span style={{ color: 'var(--muted)' }}>{p.etiqueta}: </span>
            <strong style={{ fontVariantNumeric: 'tabular-nums' }}>{textoNumero(p.valor)}</strong>
            {p.clave !== 'enviados' && <span style={{ color: 'var(--muted)' }}> ({textoPorcentaje(p.pctPrevio)})</span>}
          </div>
        ))}
      </div>
    </div>
  )
}

function Persona({ p }: { p: PersonaCampana }) {
  const estado = estadoPersona(p)
  const malo = estado === 'Rebotado' || estado === 'Baja' || estado === 'No salió'
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 12, minWidth: 0 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <strong style={{ overflowWrap: 'anywhere' }}>{p.nombre || '—'}</strong>
        <Badge tono={malo ? 'negativo' : 'neutral'}>{estado}</Badge>
        <span style={{ fontSize: 12, color: 'var(--muted)' }}>Variante {p.variante || '—'} · lote {p.lote}</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '2px 12px', marginTop: 6, fontSize: 12, color: 'var(--muted)' }}>
        <span>Enviado: {fecha(p.enviadoEn)}</span>
        <span>Entregado: {fecha(p.entregadoEn)}</span>
        <span>Abierto: {fecha(p.abiertoEn)}</span>
        <span>Clic: {fecha(p.clicEn)}</span>
        <span>Visita: {fecha(p.visitaEn)}</span>
        <span>Registrado: {fecha(p.registradoEn)}</span>
        <span>Rebote: {fecha(p.rebotadoEn)}</span>
        <span>Baja: {fecha(p.bajaEn)}</span>
      </div>
    </div>
  )
}

export default function Campanas() {
  const [lectura, setLectura] = useState<RespuestaCampana | null>(null)
  const [cargando, setCargando] = useState(true)
  const [visibles, setVisibles] = useState(PAGINA)

  const leer = async () => {
    setCargando(true)
    try {
      const res = await fetch('/api/correduria/campana-presentacion')
      const r = interpretarCampana(res.status, await res.json().catch(() => null))
      // Una recarga fallida conserva lo último bueno y avisa abajo.
      setLectura((prev) => (r.estado === 'ok' || !prev || prev.estado !== 'ok' ? r : prev))
      if (r.estado !== 'ok') setFallo(r)
      else setFallo(null)
    } catch {
      setFallo({ estado: 'error', motivo: 'red' })
      setLectura((prev) => prev ?? { estado: 'error', motivo: 'red' })
    } finally {
      setCargando(false)
    }
  }
  const [fallo, setFallo] = useState<Exclude<RespuestaCampana, { estado: 'ok' }> | null>(null)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void leer() }, [])

  const personas = useMemo(() => (lectura?.estado === 'ok' ? lectura.personas : []), [lectura])

  const accion = (
    <button type="button" onClick={() => void leer()} disabled={cargando} style={{ ...btnStyle('secundario', 'sm'), minHeight: 44 }}>
      {cargando ? 'Leyendo…' : 'Actualizar'}
    </button>
  )

  const ok = lectura?.estado === 'ok' ? lectura : null
  const pMuted = { fontSize: 13, color: 'var(--muted)', margin: 0 } as const

  return (
    <>
      <Bloque titulo="Campaña «presentación app»" Icono={Mail} accion={accion} primero
        sub="Correo de presentación de la app a los clientes en vigor. Solo lectura: el envío lo hace el cron de asegura.">
        {lectura === null && <p style={pMuted}>Leyendo la campaña…</p>}

        {lectura !== null && lectura.estado !== 'ok' && (
          <Bloque titulo="No se pudo leer la campaña" tono="aviso" destacado>
            <p style={pMuted}>{motivoTexto(lectura)} <strong>No lo leas como «sin envíos»</strong>: desde aquí no se ha podido mirar.</p>
          </Bloque>
        )}
        {ok && fallo && (
          <p role="alert" style={{ ...pMuted, color: 'var(--negative)', marginBottom: 10 }}>La última actualización falló ({motivoTexto(fallo)}). Se muestra lo anterior.</p>
        )}
        {ok && <Tarjetas e={ok.total} personas={ok.personas} />}
      </Bloque>

      {ok && (
        <>
          <Bloque titulo="Variante A frente a B" Icono={GitCompare}>
            {ok.porVariante.length === 0
              ? <p style={pMuted}>Sin variantes con envíos todavía.</p>
              : <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))', gap: 10 }}>
                  {ok.porVariante.map((g) => <FilaResumen key={g.grupo} g={g} />)}
                </div>}
          </Bloque>

          <Bloque titulo="Por lote" Icono={Layers}>
            {ok.porLote.length === 0
              ? <p style={pMuted}>Aún no ha salido ningún lote.</p>
              : <div style={{ display: 'grid', gridTemplateColumns: COLS, gap: 10 }}>
                  {ok.porLote.map((g) => <FilaResumen key={g.grupo} g={g} />)}
                </div>}
          </Bloque>

          <Bloque titulo={`Por persona (${personas.length} más recientes)`} Icono={Users}>
            {personas.length === 0
              ? <p style={pMuted}>Sin personas todavía.</p>
              : <div style={{ display: 'grid', gridTemplateColumns: COLS, gap: 8 }}>
                  {personas.slice(0, visibles).map((p) => <Persona key={`${p.clienteId}-${p.lote}`} p={p} />)}
                  {visibles < personas.length && (
                    <button type="button" onClick={() => setVisibles((v) => v + PAGINA)} style={{ ...btnStyle('secundario', 'sm'), minHeight: 44 }}>
                      Ver más ({personas.length - visibles} restantes)
                    </button>
                  )}
                </div>}
          </Bloque>
        </>
      )}
    </>
  )
}
