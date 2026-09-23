// Cabeceras de TODA llamada de plataforma al puerto de operador de asegura (Fase 1b de ASegura OS).
//
// Además del Bearer, cada llamada lleva `x-actor`: quién la hace. asegura lo apunta en
// `seguros.auditoria` junto a la ruta y los ids que tocó (`apps/asegura/lib/auditoria.ts`).
//   · `humano:<cuentaId>` si hay sesión de plataforma en la petición en curso;
//   · `sistema:plataforma` si no la hay (crons, jobs del dispatcher, tests);
//   · el que se pase explícito (un agente: `agente:<id>`; un cron que quiera nombrarse).
// Es atribución, no autorización: viaja dentro del canal que ya protege el Bearer.
//
// 🚨 Este fichero NO importa nada, a propósito. Varios clientes del puerto
// (`cliente-edicion-asegura.ts`, `actividad-asegura.ts`…) los importan TAMBIÉN componentes
// `'use client'` por sus funciones puras, así que lo que se importe aquí acaba en el bundle del
// navegador: `next/headers` rompería el build y `auth.ts` metería bcrypt y el JWT. La sesión la
// resuelve `resolverActorSesion`, que registra `instrumentation.ts` (solo servidor) en
// `globalThis` — global y no variable de módulo porque Next puede cargar este fichero en más de
// una capa del bundle del servidor, y cada copia tendría su propia variable.

export const CABECERA_ACTOR = 'x-actor'
export const ACTOR_SISTEMA = 'sistema:plataforma'

type Resolutor = () => Promise<string | null>
const CLAVE = '__plataformaActorPuerto'

/** Actor de una sesión ya verificada. PURO. */
export function actorDeSesion(cuentaId: string | null | undefined): string {
  return cuentaId ? `humano:${cuentaId}` : ACTOR_SISTEMA
}

/** Lo llama `instrumentation.ts` al arrancar el servidor. */
export function registrarResolutorActor(fn: Resolutor): void {
  (globalThis as Record<string, unknown>)[CLAVE] = fn
}

/** Actor de la petición en curso. Sin resolutor, fuera de una petición o sin sesión → sistema. */
export async function actorActual(): Promise<string> {
  const fn = (globalThis as Record<string, unknown>)[CLAVE] as Resolutor | undefined
  if (!fn) return ACTOR_SISTEMA
  try {
    return actorDeSesion(await fn())
  } catch {
    return ACTOR_SISTEMA
  }
}

/** `Authorization` + `x-actor` para una llamada al puerto de asegura. */
export async function cabecerasPuerto(secret: string, actor?: string): Promise<Record<string, string>> {
  return { Authorization: `Bearer ${secret}`, [CABECERA_ACTOR]: actor ?? (await actorActual()) }
}
