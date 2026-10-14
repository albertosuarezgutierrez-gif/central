'use client'
import { useEffect, useMemo, useState } from 'react'
import { Badge, btnStyle } from '@/components/ui'
import { fechaEs } from '@/lib/ficha-asegura'
import Bloque from './Bloque'
import {
  estadoPersona, interpretarCampana, pasosEmbudo, textoNumero, textoPorcentaje,
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

function Tarjetas({ e }: { e: EmbudoCampana }) {
  const pasos = pasosEmbudo(e)
  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10 }}>
        {pasos.map((p) => (
          <div key={p.clave} style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 12, minWidth: 0 }}>
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>{p.etiqueta}</div>
            <div style={{ fontSize: 24, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{textoNumero(p.valor)}</div>
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>
              {p.pctPrevio === null && p.clave === 'enviados' ? 'punto de partida' : `${textoPorcentaje(p.pctPrevio)} del paso anterior`}
            </div>
          </div>
        ))}
      </div>
      <p style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--muted)' }}>
        No salieron: {textoNumero(e.fallidos)} · Rebotes: {textoNumero(e.rebotados)} · Bajas: {textoNumero(e.bajas)}.
        Un «—» es que no hay datos suficientes para afirmarlo, no que sea cero.
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

  return (
    <Bloque titulo="Campaña «presentación app»" accion={accion} primero
      sub="Correo de presentación de la app a los clientes en vigor. Solo lectura: el envío lo hace el cron de asegura.">
      {lectura === null && <p style={{ color: 'var(--muted)', fontSize: 13 }}>Leyendo la campaña…</p>}

      {lectura !== null && lectura.estado !== 'ok' && (
        <Badge tono="aviso">No se pudo leer la campaña: {motivoTexto(lectura)}</Badge>
      )}
      {lectura?.estado === 'ok' && fallo && (
        <p style={{ fontSize: 12, color: 'var(--negative)' }}>La última actualización falló ({motivoTexto(fallo)}). Se muestra lo anterior.</p>
      )}

      {lectura?.estado === 'ok' && (
        <div style={{ display: 'grid', gridTemplateColumns: COLS, gap: 18 }}>
          <Tarjetas e={lectura.total} />

          <div>
            <h3 style={{ margin: '0 0 8px', fontSize: 14 }}>Variante A frente a B</h3>
            {lectura.porVariante.length === 0
              ? <p style={{ fontSize: 13, color: 'var(--muted)' }}>Sin variantes con envíos todavía.</p>
              : <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))', gap: 10 }}>
                  {lectura.porVariante.map((g) => <FilaResumen key={g.grupo} g={g} />)}
                </div>}
          </div>

          <div>
            <h3 style={{ margin: '0 0 8px', fontSize: 14 }}>Por lote</h3>
            {lectura.porLote.length === 0
              ? <p style={{ fontSize: 13, color: 'var(--muted)' }}>Aún no ha salido ningún lote.</p>
              : <div style={{ display: 'grid', gridTemplateColumns: COLS, gap: 10 }}>
                  {lectura.porLote.map((g) => <FilaResumen key={g.grupo} g={g} />)}
                </div>}
          </div>

          <div>
            <h3 style={{ margin: '0 0 8px', fontSize: 14 }}>Por persona ({personas.length} más recientes)</h3>
            {personas.length === 0
              ? <p style={{ fontSize: 13, color: 'var(--muted)' }}>Sin personas todavía.</p>
              : <div style={{ display: 'grid', gridTemplateColumns: COLS, gap: 8 }}>
                  {personas.slice(0, visibles).map((p) => <Persona key={`${p.clienteId}-${p.lote}`} p={p} />)}
                  {visibles < personas.length && (
                    <button type="button" onClick={() => setVisibles((v) => v + PAGINA)} style={{ ...btnStyle('secundario', 'sm'), minHeight: 44 }}>
                      Ver más ({personas.length - visibles} restantes)
                    </button>
                  )}
                </div>}
          </div>
        </div>
      )}
    </Bloque>
  )
}
