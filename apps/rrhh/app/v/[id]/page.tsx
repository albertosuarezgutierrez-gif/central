import { headers } from 'next/headers'
import QRCode from 'qrcode'
import Wordmark from '@/components/Wordmark'
import { verificarDocumento } from '@/lib/verificacion'
import { etiquetaMetodo } from '@/lib/firma-publica'

export const dynamic = 'force-dynamic'

const fmtFecha = (iso: string) => {
  const d = new Date(iso)
  return isNaN(d.getTime()) ? iso : d.toLocaleString('es-ES', { dateStyle: 'long', timeStyle: 'short' })
}

async function urlAbsoluta(path: string): Promise<string> {
  const h = await headers()
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'central-rrhh.vercel.app'
  const proto = h.get('x-forwarded-proto') ?? 'https'
  return `${proto}://${host}${path}`
}

export default async function VerificarPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const firma = await verificarDocumento(id)

  return (
    <main className="mx-auto grid min-h-screen max-w-[520px] place-items-center p-4">
      <div className="w-full">
        <header className="mb-4 text-center">
          <Wordmark className="text-2xl" />
          <p className="text-ink-3 mt-1 text-sm">Verificación de firma electrónica</p>
        </header>

        {!firma ? (
          <section className="rounded-card border border-line bg-card p-5 text-center">
            <p className="text-2xl">🔎</p>
            <h1 className="mt-2 text-base">Documento no encontrado</h1>
            <p className="text-ink-3 mt-1 text-sm">
              No hay ninguna firma registrada para este enlace. Comprueba que el código es correcto.
            </p>
          </section>
        ) : (
          <section className="rounded-card border border-line bg-card p-5">
            <div className="flex items-center gap-2">
              <span className="text-ok text-xl">✔</span>
              <h1 className="text-base font-semibold">Firma verificada</h1>
            </div>
            <p className="text-ink-3 mt-1 text-sm">
              Este documento tiene una firma electrónica avanzada registrada (Reglamento eIDAS, art. 26).
            </p>

            <dl className="mt-4 grid gap-2 text-sm">
              <div>
                <dt className="text-ink-3 text-xs">Documento</dt>
                <dd className="font-medium break-words">{firma.documento_nombre}</dd>
              </div>
              <div>
                <dt className="text-ink-3 text-xs">Firmado por</dt>
                <dd className="font-medium">{firma.firmante_nombre}</dd>
              </div>
              <div>
                <dt className="text-ink-3 text-xs">Fecha y hora</dt>
                <dd className="font-medium">{fmtFecha(firma.sello_tiempo)}</dd>
              </div>
              <div>
                <dt className="text-ink-3 text-xs">Método</dt>
                <dd className="font-medium">{etiquetaMetodo(firma.metodo)}</dd>
              </div>
              <div>
                <dt className="text-ink-3 text-xs">Huella del documento ({firma.algoritmo})</dt>
                <dd className="font-mono text-[11px] leading-snug break-all text-ink-2">{firma.doc_hash}</dd>
              </div>
            </dl>

            <div className="mt-5 flex flex-col items-center border-t border-line pt-4">
              <div
                className="h-[160px] w-[160px]"
                aria-label="Código QR de verificación"
                dangerouslySetInnerHTML={{
                  __html: await QRCode.toString(await urlAbsoluta(`/v/${id}`), {
                    type: 'svg',
                    margin: 1,
                    width: 160,
                    color: { dark: '#1a1a1a', light: '#ffffff' },
                  }),
                }}
              />
              <p className="text-ink-3 mt-2 text-center text-xs">
                Escanea este código para volver a esta página de verificación.
              </p>
            </div>
          </section>
        )}

        <p className="text-ink-3 mt-3 text-center text-xs">
          Verificación pública — no se muestran datos personales del firmante más allá de su nombre.
        </p>
      </div>
    </main>
  )
}
