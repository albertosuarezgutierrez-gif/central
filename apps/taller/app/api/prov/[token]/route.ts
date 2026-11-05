// API PÚBLICA del portal del proveedor (sin sesión: autoriza el token). POST multipart:
//   accion=confirmar           → el proveedor confirma el PEDIDO (solo enlace de pedido)
//   accion=subir + archivo     → albarán (enlace de pedido) o factura (enlace de factura; cierra el enlace y se lee en segundo plano)
// Token inválido, caducado, revocado, cerrado, de otro propósito o IP bloqueada → la MISMA respuesta 404. El token nunca va a un log.
import { after, NextResponse, type NextRequest } from 'next/server'
import { RESPUESTA_ENLACE_NO_VALIDO, sinToken, validarSubida } from '@central/module-portal-proveedor'
import { conTaller, enlaceProveedorLimitado } from '@/lib/db'
import { almacenActivo } from '@/lib/almacen'
import { ipDeCabecera } from '@/lib/ip'
import { confirmarPedidoProveedor, enlaceLlenoDeDocumentos, enlaceVigente, politicaPortal, procesarFactura, registrarDocumentoProveedor, MAX_MB_PLATAFORMA, type TxPortal } from '@/lib/portal-proveedor'
import { extractorFacturaIa } from '@/lib/extractor-factura'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const noValido = () => NextResponse.json({ ok: false, mensaje: RESPUESTA_ENLACE_NO_VALIDO.mensaje }, { status: RESPUESTA_ENLACE_NO_VALIDO.status })
const malo = (mensaje: string, status = 400) => NextResponse.json({ ok: false, mensaje }, { status })
const tx = (t: unknown) => t as unknown as TxPortal

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const ip = ipDeCabecera(req.headers.get('x-forwarded-for'))
  const ahora = new Date()
  // Cuerpo más grande de lo que nunca se admite → fuera antes de leerlo.
  const largo = Number(req.headers.get('content-length') ?? 0)
  if (largo > (MAX_MB_PLATAFORMA + 1) * 1024 * 1024) return malo('El archivo es demasiado grande', 413)
  try {
    const r = await enlaceProveedorLimitado(token, ip, ahora)
    if (!r) return noValido()
    let fd: FormData
    try { fd = await req.formData() } catch { return malo('Petición no válida') }
    const accion = fd.get('accion')

    if (accion === 'confirmar') {
      const x = await conTaller(r.tallerId, async (t) => {
        const e = await enlaceVigente(tx(t), { tallerId: r.tallerId, enlaceId: r.enlaceId, token, ahora, proposito: 'pedido' })
        return e ? confirmarPedidoProveedor(tx(t), e, ahora) : null
      })
      return x?.ok ? NextResponse.json({ ok: true }) : noValido()
    }

    if (accion !== 'subir') return malo('Acción no válida')
    const archivo = fd.get('archivo')
    if (!(archivo instanceof File)) return malo('Falta el archivo')
    const previo = await conTaller(r.tallerId, async (t) => {
      const e = await enlaceVigente(tx(t), { tallerId: r.tallerId, enlaceId: r.enlaceId, token, ahora })
      return e ? { e, pol: await politicaPortal(tx(t), r.tallerId), lleno: await enlaceLlenoDeDocumentos(tx(t), e) } : null
    })
    if (!previo) return noValido()
    // Tope de documentos ANTES de subir al bucket: un enlace lleno no gasta almacenamiento.
    if (previo.lleno) return malo('Has llegado al máximo de documentos de este enlace', 409)
    const bytes = new Uint8Array(await archivo.arrayBuffer())
    const v = validarSubida({ nombre: archivo.name, bytes }, previo.pol.subida)
    if (!v.ok) return malo(v.mensaje, v.motivo === 'demasiado_grande' ? 413 : 400)
    // Al bucket PRIVADO del taller (nunca público); la lectura posterior es por URL firmada corta y solo con sesión del taller.
    const g = await almacenActivo().guardar({ tallerId: r.tallerId, carpeta: `proveedor/${r.enlaceId}`, nombre: v.nombre, mime: v.mime, bytes })
    const reg = await conTaller(r.tallerId, async (t) => {
      const e = await enlaceVigente(tx(t), { tallerId: r.tallerId, enlaceId: r.enlaceId, token, ahora })
      if (!e) return null
      return registrarDocumentoProveedor(tx(t), e, { subida: { ruta: g.ruta, huella: g.huellaSha256, mime: v.mime, bytes: v.bytes, nombre: v.nombre }, ip, ahora })
    })
    if (!reg) return noValido()
    if (!reg.ok) return malo(reg.motivo === 'ruta' ? 'No se pudo guardar' : reg.motivo, 409)
    if (reg.tipo === 'factura' && reg.nuevo) {
      const { tallerId } = r, documentoId = reg.documentoId
      // Lectura y case en segundo plano (la IA tarda): el proveedor no espera. Si falla, queda «ilegible» y el taller lo ve.
      after(async () => {
        try {
          await procesarFactura({
            conTaller: (id, fn) => conTaller(id, (t) => fn(tx(t)), { timeout: 30_000 }),
            leer: async (id, ruta) => (await almacenActivo().leer?.(id, ruta)) ?? null,
            extractor: extractorFacturaIa,
          }, { tallerId, documentoId, ahora: new Date(), bytes })
        } catch (e) {
          console.error('[prov/factura]', sinToken(e instanceof Error ? e.message : String(e)))
        }
      })
    }
    return NextResponse.json({ ok: true, tipo: reg.tipo })
  } catch (e) {
    console.error('[prov]', sinToken(e instanceof Error ? e.message : String(e)))
    return malo('No se pudo completar. Inténtalo de nuevo', 500)
  }
}
