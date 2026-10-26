'use client'
import { useEffect, useState, type ReactNode } from 'react'
import { detectarPlataforma } from '@/lib/geolocalizacion-fichaje'

type Sistema = 'android' | 'ios'

// Pantalla de móvil simplificada; `children` se dibuja dentro (viewBox 120x200 de la pantalla).
function Movil({ children, etiqueta }: { children: ReactNode; etiqueta: string }) {
  return (
    <svg viewBox="0 0 120 200" role="img" aria-label={etiqueta} className="h-36 w-[86px] shrink-0">
      <rect x="4" y="4" width="112" height="192" rx="14" fill="var(--panel)" stroke="var(--muted)" strokeWidth="3" />
      <rect x="12" y="14" width="96" height="172" rx="6" fill="var(--bg2)" />
      {children}
    </svg>
  )
}
const Resalte = ({ x, y, w, h }: { x: number; y: number; w: number; h: number }) => (
  <rect x={x} y={y} width={w} height={h} rx="6" fill="var(--danger)" fillOpacity="0.15" stroke="var(--danger)" strokeWidth="2.5" />
)
const Linea = ({ y, w = 70 }: { y: number; w?: number }) => <rect x="20" y={y} width={w} height="7" rx="3" fill="var(--line-2)" />

function Dibujo({ id }: { id: string }) {
  switch (id) {
    case 'a1': return (
      <Movil etiqueta="Panel de ajustes rápidos con el botón Ubicación resaltado">
        <rect x="12" y="14" width="96" height="70" rx="6" fill="var(--brand-soft)" />
        <circle cx="34" cy="38" r="9" fill="var(--panel)" /><circle cx="60" cy="38" r="9" fill="var(--panel)" /><circle cx="86" cy="38" r="9" fill="var(--panel)" />
        <circle cx="34" cy="66" r="9" fill="var(--panel)" /><circle cx="60" cy="66" r="9" fill="var(--brand)" /><circle cx="86" cy="66" r="9" fill="var(--panel)" />
        <Resalte x={46} y={52} w={28} h={28} />
        <path d="M60 100 V92 M55 97 L60 91 L65 97" stroke="var(--muted)" strokeWidth="2" fill="none" />
      </Movil>)
    case 'a2': return (
      <Movil etiqueta="Chrome con el candado junto a la dirección resaltado">
        <rect x="18" y="22" width="84" height="16" rx="8" fill="var(--panel)" stroke="var(--line-2)" />
        <circle cx="30" cy="30" r="4" fill="var(--muted)" />
        <rect x="40" y="27" width="50" height="6" rx="3" fill="var(--line-2)" />
        <Resalte x={21} y={23} w={18} h={14} />
        <Linea y={52} /><Linea y={66} w={50} /><Linea y={80} w={60} />
        <rect x="20" y="104" width="80" height="14" rx="4" fill="var(--brand-soft)" /><text x="26" y="114" fontSize="8" fill="var(--brand-ink)">Ubicación: Permitir</text>
      </Movil>)
    case 'a3': return (
      <Movil etiqueta="Ajustes del móvil, Apps, Chrome, Permisos, Ubicación">
        <Linea y={26} w={60} /><Linea y={44} w={70} />
        <rect x="18" y="58" width="84" height="18" rx="4" fill="var(--brand-soft)" /><text x="24" y="70" fontSize="9" fill="var(--brand-ink)">Permisos</text>
        <Resalte x={17} y={57} w={86} h={20} />
        <Linea y={92} /><Linea y={106} w={55} />
        <text x="20" y="140" fontSize="7.5" fill="var(--ink-2)">Solo mientras</text><text x="20" y="150" fontSize="7.5" fill="var(--ink-2)">se usa</text>
        <circle cx="92" cy="142" r="6" fill="none" stroke="var(--brand)" strokeWidth="2" /><circle cx="92" cy="142" r="3" fill="var(--brand)" />
      </Movil>)
    case 'i1': return (
      <Movil etiqueta="Ajustes del iPhone, Privacidad y seguridad, Localización activada">
        <Linea y={26} w={60} />
        <rect x="18" y="42" width="84" height="18" rx="4" fill="var(--panel)" stroke="var(--line-2)" /><text x="24" y="54" fontSize="8" fill="var(--ink-2)">Privacidad y seg.</text>
        <rect x="18" y="80" width="84" height="22" rx="4" fill="var(--panel)" stroke="var(--line-2)" /><text x="24" y="94" fontSize="8" fill="var(--ink-2)">Localización</text>
        <rect x="76" y="85" width="22" height="12" rx="6" fill="var(--ok)" /><circle cx="92" cy="91" r="4.5" fill="var(--panel)" />
        <Resalte x={17} y={79} w={86} h={24} />
      </Movil>)
    case 'i2': return (
      <Movil etiqueta="Sitios web de Safari con la opción Al usar la app marcada">
        <rect x="18" y="26" width="84" height="18" rx="4" fill="var(--brand-soft)" /><text x="24" y="38" fontSize="7.5" fill="var(--brand-ink)">Sitios web de Safari</text>
        <Resalte x={17} y={25} w={86} h={20} />
        <text x="20" y="72" fontSize="8" fill="var(--muted)">Nunca</text>
        <text x="20" y="92" fontSize="8" fill="var(--muted)">Preguntar</text>
        <text x="20" y="112" fontSize="8" fill="var(--text)" fontWeight="700">Al usar la app</text>
        <path d="M88 108 l4 4 l8 -9" stroke="var(--brand)" strokeWidth="2.5" fill="none" />
        <Resalte x={17} y={100} w={86} h={16} />
      </Movil>)
    case 'i3': return (
      <Movil etiqueta="Safari con el botón aA junto a la dirección resaltado">
        <rect x="18" y="22" width="84" height="16" rx="8" fill="var(--panel)" stroke="var(--line-2)" />
        <text x="24" y="33" fontSize="9" fill="var(--ink-2)" fontWeight="700">aA</text>
        <rect x="46" y="27" width="46" height="6" rx="3" fill="var(--line-2)" />
        <Resalte x={20} y={22} w={22} h={16} />
        <rect x="20" y="104" width="80" height="14" rx="4" fill="var(--brand-soft)" /><text x="26" y="114" fontSize="8" fill="var(--brand-ink)">Ubicación: Permitir</text>
        <Linea y={52} /><Linea y={66} w={50} />
      </Movil>)
    default: return (
      <Movil etiqueta="Portal con el botón Reintentar resaltado">
        <rect x="18" y="26" width="84" height="40" rx="6" fill="var(--panel)" stroke="var(--line-2)" />
        <Linea y={34} w={60} />
        <rect x="26" y="48" width="68" height="14" rx="5" fill="var(--brand)" /><text x="44" y="58" fontSize="8" fill="var(--panel)">Reintentar</text>
        <Resalte x={23} y={45} w={74} h={20} />
      </Movil>)
  }
}

const PASOS: Record<Sistema, { id: string; titulo: string; texto: string }[]> = {
  android: [
    { id: 'a1', titulo: 'Activa la Ubicación del móvil', texto: 'Desliza el dedo desde arriba de la pantalla y toca «Ubicación» para que quede activada.' },
    { id: 'a2', titulo: 'Permite la ubicación en Chrome', texto: 'En el portal, toca el candado (o ⓘ) junto a la dirección web. Luego Permisos → Ubicación → Permitir.' },
    { id: 'a3', titulo: 'Si no te aparece', texto: 'Ve a Ajustes → Apps → Chrome → Permisos → Ubicación y elige «Permitir solo mientras se usa».' },
    { id: 'a4', titulo: 'Vuelve al portal', texto: 'Abre otra vez el portal y pulsa «Reintentar».' },
  ],
  ios: [
    { id: 'i1', titulo: 'Activa la Localización', texto: 'Ve a Ajustes → Privacidad y seguridad → Localización y comprueba que está activada.' },
    { id: 'i2', titulo: 'Permite Safari', texto: 'Dentro de Localización, entra en «Sitios web de Safari» y marca «Al usar la app».' },
    { id: 'i3', titulo: 'Permite este sitio', texto: 'En Safari, toca el botón «aA» junto a la dirección → Ajustes del sitio web → Ubicación → Permitir.' },
    { id: 'i4', titulo: 'Vuelve al portal', texto: 'Abre otra vez el portal y pulsa «Reintentar».' },
  ],
}
// El último paso de ambos usa el mismo dibujo.
const dibujoDe = (id: string) => (id === 'a4' || id === 'i4' ? 'fin' : id)

export default function GuiaUbicacion() {
  const [sistema, setSistema] = useState<Sistema>('android')
  useEffect(() => { setSistema(detectarPlataforma() === 'ios' ? 'ios' : 'android') }, [])

  return (
    <section className="mt-5">
      <div role="tablist" aria-label="Tu móvil" className="grid grid-cols-2 gap-2">
        {([['android', 'Android (Chrome)'], ['ios', 'iPhone (Safari)']] as const).map(([k, t]) => (
          <button
            key={k}
            role="tab"
            aria-selected={sistema === k}
            onClick={() => setSistema(k)}
            className={`min-h-[44px] px-2 py-3 text-sm ${sistema === k ? '' : '!bg-paper-2 !text-ink-2'}`}
          >
            {t}
          </button>
        ))}
      </div>
      <ol role="tabpanel" className="mt-4 space-y-3 p-0">
        {PASOS[sistema].map((p, i) => (
          <li key={p.id} className="flex list-none items-center gap-3 rounded-card border border-line bg-card p-3">
            <Dibujo id={dibujoDe(p.id)} />
            <div className="min-w-0">
              <p className="text-xs font-semibold text-accent">Paso {i + 1}</p>
              <h2 className="text-base">{p.titulo}</h2>
              <p className="mt-1 text-sm text-ink-2">{p.texto}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  )
}
