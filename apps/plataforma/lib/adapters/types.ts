// PORT del god-panel: cada vertical implementa este contrato para que el panel
// liste y gestione sus clientes/tenants. Así el panel no conoce la BD ni la API
// concreta de cada vertical — solo el puerto.

export type Vertical = 'ialimp' | 'sivra' | 'iarest'

export interface Metrica { label: string; valor: string }

/** Un cliente/tenant tal como lo ve el operador, normalizado entre verticales. */
export interface ClienteSaaS {
  vertical: Vertical
  id: string
  nombre: string
  email?: string | null
  activo: boolean
  puedeBloquear: boolean      // false p.ej. para instancias propias (sivra)
  metricas: Metrica[]         // KPIs cortos para el listado
}

/** Ficha 360 de un cliente (listado + detalle ampliado). */
export interface Cliente360 extends ClienteSaaS {
  detalle: Metrica[]
  modulos?: string[]          // módulos activos (F2)
}

export interface NuevoCliente { nombre: string; email?: string; password?: string; ciudad?: string }

/** Una persona del directorio de un negocio (para dirigir comunicación por persona). */
export interface PersonaDirectorio {
  refPersona: string          // id de la persona en su vertical (con prefijo si hace falta)
  nombre: string
  rol: string | null
  email?: string | null
}

export interface VerticalAdapter {
  vertical: Vertical
  etiqueta: string                                   // "Limpieza (ialimp)"…
  puedeCrear: boolean                                // ¿se puede dar de alta desde el panel?
  listar(): Promise<ClienteSaaS[]>
  ficha(id: string): Promise<Cliente360 | null>
  setActivo(id: string, activo: boolean): Promise<boolean>   // bloquear/liberar
  crear?(input: NuevoCliente): Promise<{ id: string }>       // alta de cliente
  // Directorio de personas/roles de un negocio (refExt = tenant en su vertical).
  // Para dirigir comunicación a personas concretas (F0.3). Opcional por vertical.
  listarDirectorio?(refExt: string): Promise<PersonaDirectorio[]>
  // Resuelve un grupo dinámico a su lista de personas (F0.4). `origenRef` es la parte
  // específica de la vertical, p.ej. 'evento:<id>' para "participantes del catering".
  resolverGrupo?(origenRef: string): Promise<PersonaDirectorio[]>
}
