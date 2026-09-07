// Canario del formulario público de la correduría (`apps/asegura-web` → `/api/lead`).
//
// 🚨 Por qué existe: el 06/09/2026 ese formulario llevaba tiempo contestando «Ahora mismo no
// podemos recoger tu solicitud por la web» a TODO el que lo rellenaba —`PLATAFORMA_URL` sin
// definir en su proyecto Vercel— y no se enteró nadie. No podía enterarse: con ese 503 no se
// crea ficha, no sale Telegram y el cuerpo del formulario no se registra en ningún log (lleva
// nombre, teléfono y correo de una persona). O sea, el ÚNICO canal de venta de la correduría
// estaba muerto y desde dentro se veía exactamente igual que un día sin leads. Lo descubrió
// Alberto de casualidad, mirando la web desde su móvil.
//
// Cómo se prueba sin ensuciar la cartera: se manda un cuerpo VACÍO. Un lead válido crearía
// ficha y dispararía el aviso de lead nuevo; `{}` se queda en la validación de plataforma, que
// responde 422 nombrando el campo que falta. Ese 422 es justamente la prueba que buscamos —
// significa que el reenvío salió de la web, llegó a plataforma y plataforma lo entendió—, y no
// escribe absolutamente nada.
//
// La lectura del resultado vive en `veredictoCanarioLead`, que es pura y está testeada: es
// donde se decide qué es «roto» y qué es «no lo sé», y esa diferencia es el motivo del módulo.

/** Origen de la web pública. Env por si algún día cambia de dominio; el defecto es donde sirve hoy. */
export const WEB_PUBLICA_URL = (process.env.ASEGURA_WEB_URL || 'https://grupoasegura.es').replace(/\/+$/, '')

/** Lo que devuelve el ping, sin interpretar. `status: null` = la petición no llegó a completarse. */
export interface SondaLead {
  status: number | null
  /** `motivo` del JSON de respuesta, si lo trae. */
  motivo?: string | null
  /** `ok` del JSON de respuesta, si lo trae. */
  ok?: boolean | null
  /** Mensaje del fallo de red/timeout, cuando `status` es null. */
  error?: string
}

export type EstadoCanario = 'ok' | 'roto' | 'dudoso'

export interface VeredictoCanario {
  estado: EstadoCanario
  /** Línea lista para el aviso de Telegram (o para el JSON de la respuesta). */
  linea: string
}

/** Timeout del ping. Generoso: un arranque en frío de la web no es una avería. */
export const TIMEOUT_MS = 12_000

/**
 * Hace el ping. No interpreta nada: eso es cosa de `veredictoCanarioLead`.
 * Nunca lanza — un fallo de red es un resultado más, y uno que hay que poder contar.
 */
export async function sondearFormularioLead(base: string = WEB_PUBLICA_URL): Promise<SondaLead> {
  try {
    const res = await fetch(`${base}/api/lead`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: 'no-store',
    })
    const json = (await res.json().catch(() => null)) as { ok?: boolean; motivo?: string } | null
    return { status: res.status, motivo: json?.motivo ?? null, ok: json?.ok ?? null }
  } catch (e) {
    return { status: null, error: e instanceof Error ? e.message : String(e) }
  }
}

/**
 * Traduce la respuesta a un veredicto. PURA a propósito: es la regla del canario y se testea
 * sola, sin red.
 *
 * Tres estados, no dos (regla del repo): un timeout o un 429 NO son «la web está bien», pero
 * tampoco son «la web está rota». Colapsarlos en cualquiera de los dos lados haría al canario
 * inútil: en un lado callaría una avería, y en el otro despertaría a Alberto por un problema de
 * red del propio vigilante.
 */
export function veredictoCanarioLead(s: SondaLead): VeredictoCanario {
  if (s.status === 422) {
    // Lo que queremos ver: el reenvío llegó a plataforma y su validador contestó.
    return { estado: 'ok', linea: `✅ Formulario de la web: el lead llega a plataforma (422 «${s.motivo ?? 'validación'}»)` }
  }
  if (s.status === 503) {
    return {
      estado: 'roto',
      linea: '🔴 Formulario de la web MUERTO: contesta «no podemos recoger tu solicitud» (503). '
        + 'La web no tiene a dónde reenviar — revisa `PLATAFORMA_URL` en el proyecto Vercel `asegura-web`. '
        + 'Cada persona que lo rellene ahora mismo se pierde sin rastro.',
    }
  }
  if (s.status === 502) {
    return {
      estado: 'roto',
      linea: '🔴 Formulario de la web: el reenvío a plataforma no completa (502). El lead se pierde igual.',
    }
  }
  if (s.status === 404) {
    return {
      estado: 'roto',
      linea: '🔴 Formulario de la web: plataforma devuelve 404 — la ruta `/api/publico/correduria/lead` se ha movido o renombrado.',
    }
  }
  if (s.status === 200 || s.ok === true) {
    // Un cuerpo vacío JAMÁS debería aceptarse: si se acepta, la validación no se está aplicando
    // y lo que entra en la cartera puede ser cualquier cosa.
    return {
      estado: 'roto',
      linea: `🔴 Formulario de la web: acepta un envío VACÍO (${s.status}). La validación no se está aplicando.`,
    }
  }
  if (s.status === 429) {
    // El límite es 6/h por IP y lo choca el propio canario, no un visitante. No dice nada de la salud.
    return { estado: 'dudoso', linea: '🟠 Formulario de la web: el canario topó el límite por IP (429). Sin veredicto en esta pasada.' }
  }
  if (s.status === null) {
    return { estado: 'dudoso', linea: `🟠 Formulario de la web: el canario no pudo llegar (${s.error ?? 'sin detalle'}). Sin veredicto: NO significa que esté bien.` }
  }
  return { estado: 'dudoso', linea: `🟠 Formulario de la web: respuesta inesperada ${s.status}${s.motivo ? ` («${s.motivo}»)` : ''}. Sin veredicto.` }
}
