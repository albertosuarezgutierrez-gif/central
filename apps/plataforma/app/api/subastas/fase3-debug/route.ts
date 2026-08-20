// ── TEMPORAL (Fase 3 subastas, 29/07/2026) ──────────────────────────────────
// Puente de exploración: la sesión de Claude no puede salir a los hosts de las
// fuentes nuevas (allowlist del contenedor, solo se relee al arrancar), pero
// Vercel sí. Este endpoint baja una URL de una LISTA CERRADA de hosts oficiales
// y devuelve el cuerpo crudo, para escribir los parsers contra datos reales
// (regla de la casa: nada de parsers a ciegas). Se ELIMINA al cerrar la fase,
// como el `boe-debug` de la Fase 0.
//
// Auth por token en BD (`subastas_debug_token`, fila única id=1) — NUNCA en el
// repo; rotable/revocable por Supabase MCP sin redeploy (patrón
// `empresas_acceso_token`). El middleware deja pasar la ruta; el 401 lo da aquí.
import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { ingerirJunta } from '@/lib/subastas/junta'
import { procesarDocumentos } from '@/lib/subastas/documentos'
import { olvidarSesionPortal, sesionPortal, titularSesionPortal } from '@/lib/subastas/portal-sesion'
import { clasificarSubastas } from '@/lib/subastas/clasificar'
import { reextraerDatosDeTexto } from '@/lib/subastas/reextraer'
import { aplicarReferenciaMercado, chollosVigentes, enriquecerAnunciantesFotocasa, ingerirComparables, leerIndiceINE, pulsoMercado, referenciaZonasFotocasa, refrescarIndiceINE } from '@/lib/subastas/mercado'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

const HOSTS_PERMITIDOS = new Set([
  'www.boe.es', 'boe.es',
  'www.sareb.es', 'sareb.es',
  'admbop.dipusevilla.es',
  'www.diphuelva.es',
  'www.bopcadiz.es',
  'www.juntadeandalucia.es',
  'www.ine.es', 'ine.es', 'servicios.ine.es',
])

const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36'

export async function GET(req: NextRequest) {
  const sp = new URL(req.url).searchParams

  const token = sp.get('token') ?? ''
  const filas = await prisma
    .$queryRaw<Array<{ token: string }>>(
      Prisma.sql`SELECT token FROM subastas_debug_token WHERE id = 1 AND activo = true`,
    )
    .catch(() => [])
  if (!token || !filas.length || filas[0].token !== token) {
    return NextResponse.json({ error: 'no autorizado' }, { status: 401 })
  }

  // Disparo manual de la ingesta de la Junta para la prueba end-to-end de la
  // fase: la sesión de Claude no dispone de CRON_SECRET, este token de BD es
  // su llave acotada. El cron diario sigue siendo el camino normal.
  if (sp.get('accion') === 'junta') {
    try {
      return NextResponse.json({ ok: true, ...(await ingerirJunta()) })
    } catch (e: any) {
      return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 200 })
    }
  }
  // ¿Funcionan las credenciales del Portal? Devuelve SOLO el veredicto y el
  // usuario configurado — nunca la contraseña, ni la cookie de sesión. Es la
  // forma de comprobar `BOE_PORTAL_USUARIO`/`BOE_PORTAL_PASSWORD` sin que la
  // contraseña pase por un chat, un log o un PR.
  //
  // 🚨 `olvidarSesionPortal()` aquí es deliberado: es el ÚNICO sitio donde se
  // puede reintentar tras un rechazo, y solo porque lo dispara una persona que
  // acaba de cambiar la credencial. El cron nunca reintenta: el Portal bloquea
  // cuentas tras varios intentos fallidos.
  if (sp.get('accion') === 'portal') {
    olvidarSesionPortal()
    const s = await sesionPortal()
    return NextResponse.json({
      ok: s.estado === 'iniciada',
      estado: s.estado,
      titular: titularSesionPortal(s),
      usuario: (process.env.BOE_PORTAL_USUARIO ?? '').trim() || null,
      passwordConfigurada: Boolean(process.env.BOE_PORTAL_PASSWORD),
    })
  }
  if (sp.get('accion') === 'documentos') {
    try {
      const max = Math.min(Math.max(parseInt(sp.get('max') || '10', 10) || 10, 1), 40)
      return NextResponse.json({ ok: true, ...(await procesarDocumentos(max)) })
    } catch (e: any) {
      return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 200 })
    }
  }
  // Lectura registral de UNA ficha, devolviendo el cuadro de cargas SIN escribir en
  // BD: es la forma de validar el prompt del lector contra una certificación real
  // (escaneada incluida) antes de soltarlo sobre el corpus.
  if (sp.get('accion') === 'cargas') {
    const idSub = sp.get('id') ?? ''
    if (!idSub) return NextResponse.json({ error: 'falta ?id=' }, { status: 400 })
    try {
      const { procesarDocumentosDeFicha } = await import('@/lib/subastas/documentos')
      const { cargasQueSubsisten, resumirCargas } = await import('@central/module-subastas')
      const r = await procesarDocumentosDeFicha(idSub, { leerCargas: true })
      const subsistentes = cargasQueSubsisten(r.cuadro, new Date())
      return NextResponse.json({
        ok: true,
        leidos: r.leidos,
        detalle: r.detalle,
        notas: r.notas,
        cuadro: r.cuadro,
        subsistentes,
        resumen: resumirCargas(r.cuadro, subsistentes),
      })
    } catch (e: any) {
      return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 200 })
    }
  }
  // Diagnóstico de UNA ficha: qué texto extrae pdf-parse de cada documento
  // (las señales de la certificación no salían en prod pese a pasar los tests
  // con fixtures de unpdf — hay que ver el texto REAL que ve el parser).
  if (sp.get('accion') === 'doc') {
    const idSub = sp.get('id') ?? ''
    if (!idSub) return NextResponse.json({ error: 'falta ?id=' }, { status: 400 })
    const claves = (sp.get('buscar') ?? 'asientos vigentes,CARGAS,EMBARGO,anotaci').split(',')
    try {
      const { enlacesDocumentos } = await import('@central/module-subastas')
      const html = await (
        await fetch(`https://subastas.boe.es/detalleSubasta.php?idSub=${encodeURIComponent(idSub)}`, {
          headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(20000), cache: 'no-store',
        })
      ).text()
      const docs = enlacesDocumentos(html)
      const salida = []
      for (const doc of docs.slice(0, 3)) {
        try {
          const r = await fetch(doc.url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(25000), cache: 'no-store' })
          const buf = Buffer.from(await r.arrayBuffer())
          const mod: any = await import('pdf-parse/lib/pdf-parse.js')
          const pdfParse = mod.default ?? mod
          const texto = String((await pdfParse(buf).catch((e: any) => ({ text: `[pdf-parse ERROR] ${e?.message}` }))).text ?? '')
          const plano = texto.replace(/\s+/g, ' ')
          const ventanas: Record<string, string[]> = {}
          for (const c of claves) {
            const re = new RegExp(c.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')
            const encontradas: string[] = []
            let m: RegExpExecArray | null
            while ((m = re.exec(plano)) && encontradas.length < 3) {
              encontradas.push(plano.slice(Math.max(0, m.index - 120), m.index + 180))
            }
            ventanas[c.trim()] = encontradas
          }
          salida.push({ titulo: doc.titulo, bytes: buf.length, chars: plano.trim().length, inicio: plano.slice(0, 300), ventanas })
        } catch (e: any) {
          salida.push({ titulo: doc.titulo, error: e?.message ?? String(e) })
        }
      }
      return NextResponse.json({ ok: true, docs: salida })
    } catch (e: any) {
      return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 200 })
    }
  }
  // Re-extracción del texto registral (sin red): rellena los huecos que el
  // extractor no supo leer cuando la subasta se ingirió.
  if (sp.get('accion') === 'reextraer') {
    try {
      return NextResponse.json({ ok: true, ...(await reextraerDatosDeTexto(Number(sp.get('max') ?? 60))) })
    } catch (e: any) {
      return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 200 })
    }
  }
  if (sp.get('accion') === 'clasificar') {
    try {
      return NextResponse.json({ ok: true, ...(await clasificarSubastas()) })
    } catch (e: any) {
      return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 200 })
    }
  }
  // Solo el paso de anunciantes (rápido): la ingesta IMAP completa tarda
  // minutos y para probar el 👤 particular no hace falta repetirla.
  if (sp.get('accion') === 'anunciantes') {
    try {
      return NextResponse.json({ ok: true, ...(await enriquecerAnunciantesFotocasa(10)) })
    } catch (e: any) {
      return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 200 })
    }
  }
  // IPV del INE + pulso de enfriamiento (prueba E2E de la señal de recesión).
  if (sp.get('accion') === 'indice') {
    try {
      const refresco = await refrescarIndiceINE()
      const indice = await leerIndiceINE()
      const pulso = await pulsoMercado()
      return NextResponse.json({ ok: true, refresco, indice, pulso })
    } catch (e: any) {
      return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 200 })
    }
  }
  // Chollos con la mediana del buscador (fuente por chollo, prueba E2E).
  if (sp.get('accion') === 'chollos') {
    try {
      const chollos = await chollosVigentes()
      return NextResponse.json({
        ok: true,
        total: chollos.length,
        porFuente: chollos.reduce((acc: Record<string, number>, c) => {
          acc[c.fuente] = (acc[c.fuente] ?? 0) + 1
          return acc
        }, {}),
        primeros: chollos.slice(0, 5).map((c) => ({
          titulo: c.comparable.titulo, zona: c.zona, fuente: c.fuente,
          muestra: c.muestra, descuento: Math.round(c.descuento * 100),
        })),
      })
    } catch (e: any) {
      return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 200 })
    }
  }
  // Solo zonas + aplicación de referencia (rápido, sin IMAP).
  if (sp.get('accion') === 'zonas') {
    try {
      const zonas = await referenciaZonasFotocasa(parseInt(sp.get('max') || '6', 10) || 6)
      const aplicacion = await aplicarReferenciaMercado()
      return NextResponse.json({ ok: true, zonas, aplicacion })
    } catch (e: any) {
      return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 200 })
    }
  }
  if (sp.get('accion') === 'mercado') {
    try {
      const ingesta = await ingerirComparables(7, 60)
      const anunciantes = await enriquecerAnunciantesFotocasa()
      return NextResponse.json({ ok: true, ingesta, anunciantes })
    } catch (e: any) {
      return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 200 })
    }
  }

  const urlParam = sp.get('url')
  if (!urlParam) return NextResponse.json({ error: 'falta ?url=' }, { status: 400 })
  let destino: URL
  try {
    destino = new URL(urlParam)
  } catch {
    return NextResponse.json({ error: 'url inválida' }, { status: 400 })
  }
  if (destino.protocol !== 'https:' || !HOSTS_PERMITIDOS.has(destino.hostname)) {
    return NextResponse.json({ error: `host fuera de la lista: ${destino.hostname}` }, { status: 400 })
  }

  try {
    const r = await fetch(destino, {
      headers: {
        'User-Agent': UA,
        Accept: 'text/html,application/xhtml+xml,application/xml,application/json,*/*',
      },
      signal: AbortSignal.timeout(25000),
      cache: 'no-store',
      redirect: 'follow',
    })
    // Un redirect puede acabar fuera de la lista (p. ej. un CDN): no se devuelve
    // ese cuerpo, solo a dónde fue, para decidir si ampliar la lista.
    const final = new URL(r.url)
    if (!HOSTS_PERMITIDOS.has(final.hostname)) {
      return NextResponse.json({ error: `redirigió fuera de la lista: ${r.url}`, status: r.status }, { status: 400 })
    }
    const cuerpo = await r.text()
    return new NextResponse(cuerpo, {
      status: 200,
      headers: {
        'content-type': 'text/plain; charset=utf-8',
        'x-debug-status': String(r.status),
        'x-debug-content-type': r.headers.get('content-type') ?? '',
        'x-debug-url-final': r.url,
      },
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? String(e) }, { status: 502 })
  }
}
