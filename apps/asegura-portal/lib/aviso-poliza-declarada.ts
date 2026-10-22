// El aviso de que un cliente ha subido una póliza a su bóveda.
//
// 🚨 No existía ningún aviso al subir una póliza declarada (medido 17/09/2026,
// caso real: Alejandro José Soler Fernández Gao subió dos y Alberto no se
// enteró por ningún canal). La fila queda en `portal_poliza_declarada` y solo
// sale como «oportunidad» en `/correduria` cuando el vencimiento entra en la
// ventana de `DIAS_AVISO_DECLARADAS` (60 días) — para una póliza que vence
// dentro de meses, eso puede tardar medio año en avisar. El objetivo de
// Alberto es poder venderle ANTES, así que el aviso va inmediato, sin esperar
// a esa ventana.
//
// Mismo patrón que `aviso-acceso.ts`: best-effort, nunca bloquea el alta ni
// lanza, y `sin_canal` se distingue de `error` para que el log diga cuál de
// las dos cosas pasó.
import { tgSend } from '@central/core-telegram'

export type ResultadoAviso = 'enviado' | 'sin_canal' | 'error'

export type ContextoPolizaDeclarada = {
  identidadId: string
  compania: string | null
  ramo: string | null
  numeroPoliza: string | null
  /** `YYYY-MM-DD`, o `null` si no se leyó/tecleó ninguna fecha. */
  fechaVencimiento: string | null
  /** `null` = la identidad no está vinculada a ninguna ficha de la cartera. */
  clienteNombre: string | null
  /**
   * Qué leyó la extracción. `null` = no se sabe (estado conservador: se avisa como
   * hasta ahora, sin afirmar que no sea una póliza). Solo `'otro'` dice «no es póliza».
   */
  tipoDocumento?: 'poliza' | 'suplemento' | 'recibo' | 'otro' | null
  /** Referencia catastral leída, si el documento la trae (p. ej. una ficha catastral). */
  referenciaCatastral?: string | null
}

export function mensajePolizaDeclarada(c: ContextoPolizaDeclarada): string {
  const quien = c.clienteNombre ?? 'una identidad SIN vincular a tu cartera'
  if (c.tipoDocumento === 'otro') {
    const que = c.referenciaCatastral ? ` (ficha catastral ${c.referenciaCatastral})` : ''
    return `📥 Documento aportado por ${quien}: no parece una póliza${que}.\nIdentidad ${c.identidadId}`
  }
  const compania = c.compania ?? 'compañía sin leer'
  const ramo = c.ramo ? ` (${c.ramo})` : ''
  const numero = c.numeroPoliza ? `, nº ${c.numeroPoliza}` : ''
  const vence = c.fechaVencimiento
    ? `Vence el ${c.fechaVencimiento}.`
    : 'Sin fecha de vencimiento leída/indicada.'
  return `📥 Póliza aportada por ${quien}: ${compania}${ramo}${numero}.\n${vence}\nIdentidad ${c.identidadId}`
}

/** Nunca lanza: un fallo del aviso no puede impedir que la póliza se guarde. */
export async function avisarPolizaDeclarada(c: ContextoPolizaDeclarada): Promise<ResultadoAviso> {
  try {
    const id = await tgSend(mensajePolizaDeclarada(c))
    if (id === null) {
      console.warn('[portal] poliza declarada sin avisar: falta TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID en este proyecto')
      return 'sin_canal'
    }
    return 'enviado'
  } catch (e) {
    console.error('[portal] no se ha podido avisar de la poliza declarada:', e instanceof Error ? e.message : e)
    return 'error'
  }
}

/**
 * El nombre de la ficha vinculada, si la hay. `null` en dos casos distintos
 * (sin vínculo, o la consulta falla) porque el mensaje de Telegram ya trata
 * ambos igual: «sin vincular» — lo que no puede hacer es inventarse un nombre.
 */
async function nombreClienteVinculado(identidadId: string): Promise<string | null> {
  try {
    // Import dinámico: así el texto del aviso (puro) se puede testear sin cliente Prisma.
    const { prisma } = await import('./db')
    const vinculo = await prisma.portalVinculo.findFirst({
      where: { identidadId },
      orderBy: { creadoEn: 'asc' },
      select: { clienteId: true },
    })
    if (!vinculo) return null
    const cliente = await prisma.cliente.findUnique({
      where: { id: vinculo.clienteId },
      select: { nombre: true, apellidos: true },
    })
    return cliente ? `${cliente.nombre} ${cliente.apellidos}`.trim() : null
  } catch (e) {
    console.error('[portal] no se ha podido resolver el cliente vinculado para el aviso:', e instanceof Error ? e.message : e)
    return null
  }
}

/**
 * Punto de entrada desde la ruta: resuelve el nombre y avisa, sin que nada de
 * esto pueda retrasar ni tumbar la respuesta al cliente (se llama con `void`).
 */
export async function avisarPolizaDeclaradaDesdeAlta(
  c: Omit<ContextoPolizaDeclarada, 'clienteNombre'>,
): Promise<ResultadoAviso> {
  const clienteNombre = await nombreClienteVinculado(c.identidadId)
  return avisarPolizaDeclarada({ ...c, clienteNombre })
}

// ── «Es de mi empresa» + rol (22/10/2026) ───────────────────────────────────
// Alberto: quien sube y confirma «es de mi empresa» es la PERSONA DE CONTACTO y gestor de esa póliza
// para los vencimientos. El portal NO escribe en la ficha de la empresa (eso es de `apps/asegura` y
// lo valida Alberto): lo deja en la declarada y lo PROPONE en una línea por Telegram.

/** Cómo se dice el rol en la frase «que dice ser …». `null` = no lo dijo (se dice, no se inventa). */
const ROL_EN_FRASE: Record<string, string> = {
  propietario: 'propietario o socio',
  administrador: 'administrador',
  empleado: 'empleado',
  otro: 'otra cosa (sin precisar)',
}

export type ContextoTitularEmpresa = {
  identidadId: string
  empresa: string
  /** Solo si pasó el dígito de control. */
  cif: string | null
  rol: string | null
  compania: string | null
  /** `null` = identidad sin vincular a una ficha (no se inventa un nombre). */
  clienteNombre: string | null
}

export function mensajeTitularEmpresa(c: ContextoTitularEmpresa): string {
  const quien = c.clienteNombre ?? 'una identidad SIN vincular a tu cartera'
  const empresa = `${c.empresa}${c.cif ? ` (${c.cif})` : ''}`
  const rol = c.rol !== null && ROL_EN_FRASE[c.rol] ? `que dice ser ${ROL_EN_FRASE[c.rol]}` : 'que no ha dicho qué es en ella'
  const compania = c.compania ? ` · ${c.compania}` : ''
  return `🏢 Póliza de ${empresa} aportada por ${quien}, ${rol} → contacto propuesto para el vencimiento${compania}.\nIdentidad ${c.identidadId}`
}

/** Best-effort y nunca lanza, como el aviso del alta. */
export async function avisarTitularEmpresa(c: Omit<ContextoTitularEmpresa, 'clienteNombre'>): Promise<ResultadoAviso> {
  try {
    const clienteNombre = await nombreClienteVinculado(c.identidadId)
    const id = await tgSend(mensajeTitularEmpresa({ ...c, clienteNombre }))
    if (id === null) {
      console.warn('[portal] titular empresa sin avisar: falta TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID en este proyecto')
      return 'sin_canal'
    }
    return 'enviado'
  } catch (e) {
    console.error('[portal] no se ha podido avisar del titular empresa:', e instanceof Error ? e.message : e)
    return 'error'
  }
}
