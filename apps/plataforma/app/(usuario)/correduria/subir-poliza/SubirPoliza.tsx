'use client'
import Link from 'next/link'
import { useRef } from 'react'
import { btnStyle, cardStyle } from '@/components/ui'
import { eur } from '@/lib/dinero'
import { rotuloRamo, type FichaTomador } from '@/lib/seguimiento-asegura'
import { AvisosLectura, enlaceStyle as enlace, useLeerPoliza, type LecturaOk as Lectura } from '../LeerPoliza'

function fecha(iso: string): string {
  const [a, m, d] = iso.split('-')
  return `${d}/${m}/${a}`
}

/**
 * Lee el documento por `/api/correduria/oportunidad/leer` (puerto `leer-documento`
 * de asegura) y enseña adónde ir: la póliza si ya es nuestra, la ficha del
 * tomador si la tiene, o el alta. Tres estados en cada dato: `null` = no se ha
 * leído (y se dice), nunca un «no hay». La lectura y los avisos son los de
 * `../LeerPoliza`, los mismos de la ficha del cliente.
 */
export default function SubirPoliza() {
  const fichero = useRef<HTMLInputElement>(null)
  // Sin `clienteId`: aquí no hay ficha de partida. `crear` abre la oportunidad y guarda el fichero (29/09/2026).
  const { leer, leyendo, motivoError, lectura, oportunidad, ficha, sinGuardar, fichaIncierta, figuras, identidad, conOportunidad } = useLeerPoliza({ tomador: true, crear: true })

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div style={{ ...cardStyle, display: 'grid', gap: 8 }}>
        <input
          ref={fichero}
          type="file"
          accept="application/pdf,image/*"
          hidden
          onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void leer(f) }}
        />
        <button
          type="button"
          disabled={leyendo}
          onClick={() => fichero.current?.click()}
          style={{ ...btnStyle('primario'), minHeight: 44, justifySelf: 'start' }}
        >
          {leyendo ? 'Leyendo el documento…' : lectura || motivoError ? 'Leer otro documento' : 'Elegir PDF o foto'}
        </button>
        {motivoError && <div role="status" style={{ color: 'var(--negative)' }}>No se ha podido leer: {motivoError}.</div>}
      </div>
      <AvisosLectura oportunidad={oportunidad} ficha={ficha} sinGuardar={sinGuardar} fichaIncierta={fichaIncierta} figuras={figuras} identidad={identidad} />
      {lectura && <Resultado l={lectura} conOportunidad={conOportunidad} />}
    </div>
  )
}

function Dato({ k, v }: { k: string; v: string | null }) {
  return (
    <div style={{ display: 'grid', gap: 2, minWidth: 0 }}>
      <span style={{ fontSize: 11, color: 'var(--muted)' }}>{k}</span>
      <span style={{ fontWeight: 600, overflowWrap: 'anywhere', color: v === null ? 'var(--muted)' : 'var(--text)' }}>{v ?? 'no leído'}</span>
    </div>
  )
}

function Fichas({ fichas }: { fichas: FichaTomador[] }) {
  return (
    <div style={{ display: 'grid', gap: 6 }}>
      {fichas.map(f => (
        <Link key={f.id} href={`/correduria/cliente/${encodeURIComponent(f.id)}?tab=oportunidades&oportunidad=nueva`} style={enlace}>
          {f.nombre}{f.activo ? '' : ' (inactiva)'} → abrir oportunidad
        </Link>
      ))}
    </div>
  )
}

function Resultado({ l, conOportunidad }: { l: Lectura; conOportunidad: boolean }) {
  const t = l.tomador
  const nuestra = l.enCartera ?? null
  const altaHref = `/correduria/cliente/nuevo${t?.nombre ? `?q=${encodeURIComponent(t.nombre)}` : ''}`
  return (
    <div style={{ ...cardStyle, display: 'grid', gap: 14 }}>
      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' }}>
        <Dato k="Ramo" v={l.ramo ? rotuloRamo(l.ramo) : null} />
        <Dato k="Compañía" v={l.compania} />
        <Dato k="Nº de póliza" v={l.numeroPoliza} />
        <Dato k="Vence" v={l.vence ? fecha(l.vence) : null} />
        <Dato k="Prima anual" v={l.prima !== null ? eur(l.prima) : null} />
        {(l.vehiculo || l.matricula) && <Dato k="Vehículo" v={[l.vehiculo, l.matricula].filter(Boolean).join(' · ')} />}
        <Dato k="Tomador" v={t?.nombre ?? null} />
      </div>

      {conOportunidad ? null : nuestra && nuestra.length > 0 ? (
        <div style={{ display: 'grid', gap: 6 }}>
          <strong>Esta póliza ya es nuestra (en vigor):</strong>
          {nuestra.map(p => (
            <Link key={p.polizaId} href={`/correduria/poliza/${encodeURIComponent(p.polizaId)}`} style={enlace}>
              Ver póliza{p.aseguradora ? ` de ${p.aseguradora}` : ''} →
            </Link>
          ))}
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 8 }}>
          {nuestra === null && <span style={{ fontSize: 12, color: 'var(--muted)' }}>No se ha podido comprobar si la póliza ya es nuestra.</span>}
          {t?.coincidencias && t.coincidencias.length > 0 && (
            <><strong>Ya tiene ficha (mismo DNI):</strong><Fichas fichas={t.coincidencias} /></>
          )}
          {(!t?.coincidencias || t.coincidencias.length === 0) && t?.posibles && t.posibles.length > 0 && (
            <><strong>Se llaman igual (sin DNI que lo confirme: puede ser otra persona):</strong><Fichas fichas={t.posibles} /></>
          )}
          {(!t || t.coincidencias === null) && <span style={{ fontSize: 12, color: 'var(--muted)' }}>No se ha podido saber si el tomador ya tiene ficha: búscalo antes de darlo de alta.</span>}
          {(!t?.coincidencias || t.coincidencias.length === 0) && (
            <Link href={altaHref} style={{ ...btnStyle('primario'), minHeight: 44, textDecoration: 'none', justifySelf: 'start' }}>
              + Dar de alta {t?.nombre ?? 'al cliente'}
            </Link>
          )}
        </div>
      )}
    </div>
  )
}
