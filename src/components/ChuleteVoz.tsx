'use client'
// src/components/ChuleteVoz.tsx
// Chuleta Voz — guía rápida de comandos de voz por rol
// Como una chuleta de examen: pequeño, rápido, lo esencial.

import React from 'react'
import { C, SE, SN, SM } from '@/lib/colors'

type Rol = 'owner' | 'camarero' | 'running' | 'cocina'

interface Props { rol: Rol }

const AMBER  = '#E8A33B'
const BLUE   = '#2B6A9E'
const TEAL   = '#2B6A6E'
const RED    = '#D9442B'
const GRAY   = '#8D8270'

const AMBERS  = 'rgba(232,163,59,.12)'
const BLUES   = 'rgba(43,106,158,.12)'
const TEALS   = 'rgba(43,106,110,.12)'
const REDS    = 'rgba(217,66,43,.12)'
const GRAYS   = 'rgba(141,130,112,.10)'

function Badge({ color, bg, label }: { color: string; bg: string; label: string }) {
  return (
    <span style={{ fontFamily: SM, fontSize: 10, fontWeight: 700, color, background: bg,
      padding: '2px 8px', borderRadius: 20, letterSpacing: '.4px', flexShrink: 0 }}>
      {label}
    </span>
  )
}

function Block({ color, bg, badge, sub, children }: {
  color: string; bg: string; badge: string; sub: string; children: React.ReactNode
}) {
  return (
    <div style={{ background: C.bg1, border: `0.5px solid ${C.rule}`, borderRadius: 10, overflow: 'hidden', marginBottom: 8 }}>
      <div style={{ padding: '9px 13px', borderBottom: `0.5px solid ${C.rule}`,
        display: 'flex', alignItems: 'center', gap: 9 }}>
        <Badge color={color} bg={bg} label={badge} />
        <span style={{ fontFamily: SN, fontSize: 12, fontWeight: 500, color: C.ink3 }}>{sub}</span>
      </div>
      <div style={{ padding: '8px 13px', display: 'flex', flexDirection: 'column', gap: 7 }}>
        {children}
      </div>
    </div>
  )
}

function Row({ pattern, examples }: { pattern: string; examples: string[] }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <div style={{ fontFamily: 'JetBrains Mono, Courier New, monospace', fontSize: 11,
        color: C.ink3, background: C.bg2, padding: '4px 8px', borderRadius: 5 }}>
        {pattern}
      </div>
      {examples.map((ex, i) => (
        <div key={i} style={{ fontFamily: SN, fontSize: 11, color: C.ink4, paddingLeft: 2 }}>
          <em style={{ fontStyle: 'normal', color: C.ink2, fontWeight: 500 }}>{`"${ex}"`}</em>
        </div>
      ))}
    </div>
  )
}

function Sep() {
  return <div style={{ height: 0.5, background: C.rule, margin: '1px 0' }} />
}

function Tip({ color, text }: { color: string; text: string }) {
  return (
    <div style={{ fontFamily: SN, fontSize: 10, color: C.ink4, padding: '6px 13px',
      borderTop: `0.5px solid ${C.rule}` }}>
      <span style={{ color }}>⟵</span> {text}
    </div>
  )
}

function ReglaDeOro() {
  return (
    <div style={{ background: C.bg1, border: `0.5px solid ${C.rule}`, borderRadius: 10, overflow: 'hidden', marginBottom: 8 }}>
      <div style={{ padding: '9px 13px', borderBottom: `0.5px solid ${C.rule}`,
        display: 'flex', alignItems: 'center', gap: 9 }}>
        <Badge color={GRAY} bg={GRAYS} label="REGLA DE ORO" />
        <span style={{ fontFamily: SN, fontSize: 12, fontWeight: 500, color: C.ink3 }}>
          una acción · una mesa · un pulso
        </span>
      </div>
      <div style={{ padding: '10px 13px' }}>
        <div style={{ fontFamily: SN, fontSize: 12, color: C.ink2, marginBottom: 4 }}>
          Cada pulso de voz = una sola acción para una sola mesa.
        </div>
        <div style={{ fontFamily: SN, fontSize: 11, color: C.ink4 }}>
          Dos mesas → dos pulsos. Más rápido y sin errores.
        </div>
      </div>
      <div style={{ fontFamily: SN, fontSize: 10, color: RED, padding: '6px 13px',
        borderTop: `0.5px solid ${C.rule}`, fontWeight: 500 }}>
        No se admite mezclar mesas en un mismo mensaje de voz
      </div>
    </div>
  )
}

// ── Bloques por tipo ──────────────────────────────────────────────────────────

function BloqueComanda() {
  return (
    <Block color={AMBER} bg={AMBERS} badge="COMANDA" sub="lo que pide la mesa">
      <Row pattern="[cantidad] [producto] [mesa]"
        examples={['dos croquetas S1', 'tres cañas y una ensalada T4']} />
      <Sep />
      <Row pattern="[cantidad] [formato] [producto] [mesa]"
        examples={['una tapa de jamón B2', 'media de croquetas S3']} />
      <Sep />
      <Row pattern="... nota [texto]"
        examples={['dos cañas S1 nota sin gluten']} />
      <Tip color={AMBER} text="mesa siempre al final · prefijo directo S1 T4 B2 = menos errores" />
    </Block>
  )
}

function BloqueMarchar() {
  return (
    <Block color={TEAL} bg={TEALS} badge="MARCHAR" sub="sacar ya a la mesa">
      <Row pattern="marcha [mesa]"
        examples={['marcha S1', 'mesa T4 lista']} />
      <Sep />
      <Row pattern="marcha [producto] [mesa]"
        examples={['marcha las croquetas S1', 'pasa el entrecot T4']} />
      <Tip color={TEAL} text="por producto → item tachado en KDS automáticamente" />
    </Block>
  )
}

function BloqueMensaje() {
  return (
    <Block color={BLUE} bg={BLUES} badge="MENSAJE" sub="avisa a un compañero o sección">
      <Row pattern="[nombre], [texto]"
        examples={['Pablo, T4 esperando el segundo']} />
      <Sep />
      <Row pattern="[sección], [texto]"
        examples={['cocina caliente, S1 tiene prisa', 'barra uno, T4 quiere agua']} />
      <Sep />
      <Row pattern="mensaje a [destino], [texto]"
        examples={['mensaje a cocina, S1 tiene prisa', 'avisa a todos, vamos a cerrar']} />
      <Tip color={BLUE} text="nombre = privado · sección = partida (imprime si tiene impresora)" />
    </Block>
  )
}

function Bloque86() {
  return (
    <Block color={RED} bg={REDS} badge="86" sub="producto agotado">
      <Row pattern="86 [producto]"
        examples={['86 croquetas', 'agotado el entrecot']} />
    </Block>
  )
}

// ── Componente principal ──────────────────────────────────────────────────────

export default function ChuleteVoz({ rol }: Props) {
  const titulo = {
    owner:    'Chuleta Voz — visión completa',
    camarero: 'Chuleta Voz',
    running:  'Chuleta Voz — running',
    cocina:   'Chuleta Voz — cocina',
  }[rol]

  return (
    <div style={{ padding: '14px 14px 6px' }}>
      <div style={{ fontFamily: SE, fontStyle: 'italic', fontSize: 16,
        color: C.ink, marginBottom: 14, letterSpacing: '-.2px' }}>
        {titulo}
      </div>

      {/* OWNER: todo */}
      {rol === 'owner' && (<>
        <BloqueComanda />
        <BloqueMensaje />
        <BloqueMarchar />
        <Bloque86 />
        <ReglaDeOro />
      </>)}

      {/* CAMARERO: comanda + mensaje + marchar + 86 + regla */}
      {rol === 'camarero' && (<>
        <BloqueComanda />
        <BloqueMensaje />
        <BloqueMarchar />
        <Bloque86 />
        <ReglaDeOro />
      </>)}

      {/* RUNNING: marchar + mensaje + regla */}
      {rol === 'running' && (<>
        <BloqueMarchar />
        <BloqueMensaje />
        <ReglaDeOro />
      </>)}

      {/* COCINA: mensaje + regla */}
      {rol === 'cocina' && (<>
        <BloqueMensaje />
        <ReglaDeOro />
      </>)}

      <div style={{ fontFamily: SN, fontSize: 10, color: C.ink4,
        textAlign: 'center', paddingBottom: 8 }}>
        ia.rest · chuleta voz
      </div>
    </div>
  )
}
