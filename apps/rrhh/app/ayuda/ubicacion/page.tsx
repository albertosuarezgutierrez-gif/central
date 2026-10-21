import type { Metadata } from 'next'
import GuiaUbicacion from './GuiaUbicacion'

const TITULO = 'Cómo activar la ubicación para fichar'
const DESCRIPCION = 'Guía paso a paso para Android (Chrome) e iPhone (Safari) si el móvil no da la ubicación al fichar.'

export const metadata: Metadata = {
  title: TITULO,
  description: DESCRIPCION,
  robots: { index: false, follow: false },
  openGraph: { title: TITULO, description: DESCRIPCION, type: 'website', locale: 'es_ES' },
}

export default function Page() {
  return (
    <main className="mx-auto w-full max-w-xl px-4 py-6">
      <h1 className="text-2xl">{TITULO}</h1>
      <p className="mt-2 text-sm text-ink-2">
        Si al fichar el portal dice que no tiene tu ubicación, sigue estos pasos. Elige tu móvil y toca cada paso.
      </p>
      <GuiaUbicacion />
      <a
        href="/e"
        className="mt-6 flex min-h-[44px] w-full items-center justify-center rounded-[10px] bg-accent px-4 py-3 text-base font-semibold text-white no-underline"
      >
        Volver a fichar
      </a>
      <p className="mt-4 rounded-card border border-line bg-card p-3 text-sm text-ink-2">
        Si sigue sin funcionar, avisa a tu responsable: si tu empresa lo permite, podrás fichar sin ubicación y quedará anotado.
      </p>
    </main>
  )
}
