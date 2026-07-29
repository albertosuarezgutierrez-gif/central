// Rutas que una RUTINA de Claude Code puede alcanzar con su token de bajo privilegio
// (`ALERTA_TOKEN`). Fuente ÚNICA, compartida por el middleware y por el guardián
// `test/regression-rutas-rutina.test.ts`.
//
// POR QUÉ EXISTE ESTE ARCHIVO (incidente 26-27/07/2026):
// La autorización de rutinas vivía SOLO en el handler (`isRoutineAuthorized`), pero el
// middleware de sesión únicamente dejaba pasar el `CRON_SECRET` maestro. Resultado: un
// endpoint podía aceptar `ALERTA_TOKEN` en su código y ser IGUALMENTE inalcanzable, porque
// el middleware lo redirigía 307 → /login antes de que el handler corriera. Le pasó a
// `/api/sivra/pricing/aplicar-propuesta` y a `/api/sivra/mercado/ingest`: el agente de
// pricing quedó bloqueado 3 ciclos seguidos (20/07, 22/07, 27/07) con un diagnóstico
// equivocado ("falta CRON_SECRET"), cuando el handler ya estaba abierto. Las excepciones
// se venían añadiendo A MANO a `PUBLIC` (así entraron `/api/trading` y
// `/api/internal/alerta`), y olvidarse era invisible hasta el siguiente ciclo mudo.
//
// Ahora: si un handler usa `isRoutineAuthorized`, su ruta va aquí y el guardián lo verifica.
//
// ALCANCE — leer antes de añadir una entrada:
// `ALERTA_TOKEN` es DELIBERADAMENTE de bajo privilegio: viaja en el campo de variables del
// entorno de las rutinas, que es TEXTO PLANO VISIBLE, no un almacén de secretos. Esta lista
// es exactamente su superficie de ataque si se filtra. No metas aquí prefijos anchos ni
// rutas que muevan dinero real, borren datos o expongan datos personales. El paso por el
// middleware NO autoriza: cada handler revalida con `isRoutineAuthorized`.
export const RUTAS_RUTINA: string[] = [
  // Aviso Telegram de las rutinas (lo único que abre el token por diseño).
  '/api/internal/alerta',
  // Agente trading-analista (SOLO paper: empujar saldo, puntuar, analizar — cero órdenes reales).
  '/api/trading',
  // Agente de pricing (sivra): ingesta de comps de mercado y raíles de aplicación de precio,
  // ambos con sus propias guardas dentro del handler (pausa, suelo, tope, dryRun).
  '/api/sivra/mercado/ingest',
  '/api/sivra/pricing/aplicar-propuesta',
]

/** ¿La ruta está declarada como alcanzable por una rutina? (prefijo, como `PUBLIC`). */
export function esRutaDeRutina(pathname: string): boolean {
  return RUTAS_RUTINA.some((p) => pathname.startsWith(p))
}
