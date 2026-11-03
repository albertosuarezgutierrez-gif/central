import type { Metadata } from 'next'
import { PieAsegura, MarcaGenerica, IconoCandado } from '@/components/MarcaAsegura'
import Card from '@/components/ui/Card'
import Boton from '@/components/ui/Boton'

const TITULO = 'Privacidad y seguridad'

export const metadata: Metadata = {
  title: TITULO,
  description: 'Cómo se protegen tus datos en el Portal del Empleado.',
  robots: { index: false, follow: false },
}

// Página PÚBLICA (sin sesión): ni el middleware ni ningún layout la protegen. Solo afirma lo verificado en el código y la BD;
// no añadir aquí RLS, auditoría, cifrado propio ni certificaciones (no son ciertos para esta app).
const PUNTOS: { titulo: string; texto: string }[] = [
  { titulo: 'Quién está detrás', texto: 'La app la contrata tu empresa. Grupo ASegura la presta gratis y trata los datos solo por encargo de tu empresa (como encargado del tratamiento). No los usa para ofrecerte seguros ni para nada comercial.' },
  { titulo: 'Tus datos de RR.HH. están separados', texto: 'El portal de seguros no tiene acceso a ellos: usa un rol de base de datos distinto, sin permiso sobre esos datos.' },
  { titulo: 'Dónde se guardan', texto: 'Los datos están alojados en la Unión Europea (Irlanda).' },
  { titulo: 'Cómo se entra', texto: 'Entras con un código de un solo uso que te llega a tu correo. La sesión va en cookies seguras (httpOnly y secure) y hay límites de intentos contra ataques de fuerza bruta.' },
  { titulo: 'Tus documentos', texto: 'Las nóminas y demás documentos están en almacenamiento privado. Solo se abren con enlaces temporales que caducan en 1 hora.' },
  { titulo: 'El botón «Seguros»', texto: 'Lleva a otra aplicación distinta y es voluntario. Lo que hagas allí no lo ve tu empresa.' },
  { titulo: 'Dudas y tus derechos', texto: 'Para cualquier duda o para ejercer tus derechos, habla con RR.HH. de tu empresa.' },
]

export default function Page() {
  return (
    <main className="mx-auto w-full max-w-xl px-4 py-6">
      <MarcaGenerica className="mb-6" />
      <div className="flex items-center gap-3">
        <span aria-hidden="true" className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-ok/15 text-ok"><IconoCandado tam={20} /></span>
        <div className="min-w-0">
          <h1 className="text-2xl">{TITULO}</h1>
          <p className="text-sm text-ink-2">Lo esencial sobre cómo se tratan tus datos en este portal.</p>
        </div>
      </div>
      <ol className="mt-5 grid list-none gap-3 p-0">
        {PUNTOS.map((p, i) => (
          <li key={p.titulo}>
            <Card as="section" className="flex gap-3">
              <span aria-hidden="true" className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-paper-2 text-xs font-bold text-ink-2">{i + 1}</span>
              <div className="min-w-0">
                <h2 className="text-base">{p.titulo}</h2>
                <p className="mt-1 text-sm text-ink-2">{p.texto}</p>
              </div>
            </Card>
          </li>
        ))}
      </ol>
      <Boton href="/" variante="secundario" ancho className="mt-6">Volver al portal</Boton>
      <PieAsegura />
    </main>
  )
}
