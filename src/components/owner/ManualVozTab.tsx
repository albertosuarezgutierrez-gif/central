'use client'
import { C, SE, SN, SM, SC } from '@/lib/colors'
// src/components/owner/ManualVozTab.tsx
// Manual de protocolo de voz — visible en /owner y para jefe de sala
// Incluye: protocolo por rol, novedades con badge NUEVO, sugerencias de mejora

import React, { useState, useEffect, useCallback } from 'react'
import ChuleteVoz from '@/components/ChuleteVoz'

/* ─── Tokens de diseño ─── */

/* ─── Tipos ─── */
interface Novedad {
  id: string
  version: string
  titulo: string
  descripcion: string | null
  ejemplo_antes: string | null
  ejemplo_despues: string | null
  rol_afectado: string
  restaurante_id: string | null
  created_at: string
}

interface Props {
  restauranteId: string
  session: { id: string; nombre: string; rol: string }
}

/* ─── Helpers ─── */
function esNuevo(iso: string) {
  return Date.now() - new Date(iso).getTime() < 7 * 24 * 3600 * 1000
}
function fechaCorta(iso: string) {
  return new Date(iso).toLocaleDateString('es', { day: '2-digit', month: 'short', year: '2-digit' })
}

/* ─── Tabla de protocolo ─── */
function Tabla({ filas, color }: { filas: { v: string; r: string }[]; color: string }) {
  return (
    <div style={{ borderRadius: 8, overflow: 'hidden', border: `1px solid ${color}33`, marginTop: 6, marginBottom: 16 }}>
      {filas.map((f, i) => (
        <div key={i} style={{
          display: 'flex', gap: 0,
          borderBottom: i < filas.length - 1 ? `1px solid ${color}22` : 'none',
          background: i % 2 === 0 ? `${color}08` : 'white',
        }}>
          <div style={{ flex: '0 0 52%', padding: '7px 10px', borderRight: `1px solid ${color}22`, fontFamily: SM, fontSize: 12, fontWeight: 700, color }}>{f.v}</div>
          <div style={{ flex: 1, padding: '7px 10px', fontFamily: SN, fontSize: 12, color: C.ink3 }}>{f.r}</div>
        </div>
      ))}
    </div>
  )
}

/* ─── Caja informativa ─── */
function InfoBox({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <div style={{ background: `${color}14`, border: `1px solid ${color}33`, borderRadius: 6, padding: '8px 12px', marginBottom: 14, fontSize: 12, color: C.ink3, lineHeight: 1.6 }}>
      {children}
    </div>
  )
}

/* ─── Sección título ─── */
function SecTitle({ label, color }: { label: string; color: string }) {
  return <div style={{ fontFamily: SM, fontSize: 10, fontWeight: 700, color, letterSpacing: '.06em', marginBottom: 5, marginTop: 4 }}>{label}</div>
}

/* ─── Formula slot ─── */
function FormulaBox({ slots, nota }: { slots: string[]; nota?: string }) {
  return (
    <div style={{ background: C.ink, borderRadius: 10, padding: '12px 16px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      {slots.map((s, i) => (
        <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ display: 'inline-block', padding: '4px 10px', borderRadius: 5, background: '#3A332C', fontFamily: SM, fontSize: 11, fontWeight: 700, color: s.startsWith('[') ? '#9A8D7C' : '#F6F1E7' }}>{s}</span>
          {i < slots.length - 1 && <span style={{ color: '#6B5F52', fontFamily: SM, fontSize: 16 }}>·</span>}
        </span>
      ))}
      {nota && <span style={{ fontFamily: SM, fontSize: 10, color: '#6B5F52', marginLeft: 4 }}>{nota}</span>}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════
   PROTOCOLO CAMARERO
══════════════════════════════════════════════════════════════ */
function ProtocoloCamarero() {
  return (
    <div>
      <FormulaBox slots={['MESA / ROL / NOMBRE', 'ÍTEMS / MENSAJE']} nota="[nota / cuenta / marcha / urgente]" />

      {/* Destinos */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {[
          { label: 'MESA', color: C.red, bg: C.redS, desc: 'Código de mesa. Siempre primero.', chips: ['T3', 'B1', 'S12', 'P2'] },
          { label: 'EQUIPO', color: C.teal, bg: C.tealS, desc: 'Mensaje al chat del turno.', chips: ['cocina', 'barra', 'jefe', 'running'] },
          { label: 'COMPAÑERO', color: C.amber, bg: C.amberS, desc: 'Nombre → push directo.', chips: ['Pablo', 'María'] },
        ].map(d => (
          <div key={d.label} style={{ flex: '1 1 130px', background: d.bg, border: `1px solid ${d.color}44`, borderRadius: 8, padding: '10px 12px' }}>
            <div style={{ fontFamily: SM, fontSize: 9, fontWeight: 700, color: d.color, letterSpacing: '.06em', marginBottom: 3 }}>{d.label}</div>
            <div style={{ fontSize: 12, color: C.ink3, marginBottom: 6 }}>{d.desc}</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {d.chips.map(ch => (
                <span key={ch} style={{ fontFamily: SM, fontSize: 11, fontWeight: 700, color: d.color, background: 'white', border: `1px solid ${d.color}55`, padding: '2px 6px', borderRadius: 4 }}>{ch}</span>
              ))}
            </div>
          </div>
        ))}
      </div>

      <SecTitle label="🍽️ COMANDA BÁSICA" color={C.red} />
      <Tabla color={C.red} filas={[
        { v: 'T3   dos cañas una tónica',    r: 'Mesa T3 · 2 cañas + 1 tónica' },
        { v: 'B1   tres menús del día',       r: 'Barra 1 · 3 menús' },
        { v: 'S12  una paella para dos',      r: 'Salón 12 · 1 paella · 2 pax' },
        { v: 'T3   dos cañas y una tónica',   r: 'con "y" también funciona' },
      ]} />

      <SecTitle label="📝 CON NOTA — palabra clave 'nota' al final" color={C.amber} />
      <Tabla color={C.amber} filas={[
        { v: 'T3   entrecot   nota muy hecho',     r: 'nota: muy hecho → ticket cocina' },
        { v: 'B1   cañas      nota en copa',        r: 'nota: en copa → ticket barra' },
        { v: 'T3   paella     nota sin marisco',    r: 'nota: sin marisco → ticket cocina' },
        { v: 'S4   menú       nota alérgico gluten',r: 'alerta alérgeno en cocina' },
      ]} />

      <SecTitle label="🍷 VARIANTES DE CARTA — vinos, tapas, raciones" color={C.teal} />
      <Tabla color={C.teal} filas={[
        { v: 'T3   tinto Ribera',           r: 'alias "Ribera" → Ribera del Duero (BD)' },
        { v: 'T3   tinto Verónica',         r: 'alias "Verónica" → Tinto Verónica registrado' },
        { v: 'T3   tinto',                  r: '⚡ Clarificación → chips con todos los tintos' },
        { v: 'T3   tapa bravas',            r: 'Patatas Bravas · formato: tapa' },
        { v: 'T3   media jamón',            r: 'Jamón Ibérico · formato: media ración' },
        { v: 'T3   dos raciones croquetas', r: '2× Croquetas · ración entera' },
      ]} />

      <SecTitle label="🧾 CUENTA · MARCHAR · URGENTE · 86" color={C.ink3} />
      <Tabla color={C.ink3} filas={[
        { v: 'T3   cuenta',          r: 'Solicita cuenta → estado cuenta_pedida' },
        { v: 'T3   marcha',          r: 'Marcha todo de T3 → notif running + KDS' },
        { v: 'T3   urgente',         r: 'Reclamación urgente → alerta KDS + jefe' },
        { v: '86   las bravas',      r: 'Bravas → agotado · bloquea en carta' },
        { v: 'T3   cuenta dividir 2',r: 'Divide cuenta entre 2 personas' },
        { v: 'T3   cuenta tarjeta',  r: 'Cuenta T3 · pago tarjeta registrado' },
      ]} />

      <SecTitle label="💬 MENSAJES AL EQUIPO" color={C.teal} />
      <Tabla color={C.teal} filas={[
        { v: 'cocina   T3 va a pedir postre', r: 'Chat cocina · referencia mesa T3' },
        { v: 'barra    dos gin-tonics T3',     r: 'Chat barra' },
        { v: 'jefe     T2 lleva 40 minutos',  r: 'Push al jefe de sala' },
        { v: 'Pablo    ven a T3 piden cuenta',r: 'Push directo a Pablo' },
      ]} />

      {/* No hacer */}
      <div style={{ background: C.redS, border: `1px solid ${C.red}33`, borderRadius: 8, padding: '12px 14px', marginTop: 4 }}>
        <div style={{ fontFamily: SM, fontSize: 10, fontWeight: 700, color: C.red, letterSpacing: '.06em', marginBottom: 8 }}>✗ EVITAR — frases largas o sin mesa primero</div>
        {[
          ['"Oye, ¿me pones dos cañas para la cuatro?"', '"T3 dos cañas"'],
          ['"Para la terraza uno quiero tres tintos"', '"T1 tres tintos Ribera"'],
          ['"A ver, el entrecot muy hecho para la seis"', '"S6 entrecot nota muy hecho"'],
          ['"Un tinto" (sin mesa ni variante)', '"T3 tinto Ribera"'],
        ].map(([m, b], i) => (
          <div key={i} style={{ marginBottom: i < 3 ? 8 : 0 }}>
            <div style={{ fontFamily: SN, fontSize: 12, color: C.red, textDecoration: 'line-through', marginBottom: 2 }}>{m}</div>
            <div style={{ fontFamily: SM, fontSize: 12, fontWeight: 700, color: C.green }}>→ {b}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════
   PROTOCOLO COCINA
══════════════════════════════════════════════════════════════ */
function ProtocoloCocina() {
  return (
    <div>
      <FormulaBox slots={['Nº TICKET', '[ÍTEM opcional]', 'marcha / listo']} />
      <InfoBox color={C.teal}>
        <strong>¿Por qué el número de ticket y no la mesa?</strong> En cocina no se ve el plano de sala, se ven los tickets físicos o el KDS. El número de ticket es único e inequívoco — sin confusión entre "la cuatro del salón" y "la cuatro de terraza". Más corto y más preciso.
      </InfoBox>

      <SecTitle label="✅ MARCHAR COMANDA" color={C.green} />
      <Tabla color={C.green} filas={[
        { v: '47   marcha',              r: 'Marcha TODA la comanda 47' },
        { v: 'listo 47',                 r: 'Toda la comanda 47 lista para servir' },
        { v: '47   entrecot   marcha',   r: 'Solo el entrecot del ticket 47' },
        { v: '23   paella     lista',    r: 'Solo la paella del ticket 23 lista' },
      ]} />

      <SecTitle label="⏱️ DEMORAS Y ALERTAS" color={C.amber} />
      <Tabla color={C.amber} filas={[
        { v: 'demora 47',           r: 'Avisa al camarero de la mesa del ticket 47' },
        { v: '47   sin gluten ojo', r: 'Alerta alérgeno en ticket 47' },
      ]} />

      <div style={{ background: C.redS, border: `1px solid ${C.red}33`, borderRadius: 8, padding: '12px 14px' }}>
        <div style={{ fontFamily: SM, fontSize: 10, fontWeight: 700, color: C.red, letterSpacing: '.06em', marginBottom: 8 }}>✗ EVITAR</div>
        {[
          ['"La mesa cuatro está lista"', '"listo 47"  (nº de ticket)'],
          ['"Ya está el entrecot de la seis"', '"23 entrecot marcha"'],
        ].map(([m, b], i) => (
          <div key={i} style={{ marginBottom: i < 1 ? 8 : 0 }}>
            <div style={{ fontFamily: SN, fontSize: 12, color: C.red, textDecoration: 'line-through', marginBottom: 2 }}>{m}</div>
            <div style={{ fontFamily: SM, fontSize: 12, fontWeight: 700, color: C.green }}>→ {b}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════
   PROTOCOLO JEFE DE SALA
══════════════════════════════════════════════════════════════ */
function ProtocoloJefe() {
  return (
    <div>
      <FormulaBox slots={['DESTINO', 'MENSAJE (texto libre)']} />
      <InfoBox color={C.amber}>
        <strong>Jefe de sala = solo mensajes.</strong> No toma comandas por voz. Coordina al equipo. El mensaje puede ser texto libre — no hay restricción de formato porque no se parsea como comanda.
      </InfoBox>

      <SecTitle label="📢 MENSAJES DE COORDINACIÓN" color={C.amber} />
      <Tabla color={C.amber} filas={[
        { v: 'sala    T3 pide precio del menú',    r: 'Broadcast a todos en sala' },
        { v: 'Pablo   cubre la barra 5 minutos',   r: 'Push directo a Pablo' },
        { v: 'cocina  espera para los postres',    r: 'Chat de cocina' },
        { v: 'todos   cambio de turno en diez',    r: 'Broadcast a todo el turno activo' },
        { v: 'running agua a la terraza cinco',    r: 'Push al running de esa zona' },
      ]} />

      <div style={{ background: C.redS, border: `1px solid ${C.red}33`, borderRadius: 8, padding: '12px 14px' }}>
        <div style={{ fontFamily: SM, fontSize: 10, fontWeight: 700, color: C.red, letterSpacing: '.06em', marginBottom: 8 }}>✗ EVITAR</div>
        {[
          ['"Oye cocina, espera un momento por favor"', '"cocina espera postres"'],
          ['"Pablo, ¿puedes venir a la T3 cuando puedas?"', '"Pablo ven T3"'],
        ].map(([m, b], i) => (
          <div key={i} style={{ marginBottom: i < 1 ? 8 : 0 }}>
            <div style={{ fontFamily: SN, fontSize: 12, color: C.red, textDecoration: 'line-through', marginBottom: 2 }}>{m}</div>
            <div style={{ fontFamily: SM, fontSize: 12, fontWeight: 700, color: C.green }}>→ {b}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════
   NOVEDADES
══════════════════════════════════════════════════════════════ */
function NovedadesPanel({
  novedades, cargando, session, restauranteId, onNueva, onBorrar,
}: {
  novedades: Novedad[]
  cargando: boolean
  session: Props['session']
  restauranteId: string
  onNueva: (n: Partial<Novedad>) => Promise<void>
  onBorrar: (id: string) => Promise<void>
}) {
  const [filtroRol, setFiltroRol] = useState<string>('todos')
  const [formOpen, setFormOpen] = useState(false)
  const [form, setForm] = useState({ titulo: '', descripcion: '', ejemplo_antes: '', ejemplo_despues: '', rol_afectado: 'todos' })
  const [guardando, setGuardando] = useState(false)

  const esOwner = ['owner', 'super_admin'].includes(session.rol)

  const filtradas = filtroRol === 'todos'
    ? novedades
    : novedades.filter(n => n.rol_afectado === 'todos' || n.rol_afectado === filtroRol)

  const rolColor: Record<string, string> = { camarero: C.red, cocina: C.teal, jefe: C.amber, todos: C.ink3 }
  const rolLabel: Record<string, string> = { camarero: 'Camarero', cocina: 'Cocina', jefe: 'Jefe de sala', todos: 'Todos' }

  const handleGuardar = async () => {
    if (!form.titulo.trim()) return
    setGuardando(true)
    await onNueva(form)
    setForm({ titulo: '', descripcion: '', ejemplo_antes: '', ejemplo_despues: '', rol_afectado: 'todos' })
    setFormOpen(false)
    setGuardando(false)
  }

  return (
    <div>
      {/* Filtros + botón añadir */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 6, flex: 1, flexWrap: 'wrap' }}>
          {['todos', 'camarero', 'cocina', 'jefe'].map(r => (
            <button key={r} onClick={() => setFiltroRol(r)} style={{
              padding: '5px 12px', borderRadius: 16, border: `1px solid ${filtroRol === r ? rolColor[r] : C.rule}`,
              background: filtroRol === r ? `${rolColor[r]}15` : C.bone,
              fontFamily: SN, fontSize: 12, fontWeight: 600,
              color: filtroRol === r ? rolColor[r] : C.ink4, cursor: 'pointer',
            }}>{rolLabel[r]}</button>
          ))}
        </div>
        {esOwner && (
          <button onClick={() => setFormOpen(v => !v)} style={{
            padding: '6px 14px', borderRadius: 8, border: `1px solid ${C.red}44`,
            background: formOpen ? C.redS : C.bone,
            fontFamily: SN, fontSize: 12, fontWeight: 700, color: C.red, cursor: 'pointer',
          }}>
            {formOpen ? '✕ Cancelar' : '+ Añadir novedad'}
          </button>
        )}
      </div>

      {/* Formulario nueva novedad */}
      {formOpen && esOwner && (
        <div style={{ background: C.paper2, border: `1px solid ${C.rule}`, borderRadius: 10, padding: '14px 16px', marginBottom: 16 }}>
          <div style={{ fontFamily: SM, fontSize: 9, color: C.ink3, fontWeight: 700, letterSpacing: '.08em', marginBottom: 10 }}>NUEVA NOVEDAD PARA TU EQUIPO</div>
          {[
            { key: 'titulo', label: 'Título *', ph: 'Ej: Nuevo alias para los vinos de Cádiz' },
            { key: 'descripcion', label: 'Descripción (opcional)', ph: 'Explica el cambio o la mejora...' },
            { key: 'ejemplo_antes', label: 'Antes (opcional)', ph: '"tinto de Cádiz" → no se encontraba' },
            { key: 'ejemplo_despues', label: 'Ahora (opcional)', ph: '"T3 tinto Cádiz" → Tinto Pago de Balbaína' },
          ].map(f => (
            <div key={f.key} style={{ marginBottom: 8 }}>
              <div style={{ fontFamily: SM, fontSize: 10, color: C.ink3, marginBottom: 3 }}>{f.label}</div>
              <input
                value={(form as Record<string, string>)[f.key]}
                onChange={e => setForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                placeholder={f.ph}
                style={{ width: '100%', padding: '7px 10px', borderRadius: 6, border: `1px solid ${C.rule}`, fontFamily: SN, fontSize: 13, color: C.ink, background: 'white', outline: 'none' }}
              />
            </div>
          ))}
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontFamily: SM, fontSize: 10, color: C.ink3, marginBottom: 4 }}>Afecta a</div>
            <div style={{ display: 'flex', gap: 6 }}>
              {['todos', 'camarero', 'cocina', 'jefe'].map(r => (
                <button key={r} onClick={() => setForm(prev => ({ ...prev, rol_afectado: r }))} style={{
                  padding: '4px 10px', borderRadius: 6, border: `1px solid ${form.rol_afectado === r ? rolColor[r] : C.rule}`,
                  background: form.rol_afectado === r ? `${rolColor[r]}15` : 'white',
                  fontFamily: SN, fontSize: 12, fontWeight: 600,
                  color: form.rol_afectado === r ? rolColor[r] : C.ink4, cursor: 'pointer',
                }}>{rolLabel[r]}</button>
              ))}
            </div>
          </div>
          <button onClick={handleGuardar} disabled={guardando || !form.titulo.trim()} style={{
            padding: '8px 20px', borderRadius: 8, border: 'none',
            background: form.titulo.trim() ? C.red : C.rule,
            fontFamily: SN, fontSize: 13, fontWeight: 700, color: 'white', cursor: form.titulo.trim() ? 'pointer' : 'default',
          }}>{guardando ? 'Guardando...' : 'Publicar para el equipo'}</button>
        </div>
      )}

      {/* Lista de novedades */}
      {cargando ? (
        <div style={{ textAlign: 'center', padding: 40, fontFamily: SM, fontSize: 12, color: C.ink4 }}>Cargando novedades...</div>
      ) : filtradas.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, fontFamily: SC, fontSize: 16, color: C.ink4 }}>Sin novedades para este filtro</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {filtradas.map(n => {
            const nuevo = esNuevo(n.created_at)
            const esLocal = !!n.restaurante_id
            const col = rolColor[n.rol_afectado] ?? C.ink3
            return (
              <div key={n.id} style={{
                background: nuevo ? `${col}08` : C.bone,
                border: `1px solid ${nuevo ? col + '44' : C.rule}`,
                borderRadius: 10, padding: '12px 14px',
                position: 'relative',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5, flexWrap: 'wrap' }}>
                  {nuevo && (
                    <span style={{ fontFamily: SM, fontSize: 9, fontWeight: 700, color: 'white', background: col, padding: '2px 6px', borderRadius: 4 }}>NUEVO</span>
                  )}
                  {esLocal && (
                    <span style={{ fontFamily: SM, fontSize: 9, fontWeight: 700, color: C.amber, background: C.amberS, border: `1px solid ${C.amber}44`, padding: '2px 6px', borderRadius: 4 }}>LOCAL</span>
                  )}
                  <span style={{ fontFamily: SM, fontSize: 9, color: col, background: `${col}15`, border: `1px solid ${col}33`, padding: '2px 6px', borderRadius: 4 }}>
                    {rolLabel[n.rol_afectado] ?? n.rol_afectado}
                  </span>
                  <span style={{ fontFamily: SM, fontSize: 9, color: C.ink4 }}>v{n.version}</span>
                  <span style={{ fontFamily: SM, fontSize: 9, color: C.ink4, marginLeft: 'auto' }}>{fechaCorta(n.created_at)}</span>
                </div>

                <div style={{ fontFamily: SN, fontSize: 14, fontWeight: 700, color: C.ink, marginBottom: 4 }}>{n.titulo}</div>
                {n.descripcion && <div style={{ fontFamily: SN, fontSize: 12, color: C.ink3, marginBottom: n.ejemplo_antes || n.ejemplo_despues ? 8 : 0, lineHeight: 1.5 }}>{n.descripcion}</div>}

                {(n.ejemplo_antes || n.ejemplo_despues) && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 6 }}>
                    {n.ejemplo_antes && (
                      <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
                        <span style={{ fontFamily: SM, fontSize: 9, color: C.red, fontWeight: 700, flexShrink: 0 }}>ANTES</span>
                        <span style={{ fontFamily: SM, fontSize: 11, color: C.red, textDecoration: 'line-through' }}>{n.ejemplo_antes}</span>
                      </div>
                    )}
                    {n.ejemplo_despues && (
                      <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
                        <span style={{ fontFamily: SM, fontSize: 9, color: C.green, fontWeight: 700, flexShrink: 0 }}>AHORA</span>
                        <span style={{ fontFamily: SM, fontSize: 11, color: C.green, fontWeight: 700 }}>{n.ejemplo_despues}</span>
                      </div>
                    )}
                  </div>
                )}

                {esLocal && esOwner && (
                  <button onClick={() => onBorrar(n.id)} style={{
                    position: 'absolute', top: 10, right: 10,
                    background: 'none', border: 'none', cursor: 'pointer',
                    fontFamily: SM, fontSize: 10, color: C.ink4, padding: '2px 6px',
                  }}>✕</button>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════
   COMPONENTE PRINCIPAL
══════════════════════════════════════════════════════════════ */
export default function ManualVozTab({ restauranteId, session }: Props) {
  const ses = typeof window !== 'undefined' ? localStorage.getItem('ia_rest_session') ?? '' : ''

  const [mainTab, setMainTab]     = useState<'chuleta' | 'protocolo' | 'novedades' | 'sugerencias'>('chuleta')
  const [rolTab, setRolTab]       = useState<'camarero' | 'cocina' | 'jefe'>('camarero')
  const [novedades, setNovedades] = useState<Novedad[]>([])
  const [cargando, setCargando]   = useState(false)

  // Sugerencias
  const [sugerencia, setSugerencia] = useState('')
  const [enviando, setEnviando]     = useState(false)
  const [enviado, setEnviado]       = useState(false)

  const cargarNovedades = useCallback(async () => {
    setCargando(true)
    try {
      const r = await fetch('/api/owner/manual-voz', { headers: { 'x-ia-session': ses } })
      if (!r.ok) return
      const d = await r.json()
      setNovedades(d.novedades ?? [])
    } finally {
      setCargando(false)
    }
  }, [ses])

  useEffect(() => { cargarNovedades() }, [cargarNovedades])

  // Cuántos son nuevos (< 7 días)
  const nuevosCount = novedades.filter(n => esNuevo(n.created_at)).length

  const handleNuevaNovedad = async (form: Partial<Novedad>) => {
    await fetch('/api/owner/manual-voz', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-ia-session': ses },
      body: JSON.stringify(form),
    })
    await cargarNovedades()
  }

  const handleBorrarNovedad = async (id: string) => {
    await fetch('/api/owner/manual-voz', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', 'x-ia-session': ses },
      body: JSON.stringify({ id }),
    })
    await cargarNovedades()
  }

  const handleEnviarSugerencia = async () => {
    if (!sugerencia.trim()) return
    setEnviando(true)
    try {
      await fetch('/api/sugerencias', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-ia-session': ses },
        body: JSON.stringify({ texto: `[Manual de voz] ${sugerencia.trim()}`, origen: 'manual_voz' }),
      })
      setEnviado(true)
      setSugerencia('')
      setTimeout(() => setEnviado(false), 4000)
    } finally {
      setEnviando(false)
    }
  }

  const rolColor: Record<string, string> = { camarero: C.red, cocina: C.teal, jefe: C.amber }

  return (
    <div style={{ fontFamily: SN, maxWidth: 700 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <div>
          <div style={{ fontFamily: SE, fontStyle: 'italic', fontSize: 20, color: C.red, letterSpacing: '-.3px' }}>Protocolo de Voz</div>
          <div style={{ fontFamily: SM, fontSize: 10, color: C.ink4, letterSpacing: '.08em', marginTop: 1 }}>MANUAL DEL EQUIPO · ia.rest v2.0</div>
        </div>
        <div style={{ fontFamily: SM, fontSize: 10, color: C.ink3, textAlign: 'right', lineHeight: 1.7 }}>
          {nuevosCount > 0 && (
            <span style={{ background: C.red, color: 'white', fontWeight: 700, padding: '2px 8px', borderRadius: 10, marginRight: 6, fontSize: 9 }}>
              {nuevosCount} nuevo{nuevosCount > 1 ? 's' : ''}
            </span>
          )}
          Mayo 2026
        </div>
      </div>

      {/* Tabs principales */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16, borderBottom: `1px solid ${C.rule}`, paddingBottom: 0 }}>
        {([
          { id: 'chuleta',     label: '⚡ Chuleta Voz' },
          { id: 'protocolo',   label: '📋 Protocolo' },
          { id: 'novedades',   label: `🔔 Novedades${nuevosCount > 0 ? ` (${nuevosCount})` : ''}` },
          { id: 'sugerencias', label: '💡 Sugerencias' },
        ] as const).map(t => (
          <button key={t.id} onClick={() => setMainTab(t.id)} style={{
            padding: '8px 14px', border: `1px solid ${mainTab === t.id ? C.red : C.rule}`,
            borderBottom: mainTab === t.id ? `1px solid ${C.paper}` : `1px solid ${C.rule}`,
            borderRadius: '6px 6px 0 0',
            background: mainTab === t.id ? C.paper : C.paper2,
            fontFamily: SN, fontSize: 12, fontWeight: 700,
            color: mainTab === t.id ? C.red : C.ink4, cursor: 'pointer',
            marginBottom: '-1px',
          }}>{t.label}</button>
        ))}
      </div>

      {/* ── PROTOCOLO ── */}
      {mainTab === 'chuleta' && (
        <ChuleteVoz rol="owner" />
      )}

      {mainTab === 'protocolo' && (
        <div>
          {/* Selector de rol */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
            {(['camarero', 'cocina', 'jefe'] as const).map(r => {
              const col = rolColor[r]
              const label = r === 'jefe' ? '📋 Jefe de sala' : r === 'cocina' ? '👨‍🍳 Cocina / KDS' : '🧑‍🍳 Camarero'
              return (
                <button key={r} onClick={() => setRolTab(r)} style={{
                  flex: 1, padding: '9px 8px', border: `1px solid ${rolTab === r ? col : C.rule}`,
                  borderRadius: 8, background: rolTab === r ? `${col}12` : C.bone,
                  fontFamily: SN, fontSize: 12, fontWeight: 700,
                  color: rolTab === r ? col : C.ink4, cursor: 'pointer', transition: 'all .15s',
                }}>{label}</button>
              )
            })}
          </div>

          {/* Intro del rol */}
          <div style={{
            background: `${rolColor[rolTab]}12`, border: `1px solid ${rolColor[rolTab]}44`,
            borderRadius: 8, padding: '10px 14px', marginBottom: 16,
          }}>
            <div style={{ fontFamily: SM, fontSize: 9, color: rolColor[rolTab], fontWeight: 700, letterSpacing: '.08em', marginBottom: 3 }}>
              REGLA MAESTRA — {rolTab === 'camarero' ? 'CAMARERO' : rolTab === 'cocina' ? 'COCINA / KDS' : 'JEFE DE SALA'}
            </div>
            <div style={{ fontFamily: SM, fontSize: 13, fontWeight: 700, color: C.ink }}>
              {rolTab === 'camarero' && 'DESTINO · CONTENIDO · [MODIFICADOR]'}
              {rolTab === 'cocina'   && 'Nº TICKET · [ÍTEM] · ACCIÓN'}
              {rolTab === 'jefe'     && 'DESTINO · MENSAJE (texto libre)'}
            </div>
            <div style={{ fontSize: 12, color: C.ink3, marginTop: 4 }}>
              {rolTab === 'camarero' && 'La primera palabra identifica siempre el destinatario. El BRAIN tolera variaciones de orden.'}
              {rolTab === 'cocina'   && 'El número de ticket identifica la comanda. Sin confusión entre zonas.'}
              {rolTab === 'jefe'     && 'Solo mensajes de coordinación. Sin ítems ni formatos de comanda.'}
            </div>
          </div>

          {rolTab === 'camarero' && <ProtocoloCamarero />}
          {rolTab === 'cocina'   && <ProtocoloCocina />}
          {rolTab === 'jefe'     && <ProtocoloJefe />}
        </div>
      )}

      {/* ── NOVEDADES ── */}
      {mainTab === 'novedades' && (
        <NovedadesPanel
          novedades={novedades}
          cargando={cargando}
          session={session}
          restauranteId={restauranteId}
          onNueva={handleNuevaNovedad}
          onBorrar={handleBorrarNovedad}
        />
      )}

      {/* ── SUGERENCIAS ── */}
      {mainTab === 'sugerencias' && (
        <div>
          <div style={{ background: C.tealS, border: `1px solid ${C.teal}44`, borderRadius: 8, padding: '10px 14px', marginBottom: 16 }}>
            <div style={{ fontFamily: SM, fontSize: 9, color: C.teal, fontWeight: 700, letterSpacing: '.08em', marginBottom: 3 }}>¿CÓMO FUNCIONA?</div>
            <div style={{ fontSize: 12, color: C.ink3, lineHeight: 1.6 }}>
              Las sugerencias que envíes desde aquí llegan directamente a ia.rest para mejorar el protocolo de voz, el BRAIN o cualquier otro aspecto del sistema. Cuantas más sugerencias recibamos, más rápido mejora para todos los locales.
            </div>
          </div>

          {/* Ideas precargadas */}
          <div style={{ fontFamily: SM, fontSize: 10, color: C.ink3, fontWeight: 700, letterSpacing: '.06em', marginBottom: 8 }}>IDEAS FRECUENTES — toca para seleccionar</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
            {[
              'El BRAIN no reconoce bien los vinos de mi carta',
              'Necesito un alias nuevo para un producto',
              'Una frase del protocolo no funciona como debería',
              'Propongo añadir un nuevo comando de voz',
              'El protocolo de cocina necesita más ejemplos',
              'Sugerencia para simplificar un paso del flujo',
            ].map(s => (
              <button key={s} onClick={() => setSugerencia(s)} style={{
                textAlign: 'left', padding: '8px 12px', borderRadius: 8,
                border: `1px solid ${sugerencia === s ? C.teal : C.rule}`,
                background: sugerencia === s ? C.tealS : C.bone,
                fontFamily: SN, fontSize: 13, color: sugerencia === s ? C.teal : C.ink3,
                cursor: 'pointer', fontWeight: sugerencia === s ? 600 : 400,
              }}>{s}</button>
            ))}
          </div>

          {/* Textarea */}
          <div style={{ fontFamily: SM, fontSize: 10, color: C.ink3, fontWeight: 700, letterSpacing: '.06em', marginBottom: 6 }}>TU SUGERENCIA</div>
          <textarea
            value={sugerencia}
            onChange={e => setSugerencia(e.target.value)}
            placeholder="Describe la mejora, el problema o el comando que echas en falta..."
            rows={4}
            style={{
              width: '100%', padding: '10px 12px', borderRadius: 8,
              border: `1px solid ${C.rule}`, fontFamily: SN, fontSize: 13,
              color: C.ink, background: C.bone, outline: 'none', resize: 'vertical',
              marginBottom: 10,
            }}
          />

          {enviado ? (
            <div style={{ background: C.greenS, border: `1px solid ${C.green}44`, borderRadius: 8, padding: '10px 14px', fontFamily: SN, fontSize: 13, color: C.green, fontWeight: 700 }}>
              ✓ Sugerencia enviada — gracias, la revisamos pronto
            </div>
          ) : (
            <button onClick={handleEnviarSugerencia} disabled={enviando || !sugerencia.trim()} style={{
              padding: '10px 24px', borderRadius: 8, border: 'none',
              background: sugerencia.trim() ? C.teal : C.rule,
              fontFamily: SN, fontSize: 13, fontWeight: 700, color: 'white',
              cursor: sugerencia.trim() ? 'pointer' : 'default',
            }}>{enviando ? 'Enviando...' : 'Enviar sugerencia'}</button>
          )}
        </div>
      )}
    </div>
  )
}
