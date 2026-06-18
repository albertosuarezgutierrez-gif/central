'use client'
import { useMemo, useState, type ReactElement } from 'react'
import {
  alergenosElaboracion,
  evaluarSalida,
  validarControles,
  objetivoControl,
  muestrasACaducar,
  ALERGENO_NOMBRE,
  type ElaboracionTraza,
  type UbicacionEvento,
  type TipoControl,
} from '@central/module-trazabilidad'

// ─── Identidad de marca (logo verde) ─────────────────────────
const C = {
  verde: '#02473B', verdeClaro: '#0B6B57',
  oro: '#9E8152', oroClaro: '#C2A973',
  papel: '#FBFAF6', tinta: '#1E2622', ink3: '#5C6660', linea: '#E6E2D6',
  rojo: '#9E2B25', ambar: '#9A6B12',
}
const SE = 'Newsreader, Georgia, serif'
const SN = 'Inter Tight, system-ui, sans-serif'

const PARTIDA_COLOR: Record<string, string> = {
  frio: '#2B6A6E', caliente: '#C0492B', corte: '#9E8152', montaje: '#3F7D44',
}
const CTRL_ICONO: Record<TipoControl, string> = {
  termico: '🌡️', abatimiento: '🧊', congelacion: '❄️', refrigeracion: '🧊',
}

// ── Ubicaciones/eventos reales del parte del 20/6/2026 ──
const UBICACIONES: UbicacionEvento[] = [
  { id: 'alba', nombre: 'Hacienda El Alba', pax: 115, fecha_evento: '2026-06-20' },
  { id: 'fresnos', nombre: 'Finca Los Fresnos', pax: 131, fecha_evento: '2026-06-20' },
  { id: 'trinidad', nombre: 'Hacienda Trinidad', pax: 136, fecha_evento: '2026-06-20' },
  { id: 'decanato', nombre: 'Decanato And. Occidental', pax: 20, fecha_evento: '2026-06-18' },
]
const UB_NOMBRE: Record<string, string> = Object.fromEntries(UBICACIONES.map(u => [u.id, u.nombre]))

// ── Elaboraciones REALES con su ficha de trazabilidad (datos del PDF de Carmen) ──
// Lote/Proveedor van en blanco en su parte (se rellenan en recepción) → así se ve fiel.
const ELABORACIONES: ElaboracionTraza[] = [
  {
    id: 'antojito', nombre: 'Antojito de queso de cabra', partida: 'montaje',
    ubicaciones: ['alba', 'decanato'],
    depende_de: ['MEDALLÓN caramelizado', 'QUESO DE CABRA', 'CEBOLLA CARAMELIZADA'],
    ingredientes: [
      { nombre: 'tortillas de trigo', cantidad: '120 u', lote: '', proveedor: '' },
      { nombre: 'queso de cabra', cantidad: '2 kg', lote: '', proveedor: '' },
      { nombre: 'cebolla', cantidad: '1,5 kg', lote: '', proveedor: '', desinfeccion: { dosificacion: '1 past./10 L', permanencia: '10 min', aclarado: 'agua abundante' } },
    ],
    controles: [{ tipo: 'refrigeracion', valor: 3, hora: '2026-06-20T08:30:00Z' }],
    muestra_testigo: true, muestra_testigo_at: '2026-06-20T12:00:00Z',
    entrada: { hora: '07:50', temp: 3 }, salida: { hora: '11:20', temp: 5 }, firma: 'Carmen',
  },
  {
    id: 'pollo-mostaza', nombre: 'Delicia de pollo con mostaza y miel', partida: 'caliente',
    ubicaciones: ['alba'],
    depende_de: ['SALSA DE MOSTAZA Y MIEL'],
    ingredientes: [
      { nombre: 'pechuga de pollo', cantidad: '14 kg', lote: '', proveedor: '', descongelacion: true },
      { nombre: 'mostaza', cantidad: '400 g', lote: '', proveedor: '' },
      { nombre: 'mayonesa', cantidad: '500 g', lote: '', proveedor: '' },
      { nombre: 'miel de flores', cantidad: '300 g', lote: '', proveedor: '' },
    ],
    controles: [{ tipo: 'termico', valor: 76, hora: '2026-06-20T09:10:00Z' }, { tipo: 'refrigeracion', valor: 4 }],
    muestra_testigo: true, muestra_testigo_at: '2026-06-20T13:00:00Z',
    entrada: { hora: '06:30', temp: -2 }, salida: { hora: '12:00', temp: 65 }, firma: 'Carmen',
  },
  {
    id: 'canelon', nombre: 'Mini canelón de boletus con salsa de chalota', partida: 'caliente',
    ubicaciones: ['fresnos', 'trinidad'],
    depende_de: ['salsa de chalota'],
    ingredientes: [
      { nombre: 'nata para cocinar', cantidad: '2 L', lote: '', proveedor: '' },
      { nombre: 'chalota', cantidad: '1 kg', lote: '', proveedor: '' },
      { nombre: 'Avecrem caldo de carne', cantidad: '4 past.', lote: '', proveedor: '' },
      { nombre: 'mantequilla', cantidad: '250 g', lote: '', proveedor: '' },
      { nombre: 'placas de canelón', cantidad: '267 u', lote: '', proveedor: '' },
    ],
    // Térmico aún SIN registrar → la página mostrará la salida BLOQUEADA
    controles: [{ tipo: 'termico' }, { tipo: 'refrigeracion', valor: 3 }],
    muestra_testigo: true, muestra_testigo_at: '2026-06-20T13:30:00Z',
    entrada: { hora: '07:00', temp: 2 }, salida: { hora: null, temp: null }, firma: '',
  },
  {
    id: 'samosa', nombre: 'Samosa de pollo mozárabe y cremoso de cacahuete', partida: 'caliente',
    ubicaciones: ['trinidad', 'fresnos'],
    depende_de: ['ALIOLI DE CACAHUETES'],
    ingredientes: [
      { nombre: 'cacahuetes repelados fritos', cantidad: '600 g', lote: '', proveedor: '' },
      { nombre: 'mahonesa ybarra', cantidad: '500 g', lote: '', proveedor: '' },
      { nombre: 'ajo pelado', cantidad: '100 g', lote: '', proveedor: '' },
      { nombre: 'pasta brick', cantidad: '136 u', lote: '', proveedor: '' },
    ],
    controles: [{ tipo: 'termico', valor: 74 }],
    muestra_testigo: true, muestra_testigo_at: '2026-06-20T12:30:00Z',
    entrada: { hora: '07:20', temp: 1 }, salida: { hora: '11:40', temp: 60 }, firma: 'Carmen',
  },
  {
    id: 'lomo', nombre: 'Caña de lomo ibérica', partida: 'corte',
    ubicaciones: ['alba'],
    depende_de: ['CAÑA DE LOMO CORTADA'],
    ingredientes: [
      { nombre: 'caña de lomo ibérica', cantidad: '2,35 kg', lote: '', proveedor: '' },
    ],
    controles: [{ tipo: 'refrigeracion', valor: 4 }],
    muestra_testigo: true, muestra_testigo_at: '2026-06-20T11:00:00Z',
    entrada: { hora: '08:00', temp: 4 }, salida: { hora: '10:30', temp: 6 }, firma: 'Carmen',
  },
  {
    id: 'quesos', nombre: 'Rincón andaluz · 5 tipos de quesos', partida: 'corte',
    ubicaciones: ['trinidad'],
    depende_de: ['5 TIPOS DE QUESOS CORTADOS'],
    ingredientes: [
      { nombre: 'queso de cabra a la pimienta', cantidad: '500 g', lote: '', proveedor: '' },
      { nombre: 'queso mahón', cantidad: '500 g', lote: '', proveedor: '' },
      { nombre: 'queso curado de vaca, oveja y cabra', cantidad: '500 g', lote: '', proveedor: '' },
    ],
    // refrigeración sin registrar y sin firma → BLOQUEADA (demuestra el control)
    controles: [{ tipo: 'refrigeracion' }],
    muestra_testigo: false,
    entrada: { hora: '08:10', temp: 5 }, salida: { hora: null, temp: null }, firma: '',
  },
]

const SEMANA = '20/6/2026'

function Chip({ children, bg, fg, br }: { children: React.ReactNode; bg: string; fg: string; br?: string }): ReactElement {
  return <span style={{ fontFamily: SN, fontSize: 11.5, fontWeight: 600, color: fg, background: bg, border: br ? `1px solid ${br}` : 'none', borderRadius: 20, padding: '2px 9px', whiteSpace: 'nowrap' }}>{children}</span>
}

function FichaElaboracion({ e }: { e: ElaboracionTraza }): ReactElement {
  const alergenos = useMemo(() => alergenosElaboracion(e), [e])
  const veredicto = useMemo(() => evaluarSalida(e), [e])
  const controles = useMemo(() => validarControles(e), [e])
  const pColor = PARTIDA_COLOR[e.partida ?? ''] ?? C.ink3

  return (
    <div style={{ background: '#fff', border: `1px solid ${C.linea}`, borderRadius: 14, padding: '16px 18px', marginBottom: 16 }}>
      {/* Cabecera de la ficha */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontFamily: SN, fontWeight: 800, fontSize: 'clamp(15px,3.4vw,18px)', color: C.tinta }}>{e.nombre}</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
            <Chip bg={pColor} fg="#fff">{(e.partida ?? 'sin partida').toUpperCase()}</Chip>
            {e.ubicaciones.map(u => <Chip key={u} bg={C.papel} fg={C.ink3} br={C.linea}>{UB_NOMBRE[u] ?? u}</Chip>)}
          </div>
        </div>
        {/* Veredicto de salida (mi idea: bloqueo APPCC) */}
        {veredicto.apta
          ? <Chip bg="rgba(63,125,68,.12)" fg="#2f6b34" br="#3F7D44">✓ Apta para salida</Chip>
          : <Chip bg="rgba(158,43,37,.10)" fg={C.rojo} br={C.rojo}>⛔ Salida bloqueada</Chip>}
      </div>

      {/* Motivos del bloqueo */}
      {!veredicto.apta && (
        <div style={{ marginTop: 8, fontFamily: SN, fontSize: 12.5, color: C.rojo }}>
          {veredicto.faltan_controles.length > 0 && <div>· Falta registrar: {veredicto.faltan_controles.join(', ')}</div>}
          {veredicto.no_conformes.length > 0 && <div>· Fuera de rango: {veredicto.no_conformes.join(', ')}</div>}
          {veredicto.sin_muestra_testigo && <div>· Sin muestra testigo</div>}
          {veredicto.sin_firma && <div>· Sin firma del responsable</div>}
        </div>
      )}

      {/* Alérgenos automáticos */}
      {alergenos.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 12, alignItems: 'center' }}>
          <span style={{ fontFamily: SN, fontSize: 11, fontWeight: 700, letterSpacing: .5, color: C.oro, textTransform: 'uppercase' }}>Alérgenos</span>
          {alergenos.map(a => <Chip key={a} bg="rgba(154,107,18,.10)" fg={C.ambar} br="rgba(154,107,18,.3)">{ALERGENO_NOMBRE[a]}</Chip>)}
        </div>
      )}

      {/* Ficha de ingredientes — filas que envuelven (responsive, sin scroll horizontal) */}
      <div style={{ marginTop: 14 }}>
        {e.ingredientes.map((ing, i) => (
          <div key={i} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: '2px 10px', padding: '7px 0', borderBottom: `1px solid ${C.papel}` }}>
            <span style={{ fontFamily: SN, fontWeight: 700, fontSize: 13.5, color: C.tinta, flex: '1 1 auto', minWidth: 0 }}>{ing.nombre}</span>
            <span style={{ fontFamily: SN, fontWeight: 800, fontSize: 13.5, color: C.verde, whiteSpace: 'nowrap' }}>{ing.cantidad || '—'}</span>
            <div style={{ flex: '1 1 100%', display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 3 }}>
              <span style={{ fontFamily: SN, fontSize: 11, color: ing.lote ? C.tinta : C.ink3, background: C.papel, border: `1px solid ${C.linea}`, borderRadius: 6, padding: '1px 7px' }}>Lote {ing.lote || '⬚'}</span>
              <span style={{ fontFamily: SN, fontSize: 11, color: ing.proveedor ? C.tinta : C.ink3, background: C.papel, border: `1px solid ${C.linea}`, borderRadius: 6, padding: '1px 7px' }}>Prov. {ing.proveedor || '⬚'}</span>
              {ing.desinfeccion && <span style={{ fontFamily: SN, fontSize: 11, color: C.ink3, background: C.papel, border: `1px solid ${C.linea}`, borderRadius: 6, padding: '1px 7px' }}>🧪 Desinfección</span>}
              {ing.descongelacion && <span style={{ fontFamily: SN, fontSize: 11, color: C.ink3, background: C.papel, border: `1px solid ${C.linea}`, borderRadius: 6, padding: '1px 7px' }}>❄️ Descongelación</span>}
            </div>
          </div>
        ))}
        <div style={{ fontFamily: SN, fontSize: 11, color: C.ink3, marginTop: 6 }}>⬚ = se rellena en recepción (lote/proveedor del albarán)</div>
      </div>


      {/* Puntos de control con su estado */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 14 }}>
        {controles.map((r, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: SN, fontSize: 12, color: C.tinta, background: C.papel, border: `1px solid ${r.registrado ? (r.conforme ? '#3F7D44' : C.rojo) : C.linea}`, borderRadius: 8, padding: '4px 10px' }}>
            <span>{CTRL_ICONO[r.tipo]}</span>
            <span>{objetivoControl(r.tipo)}</span>
            <span style={{ fontWeight: 700, color: r.registrado ? (r.conforme ? '#2f6b34' : C.rojo) : C.ink3 }}>
              {r.registrado ? (r.conforme ? '✓' : '✗') : '⬚ sin registrar'}
            </span>
          </div>
        ))}
      </div>

      {/* Muestra testigo · entrada/salida · firma */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, marginTop: 14, fontFamily: SN, fontSize: 12.5, color: C.ink3 }}>
        <span>🧪 Muestra testigo: <strong style={{ color: e.muestra_testigo ? '#2f6b34' : C.rojo }}>{e.muestra_testigo ? 'Sí' : 'No'}</strong></span>
        <span>⬇️ Entrada: <strong style={{ color: C.tinta }}>{e.entrada?.hora ?? '—'}{e.entrada?.temp != null ? ` · ${e.entrada.temp} °C` : ''}</strong></span>
        <span>⬆️ Salida: <strong style={{ color: C.tinta }}>{e.salida?.hora ?? '—'}{e.salida?.temp != null ? ` · ${e.salida.temp} °C` : ''}</strong></span>
        <span>✍️ Firma: <strong style={{ color: e.firma ? C.tinta : C.rojo }}>{e.firma || 'pendiente'}</strong></span>
      </div>
    </div>
  )
}

export default function ParteTrazaPage(): ReactElement {
  // Aviso de muestras testigo que ya pueden retirarse (al cierre del 22/6)
  const muestras = useMemo(() => muestrasACaducar(ELABORACIONES, '2026-06-22T20:00:00Z', 2), [])
  const totalPax = UBICACIONES.reduce((a, u) => a + u.pax, 0)
  const bloqueadas = ELABORACIONES.filter(e => !evaluarSalida(e).apta).length

  return (
    <div style={{ minHeight: '100vh', background: C.papel, color: C.tinta, fontFamily: SN }}>
      <div style={{ maxWidth: 1180, margin: '0 auto', padding: 'clamp(20px,5vw,44px) clamp(16px,4vw,40px) 64px' }}>

        {/* Cabecera */}
        <div style={{ borderBottom: `3px solid ${C.verde}`, paddingBottom: 18, marginBottom: 22 }}>
          <div style={{ fontFamily: SN, letterSpacing: 3, fontSize: 13, color: C.oro, textTransform: 'uppercase', fontWeight: 700 }}>Catering Joaquín Jaén · Cocina</div>
          <h1 style={{ fontFamily: SE, fontWeight: 600, fontSize: 'clamp(26px,5.5vw,44px)', color: C.verde, margin: '6px 0 4px', lineHeight: 1.1 }}>
            Parte de elaboración · <span style={{ color: C.oro }}>trazabilidad</span>
          </h1>
          <div style={{ fontFamily: SN, fontSize: 'clamp(14px,3.2vw,17px)', color: C.ink3 }}>
            Semana de servicio {SEMANA} · {totalPax} PAX · {ELABORACIONES.length} elaboraciones
          </div>
        </div>

        {/* Constantes APPCC del parte */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,240px),1fr))', gap: 10, marginBottom: 18 }}>
          {[
            '🌡️ Tratamiento térmico > 70 °C / 2 min',
            '🧊 Abatimiento 60 → 10 °C en < 2 h',
            '❄️ Congelación ≤ −18 °C',
            '🧪 Muestra testigo y firma por elaboración',
          ].map(t => (
            <div key={t} style={{ background: '#fff', border: `1px solid ${C.linea}`, borderRadius: 10, padding: '10px 12px', fontFamily: SN, fontSize: 12.5, color: C.tinta }}>{t}</div>
          ))}
        </div>

        {/* Avisos del sistema (mis ideas: bloqueo + muestras a retirar) */}
        {bloqueadas > 0 && (
          <div style={{ background: 'rgba(158,43,37,.07)', border: `1px solid ${C.rojo}`, borderRadius: 12, padding: '12px 16px', marginBottom: 12, fontFamily: SN, fontSize: 14, color: C.rojo }}>
            ⛔ <strong>{bloqueadas} elaboracion{bloqueadas > 1 ? 'es' : ''}</strong> no pueden salir todavía: falta registrar un control, la muestra testigo o la firma.
          </div>
        )}
        {muestras.length > 0 && (
          <div style={{ background: 'rgba(154,107,18,.08)', border: `1px solid ${C.ambar}`, borderRadius: 12, padding: '12px 16px', marginBottom: 22, fontFamily: SN, fontSize: 14, color: C.ambar }}>
            🧪 <strong>{muestras.length} muestra{muestras.length > 1 ? 's' : ''} testigo</strong> ya cumplen su plazo de conservación y pueden retirarse: {muestras.map(m => m.nombre).join(' · ')}.
          </div>
        )}

        {/* Fichas */}
        {ELABORACIONES.map(e => <FichaElaboracion key={e.id} e={e} />)}

        {/* Pie */}
        <p style={{ fontFamily: SN, fontSize: 15, color: C.ink3, textAlign: 'center', lineHeight: 1.5, marginTop: 28 }}>
          Es tu mismo parte de elaboración, pero el sistema <strong style={{ color: C.verde }}>valida los controles, detecta los alérgenos solo
          y no deja salir un plato</strong> sin su registro, su muestra testigo y tu firma.
        </p>
        <div style={{ textAlign: 'center', marginTop: 10, fontFamily: SN, fontSize: 12.5, color: C.oro, letterSpacing: 1 }}>CATERING JOAQUÍN JAÉN · TRAZABILIDAD · ia.rest</div>
      </div>
    </div>
  )
}
