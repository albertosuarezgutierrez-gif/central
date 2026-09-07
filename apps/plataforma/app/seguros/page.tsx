// Landing PÚBLICA de Grupo ASegura (correduría de seguros). Fuera del grupo
// `(usuario)` → sin sidebar ni sesión (el middleware la tiene en PUBLIC). Es la
// puerta del canal de leads web: el formulario entra por
// `POST /api/publico/correduria/lead` → puerto de asegura → Telegram a Alberto.
//
// Honesta a propósito: sin cifras ni claims que no estén confirmados. La clave
// DGSFP `CS-F/0170` sale de `.claude/skills/agente-correduria/SKILL.md`.
import type { Metadata } from 'next'
import Formulario from './Formulario'

export const metadata: Metadata = {
  title: 'Grupo ASegura · Correduría de seguros',
  description: 'Correduría de seguros. Comparamos entre compañías el seguro de auto, moto, hogar, vida, salud, comunidades y comercio, y te llamamos.',
  // 🚨 FUERA DEL ÍNDICE desde el 07/09/2026, y no es una decisión de estilo.
  //
  // Esta landing nació cuando la correduría no tenía web. Desde el 05/09/2026 la
  // tiene: `apps/asegura-web`, que sirve en `grupoasegura.es` con seis páginas
  // de ramo, sitemap, JSON-LD y el MISMO endpoint de leads que esta página. O
  // sea, las dos compiten por «correduría de seguros Sevilla» — y esta lo hace
  // desde un `*.vercel.app` que no es la marca. Dos URL del mismo negocio
  // peleando por la misma consulta no suman: reparten la señal y Google elige
  // una, normalmente la que no quieres.
  //
  // `follow: true` a propósito: no queremos que se indexe, pero sí que se sigan
  // sus enlaces. Y NO se pone un `canonical` hacia grupoasegura.es además del
  // noindex: son dos señales contradictorias (una dice «ignórame», la otra
  // «cuéntame en la otra»), y Google desaconseja combinarlas.
  //
  // La página SIGUE VIVA y funcionando: quien tenga el enlace la usa y su lead
  // entra igual. Retirarla del todo (301 hacia grupoasegura.es o borrarla) es
  // decisión de Alberto, no de este cambio.
  robots: { index: false, follow: true },
}

const QUE_HACEMOS = [
  'Auto y moto, hogar, vida y salud, comunidades y comercios.',
  'Somos correduría: trabajamos con varias compañías y buscamos la póliza que encaja contigo, no la de una sola marca.',
  'Déjanos tus datos y te llamamos en horario de oficina, sin compromiso.',
]

export default function SegurosPage() {
  return (
    <main style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--text)', padding: '24px 16px 48px' }}>
      <div style={{ maxWidth: 640, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }}>
        <header style={{ paddingTop: 16 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 600, color: 'var(--primary)' }}>
            <span aria-hidden>🛡️</span> Grupo ASegura
          </div>
          <h1 style={{ fontSize: 'clamp(24px, 5vw, 34px)', lineHeight: 1.15, margin: '8px 0 6px', fontWeight: 800 }}>
            Correduría de seguros
          </h1>
          <p style={{ fontSize: 17, color: 'var(--muted)', margin: 0 }}>
            Comparamos entre compañías y te llamamos.
          </p>
        </header>

        <section
          aria-label="Qué hacemos"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)', padding: '18px 20px' }}
        >
          <ul style={{ margin: 0, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 8, fontSize: 15, lineHeight: 1.45 }}>
            {QUE_HACEMOS.map((linea) => <li key={linea}>{linea}</li>)}
          </ul>
        </section>

        <section
          aria-labelledby="pedir-presupuesto"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)', padding: '22px 20px' }}
        >
          <h2 id="pedir-presupuesto" style={{ fontSize: 20, margin: '0 0 4px' }}>Pide presupuesto</h2>
          <p style={{ color: 'var(--muted)', fontSize: 14, margin: '0 0 16px' }}>
            Con un teléfono o un email nos basta para llamarte.
          </p>
          <Formulario />
        </section>

        <footer style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.5, textAlign: 'center' }}>
          Grupo ASegura · Correduría de seguros inscrita en la DGSFP con la clave CS-F/0170.
        </footer>
      </div>
    </main>
  )
}
