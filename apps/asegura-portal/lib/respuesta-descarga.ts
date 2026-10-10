/**
 * Respuestas de error de las rutas de DESCARGA (documentos de póliza, IPID, adjuntos de un parte).
 *
 * Se abren con un `<a href>`, así que quien las recibe es el NAVEGADOR, no un `fetch`: un
 * `{"error":"sin_sesion"}` se pintaba tal cual a pantalla completa (auditoría del 29/09/2026). Con
 * la sesión caducada se manda a la entrada; si el documento no está, una frase. Una petición que
 * no pide HTML (un `fetch`, un script) sigue recibiendo el JSON de siempre.
 */
import { NextResponse } from 'next/server'

function pideHtml(req: Request): boolean {
  return (req.headers.get('accept') ?? '').includes('text/html')
}

export function descargaSinSesion(req: Request, cuerpo: Record<string, string>): Response {
  if (pideHtml(req)) return NextResponse.redirect(new URL('/', req.url), 303)
  return NextResponse.json(cuerpo, { status: 401 })
}

export function descargaNoEncontrada(req: Request, cuerpo: Record<string, string>): Response {
  if (pideHtml(req)) {
    return new Response(
      '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Documento no disponible</title>' +
        '<p style="font:16px/1.5 system-ui,sans-serif;max-width:32rem;margin:15vh auto;padding:0 16px">' +
        'Este documento ya no está disponible. <a href="/boveda">Volver a Mis seguros</a> o llama a tu corredor.</p>',
      { status: 404, headers: { 'content-type': 'text/html; charset=utf-8' } },
    )
  }
  return NextResponse.json(cuerpo, { status: 404 })
}
