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

export interface VerticalAdapter {
  vertical: Vertical
  etiqueta: string                                   // "Limpieza (ialimp)"…
  listar(): Promise<ClienteSaaS[]>
  ficha(id: string): Promise<Cliente360 | null>
  setActivo(id: string, activo: boolean): Promise<boolean>   // bloquear/liberar
}
