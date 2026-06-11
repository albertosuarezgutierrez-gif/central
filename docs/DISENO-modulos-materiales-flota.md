# Diseño a fondo — Módulos nuevos: Alquiler de materiales y Flota/Transporte

> Estado: **DISEÑO** (no implementado). Continúa `docs/DISENO-modularizacion-verticales.md`
> (modularización) y se construye **componiendo** los `module-*` allí definidos.
> Disparador: los dos negocios de **Joaquín Jaén** que hoy no tienen vertical.

## 1. Por qué (contexto)

Joaquín tiene dos negocios que la casa de marcas **no cubre** hoy con una vertical:
**alquiler de materiales para eventos** y **transporte/flota de camiones**. El estudio
(`DISENO-modularizacion-verticales.md`) concluyó que no hay que construirlos de cero: se
componen sobre los módulos horizontales (`module-crm`, `module-inventario`, `module-agenda`,
`module-presupuestos`, `module-proveedores`) y el agregado genérico **`Encargo`**.

Además, **ia-rest ya tiene cimientos reales** reutilizables (verificado en su BD
`efncqyvhniaxsirhdxaa`):

| Necesidad | Ya existe en ia-rest | Hay que añadir |
|---|---|---|
| Catálogo de material | `inventario_menaje` (nombre, categoria, cantidad_total/disponible, coste_unitario, imagen) | tarifa de alquiler, fianza, nº de serie/lote, ubicación |
| Reserva/uso de material | `inventario_menaje_evento` (cantidad_reservada/devuelta/rota, coste_roturas, estado) | fechas alquiler, contrato, parte de daños con fotos |
| Flota | `vehiculos_grupo` (matricula, capacidad_kg/m³, tipo, es_propio, tarifa_km, tarifa_fija) — **escopado por `cuenta_id` (holding)** | ITV, seguro, mantenimiento, combustible, documentación |
| Asignación de transporte | `evento_transporte` (vehiculo, conductor, **nodo origen/destino**, km/coste estimado y real, horas) | rutas multi-parada, asignación inteligente, facturación |
| Proveedores | `proveedores_evento(_asignaciones)` (comisión, portal con token) | (reutilizable tal cual vía `module-proveedores`) |

**Principio rector:** *extender y generalizar lo existente* hacia `module-*`, no duplicar.

## 2. Encaje en el agregado `Encargo`

Un **alquiler** y un **porte** son instancias de `Encargo` (ver doc de modularización):

```
Encargo(tipo='alquiler')  = oportunidad(CRM) + presupuesto + asignaciones_activo(inventario)
                            + recurso_reserva(agenda: kit/fechas) + portal(contrato) + feedback
Encargo(tipo='porte')     = oportunidad(CRM) + presupuesto + recurso_reserva(agenda: camión+conductor)
                            + ruta + proveedores(si subcontrata) + feedback
```

`parent_type='alquiler' | 'porte'` es la costura que permite reutilizar inventario,
proveedores, presupuestos y feedback sin tocar esos módulos.

---

## 3. Módulo / vertical: **Alquiler de materiales**

### 3.1 Modelo de datos (generaliza `inventario_menaje*` → `module-inventario`)

- **`articulo`** (de `inventario_menaje`, + alquiler): `id, nombre, categoria, descripcion,
  imagen_url, cantidad_total, cantidad_disponible, coste_unitario, **tarifa_alquiler_dia**,
  **fianza_unitaria**, **reposicion_unitaria** (coste si rotura), ubicacion, activo`.
- **`asignacion_activo`** (genérica, de `inventario_menaje_evento`): `id, articulo_id,
  **parent_id, parent_type**, cantidad_reservada, cantidad_entregada, cantidad_devuelta,
  cantidad_danada, coste_danos, estado('reservado'|'entregado'|'devuelto'|'cerrado'),
  **fecha_entrega, fecha_devolucion_prevista, fecha_devolucion_real**`.
- **`parte_danos`** (nuevo): `id, asignacion_id, articulo_id, cantidad, motivo, foto_url,
  coste_imputado, facturado_bool`. (OCR/foto vía `core-ai`.)
- **Disponibilidad** (`module-agenda`): un kit/artículo es un **recurso** con calendario; evita
  doble reserva en fechas solapadas.

### 3.2 Ciclo de vida (pantallas)

1. **Lead** (`module-crm`): entra solicitud (web/portal público `module-portales`).
2. **Presupuesto** (`module-presupuestos`): líneas = `artículo × días × tarifa_alquiler_dia`
   + fianza; margen sobre `coste_unitario`/amortización.
3. **Reserva**: bloquea disponibilidad (agenda) y `cantidad_disponible`.
4. **Entrega**: albarán (reutiliza patrón ASN), foto de estado.
5. **Devolución**: parte de daños (fotos), cálculo de roturas, liquidación de fianza.
6. **Facturación** (`core-fiscal`): alquiler + daños no cubiertos por fianza. Si el cliente es
   **otra sociedad del holding** (p.ej. el catering de Joaquín) → factura **intercompany**.

### 3.3 Pantallas clave
- **Catálogo** (CRUD artículos + tarifas + fianzas + stock).
- **Calendario de disponibilidad** por artículo/kit.
- **Ficha de alquiler** (Encargo): cliente, líneas, fechas, estado, daños, liquidación.
- **App de almacén**: entrega/recepción con fotos y control de daños.

---

## 4. Módulo / vertical: **Flota / Transporte**

### 4.1 Modelo de datos (generaliza `vehiculos_grupo` + `evento_transporte` → `module-flota`)

- **`vehiculo`** (de `vehiculos_grupo`): `id, cuenta_id, nombre, matricula, tipo
  ('furgon'|'camion'|'frigorifico'|'plataforma'|…), capacidad_kg, capacidad_m3, es_propio,
  proveedor_transporte, tarifa_km, tarifa_fija`.
- **`vehiculo_documento`** (nuevo — gestión de flota): `id, vehiculo_id, tipo
  ('itv'|'seguro'|'permiso'|'tacografo'), fecha_emision, **fecha_caducidad**, importe,
  documento_url`. Alertas de caducidad vía `module-mensajeria`.
- **`vehiculo_mantenimiento`** (nuevo): `id, vehiculo_id, fecha, km, tipo, coste, taller, notas`.
- **`vehiculo_repostaje`** (nuevo): `id, vehiculo_id, fecha, km, litros, importe`.
- **`porte`** (generaliza `evento_transporte`): `id, **parent_id, parent_type**, vehiculo_id,
  conductor_id, estado, km_estimados, km_reales, coste_estimado, coste_real, hora_salida,
  hora_llegada, **es_interno_bool**, **sociedad_origen_id, sociedad_destino_id** (intercompany)`.
- **`ruta_parada`** (nuevo, multi-parada): `id, porte_id, orden, nodo_id, tipo
  ('recogida'|'entrega'), ventana_horaria, completada_at`. (`evento_transporte` ya tiene
  `origen_nodo_id`/`destino_nodo_id` → se extiende a N paradas.)

### 4.2 Lógica diferencial
- **Asignación inteligente**: elegir vehículo por **tipo** (frigorífico para catering) y
  **capacidad** (kg/m³) vs carga estimada; evitar solapes con la **agenda** del vehículo+conductor.
- **Coste real vs estimado**: `evento_transporte` ya separa estimado/real → cuadro de
  rentabilidad por porte y por vehículo (km, combustible, mantenimiento amortizado).
- **Doble modelo de negocio**:
  - **Porte externo** → factura al cliente (`core-fiscal`).
  - **Porte interno** (mover comida de la cocina central a las tiendas; menaje a un evento) →
    **factura/coste intercompany** entre sociedades del holding (`es_interno_bool` + sociedades).

### 4.3 Pantallas clave
- **Flota**: fichas de vehículo + semáforo de ITV/seguro/mantenimiento (caducidades).
- **Planificador de portes**: agenda de vehículos/conductores + asignación + ruta multi-parada.
- **Parte de porte** (móvil conductor): paradas, km, incidencias, firma/foto de entrega.
- **Rentabilidad**: por vehículo y por porte; interno vs externo.

---

## 5. Reutilización (mapa módulo → negocio)

| Capacidad | Alquiler materiales | Flota/Transporte | Procede de |
|---|:--:|:--:|---|
| CRM / leads | ✅ | ✅ | `module-crm` (de `leads_evento`) |
| Presupuestos / facturación | ✅ | ✅ | `module-presupuestos` + `core-fiscal` |
| Agenda / disponibilidad | ✅ (kits) | ✅ (vehículos+conductores) | `module-agenda` |
| Inventario / activos | ✅ (núcleo) | 🔧 (repuestos, opcional) | `module-inventario` (de `inventario_menaje`) |
| Proveedores (subcontrata) | 🔧 | ✅ (transportistas externos) | `module-proveedores` |
| Portal público / contrato | ✅ | ✅ (parte de entrega) | `module-portales` |
| Feedback | ✅ | ✅ | `module-feedback` |
| **Intercompany** | ✅ (a otras sociedades) | ✅ (cocina→tiendas) | jerarquía plataforma + `core-fiscal` |

## 6. Fases sugeridas (orden y esfuerzo orientativo)

1. **Extraer `module-inventario`** desde `inventario_menaje*` con `asignacion_activo` genérica
   (parent_id/type). *Base de alquiler.* — esfuerzo medio.
2. **Vertical Alquiler de materiales** (catálogo+tarifas+fianza, ciclo reserva→entrega→daños→
   factura) sobre inventario + crm + presupuestos + agenda. — medio.
3. **Extraer `module-flota`** desde `vehiculos_grupo` + `evento_transporte` (porte genérico +
   gestión documental ITV/seguro/mantenimiento). — medio.
4. **Vertical Transporte** (planificador, rutas multi-parada, asignación inteligente,
   rentabilidad, doble facturación interno/externo). — medio-alto.
5. **Intercompany** transversal (cocina central→tiendas, flota→catering, materiales→eventos):
   marcar operaciones vinculadas + eliminación en el consolidado de `plataforma`. — medio.

> Cada vertical entra como `apps/<app>` con su `package.json`/`vercel.json` y Root Directory
> propio (regla de la matriz), consumiendo los `packages/module-*` vía deps de workspace.

## 7. Qué demostrar a Joaquín el jueves

- Sus **6 negocios** caben: restaurante/catering/tiendas (ia-rest), haciendas (sivra+ialimp),
  y **materiales + transporte** se montan **componiendo módulos ya existentes** (no desde cero).
- El **gancho holding**: cocina central → tiendas y flota → catering como **operaciones
  intercompany** consolidadas en un único cuadro de mando.
- **Por dónde empezar el piloto** (propuesta): cocina central → tiendas (ia-rest, ya funciona) +
  CRM de eventos; y a continuación alquiler de materiales reutilizando `inventario_menaje`.
