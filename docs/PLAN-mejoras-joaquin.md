# PLAN DE MEJORAS — Programa para Joaquín Jaén (según reunión 11/06/2026)

> Fuente: transcripción de la reunión (dueño + hermanos; **ella** = responsable de todas las
> cocinas, **él** = restaurante + comercial). Cruza con `docs/BRIEF-joaquin-jaen.md` (sección
> POST-REUNIÓN) y `docs/DISENO-modulos-materiales-flota.md`.

## Enlaces de la propuesta (producción)
- Hub: https://iarest.es/propuesta/catering-jj
- Haciendas: https://iarest.es/propuesta/catering-jj-haciendas
- Catering / cocina central: https://iarest.es/propuesta/catering-jj-catering
- Restaurantes: https://iarest.es/propuesta/catering-jj-restauracion

## Principios (salidos de la reunión)
1. **La cocina de ella ya está construida y es buena → conectar, no reemplazar.** El riesgo no es
   técnico, es el **factor humano** (re-educar a la gente). Tratarla como socia/co-diseñadora.
2. **Arrancar por donde menos duele políticamente:** material de eventos + comercial (logística es
   el departamento más atrasado y el menos defendido).
3. **Vender la capa de decisión** (marketplace, comisiones, consolidado del holding) y **regalar la
   contabilidad como gancho** (como con los propietarios de pisos turísticos).

---

## Plan por bloques (priorizado)

### Bloque A — Comercial & comisiones  ·  *net-new, lo pide el comprador*
- CRM de eventos por comercial (base: `module-crm` + `leads_evento`).
- **Capa de incentivos:** bonos por **margen**, **ticket más alto** y **reseñas**; contratos con
  **% escalable** y rescisión automática si no se cumple objetivo.
- **Ranking del equipo en tiempo real.** RBAC por comercial (cada uno ve lo suyo).
- Día de oficina (martes): tareas/checklist de formación y reuniones.
- *A construir:* módulo de comisiones/incentivos + UI de ranking + motor de reglas de bono.

### Bloque B — Material de eventos  ·  *el piloto limpio, diseño ya hecho*
- Catálogo de menaje (mesas/sillas/vajilla/cristalería) con stock real (base: `inventario_menaje`).
- Asignación por evento (descuento automático) + **parte de roturas con foto** + liquidación.
- **Previsión por aforo, temporada y temperatura** (consumo de bebida varía verano/invierno, día/noche).
- Aviso si falta material para los eventos cerrados de la semana.
- *A construir:* vertical/módulo material sobre `module-inventario` (`Articulo`, `AsignacionActivo`,
  `costeDanos`) + `parte_danos` con foto.

### Bloque C — Presupuesto self-service / marketplace  ·  *el "wow" para cerrar*
- URL pública: el cliente configura su evento (adultos/niños/días) → **menú con tu margen ya
  incorporado** → reserva con **paga y señal** (Stripe).
- **Multi-tarificador** (estilo comparador de seguros) + **bot de bodas** (cualifica la primera visita).
- El lead entra ya cualificado al CRM del comercial.
- *A construir:* front público + motor de tarificación (`module-presupuestos`) + cobro online.

### Bloque D — Cocina: CONECTAR (no reemplazar)  ·  *ver §"Cocina" abajo*
- Puente para leer su sistema (escandallo, costes, fichas) → alimentar **presupuesto, compra y
  contabilidad** del grupo.
- Si su sistema no expone API: importación (CSV/foto/OCR) o co-diseño de las piezas que le falten.

### Bloque E — Restaurante / POS  ·  *ya en producción, ampliar*
- QR comanda (hecho), **fichaje por QR** (entrada/salida por empleado), **pago por QR** (lo hablaron
  en la feria).
- Maridaje de vino por IA integrado al menú (existe módulo `vinos`).

### Bloque H — Checklist operativo de personal + correlación con carga  ·  *idea de Alberto, net-new*
> Reutiliza el patrón de **checklist con cierre por foto** de las limpiadoras (`ialimp`), pero para
> el personal de hostelería, y lo cruza con la carga real del POS para convertirlo en una **herramienta
> de accountability objetiva**.
- **Plantillas de checklist por sección** (barra, sala, terraza, cocina) con tareas operativas:
  *bajar/subir barreras, repasar copas, recargar neveras, reponer, montaje, cierre de caja…*
- Tareas con **frecuencia** (apertura / por turno / cierre) y **responsable**; marcado por el empleado
  (check + **foto opcional**, como el cierre por foto de `ialimp`).
- **Cruce con carga de trabajo real:** el POS ya conoce **mesas abiertas + comandas pedidas** por franja
  → calcula un **índice de actividad**. El informe enfrenta *tareas pendientes* vs *carga del tramo*.
  - Tarea sin hacer en franja de **baja carga** → marcada como **"sin excusa" (reclamable)**.
  - Tarea sin hacer en franja de **alta carga** → mostrada con contexto (había curro).
- **Valor:** poder **reclamar al personal con datos** por qué no se hizo el trabajo cuando no había
  carga — quita la excusa de "no me dio tiempo" y da objetividad a la gestión de turnos/rendimiento.
- *A construir:* plantillas de checklist por sección + marcado (con foto) + motor que lee mesas/comandas
  del POS y genera el índice de carga + informe de cumplimiento por empleado/turno.

### Bloque I — Parte de trabajo del cocinero + productividad IA (producción)  ·  *idea de Alberto*
> El equivalente del Bloque H pero para **cocina/producción** (dominio de la responsable de cocina).
> Mismo patrón que la limpiadora de `ialimp`: el trabajador entra a **su perfil** y ve su trabajo ya
> **organizado y cronometrado** por el sistema. Conecta con los huecos de cocina **#5 (partes de trabajo
> por partida)** y **#6 (cronometraje + productividad)**.
- **Perfil del cocinero:** al entrar ve **su** trabajo del día/evento ya **organizado y secuenciado por
  la IA** (qué elaboraciones, en qué orden, para su partida), con **tiempo estimado por tarea**.
- **Anticipación:** el sistema planifica el trabajo por adelantado (como los partes 5 días antes que ya
  hace ella) y lo reparte entre cocineros equilibrando carga.
- **Productividad:** captura el **tiempo real** vs el **estándar** → cuadro de productividad por cocinero
  (¿es rentable?, ¿hay que reasignar?, ¿justifica el rendimiento?).
- **Encaje con la "vía conectar":** ella ya tiene partes por partida y cronometraje — aquí **co-diseñamos
  con ella** la capa de *perfil individual + planificación IA + productividad*, NO la reemplazamos.
- *A construir:* perfil/agenda del cocinero + motor de planificación y reparto (IA) + captura de tiempos
  real vs estándar + informe de productividad. (Reaprovecha tiempos estándar del hueco #6.)

### Bloque A.2 — Extensión de comisiones (idea pendiente — ya hay base en ia-rest)
> ⚠️ YA EXISTE en ia-rest: `CRMEventosTab` (pipeline leads), `ComisionesEventoTab` (% fijo o
> importe fijo por evento, resumen pagado/pendiente), `LeadsEventosTab`. Tablas: `leads_eventos`,
> campos `comision_pct/importe/cobrada_at` en `eventos`.
> Lo que FALTA para JJ:
- **Bonos multi-criterio:** bono por **margen real**, bono por **ticket más alto**, bono por **reseñas**.
- **% escalable/escalonado:** la comisión sube sola al alcanzar objetivos del contrato.
- **Ranking del equipo en tiempo real.**
- **Vista RBAC por comercial** (cada uno ve su pipeline y sus comisiones, no las del resto).
- *A construir:* extender `ComisionesEventoTab` con reglas multi-criterio + ranking + rol `comercial_eventos`.

### Bloque F — Adyacentes (reutilización, casi sin construir)
- Haciendas → `sivra`; limpieza con **cierre obligatorio por foto** → `ialimp`; **fontanería/obra**
  del cuñado (cuadro de mando con fotos, evolución de obra, avisos WhatsApp, localización) + cross-sell
  de `module-concursos` (licitaciones públicas).

### Bloque G — Holding / plataforma
- Consolidado Cuenta→Sociedad→Negocio (**ya funciona**).
- **Intercompany** (cocina→tiendas, flota→catering, material→eventos) con eliminación en el
  consolidado — diseñado, falta implementar.

---

## COCINA — qué tiene SU sistema que nosotros NO, y hay que añadir

> Su sistema (≈3 años de desarrollo) es **producción/seguridad alimentaria**, no POS. ia-rest hoy es
> POS/comanda + stock. Estos son los huecos reales que detectó la reunión:

| # | Capacidad | Su sistema | ia-rest hoy | Qué añadir |
|---|---|:--:|:--:|---|
| 1 | **Ficha técnica de producto** (alérgenos, caducidad, conservación, categoría) | ✅ | stock simple | Entidad ficha técnica + alérgenos (APPCC) por artículo |
| 2 | **Elaboraciones/recetas** como entidad (sub-elaboraciones, procesos —enfriamiento—, escalado por aforo) | ✅ | escandallo plano | Modelo `Elaboracion` con BOM + procesos + escalado |
| 3 | **Escandallo dinámico** (recosteo automático al cambiar precio de compra; coste por elaboración y por comensal) | ✅ | básico | Recosteo automático ligado a precios de compra reales |
| 4 | **Etiqueta de elaboración** (QR + fecha + lote + caducidad) + impresora de etiquetas | ✅ | ❌ | Generador de etiqueta + integración impresora (hay hardware bridge) |
| 5 | **Partes de trabajo por partida** (generados 5 días antes, lista de elaboraciones por partida + pick list de ingredientes; el cocinero entra con QR) | ✅ | KDS de comanda (no de producción) | Planificación de **producción** por partida y fecha |
| 6 | **Cronometraje / tiempos estándar** de elaboración + **productividad por cocinero** (real vs estándar) | ✅ | ❌ | Tiempos estándar + captura real + cuadro de productividad |
| 7 | **Báscula integrada** (peso en pantalla al recibir/elaborar) | ✅ | ❌ | Integración de báscula (hardware bridge) |
| 8 | **Recepción por código de barras + economato con códigos** (escaneo de entrada, no solo OCR albarán) | ✅ | OCR albarán | Escaneo de código de barras + gestión de economato/lotes |
| 9 | **Trazabilidad de lote end-to-end** (recepción→elaboración→etiqueta→servicio) para sanidad/APPCC | ✅ | ❌ | Trazabilidad de lote completa |
| 10 | **Aprovechamiento de sobras** → nuevas elaboraciones + **cierre/verificación semanal** de lotes | ✅ | ❌ | Gestión de sobras + cierre semanal |

**Decisión estratégica (no reconstruir a ciegas):**
- **Vía A — Conectar (ahora):** puente/import desde su sistema para que sus escandallos y costes
  alimenten presupuesto, compra y contabilidad del grupo. Rápido y respeta lo suyo. **Recomendada.**
- **Vía B — Absorber (largo plazo):** llevar su modelo a `packages/module-cocina` **co-diseñado con
  ella** como design partner. Solo cuando haya confianza y datos del stack.

**Dato que falta para decidir A vs B:** stack exacto de su sistema (¿tiene API/exportación?, ¿en qué
está hecho?) y su disposición a co-diseñar.

---

## PROPUESTA DE TRABAJO — construir Bloques H e I (en `apps/ia-rest`)

> Todo en el monorepo `central` → `apps/ia-rest`. BD: Supabase compartido
> `wswbehlcuxqxyinousql`, **schema `iarest`**. Reutiliza patrones del maestro
> (sesión firmada, `createServerClient`, `useModulo`, storage de fotos, `callAI`).

### Lo que YA existe (no se rehace)
- `evento_checklist_item`, `personal_evento_asignacion`, `secciones_cocina`, `personal`,
  `turnos` (servicio + fichaje), `fichajes`.
- `comandas` / `comanda_items` / `mesas` → **fuente de la "carga real" del POS**.
- `escandallos`, `stock_rendimientos`, Peso; storage de fotos (patrón `documentos_escaneados`);
  `callAI()` (NIM→Haiku) para el planner de cocina.

### Bloque H — Checklist operativo + carga (MVP)
- **DB (`iarest`):** `checklist_plantillas` (seccion, tareas jsonb [{texto, frecuencia
  apertura|turno|cierre, requiere_foto}]) · `checklist_ejecuciones` (plantilla_id, turno_id,
  personal_id, tarea_idx, estado, foto_url, completed_at). RLS estándar + índice restaurante_id.
- **API:** `/api/checklists/plantillas` (config owner) · `/api/checklists/turno` (tareas del turno
  por sección) · `/api/checklists/marcar` (marca + sube foto) · `/api/checklists/informe`.
- **Índice de carga:** función que por franja cuenta comandas + mesas abiertas + items → bajo/medio/alto.
- **UI:** card "Checklist de turno" en `/edge` y `/jefe` (marcar con foto) · `/owner → Checklists`
  (editor de plantillas + informe: tarea pendiente + carga baja = "sin excusa" en rojo). `useModulo('checklists')`.

### Bloque I — Perfil del cocinero + productividad (MVP, respeta su sistema)
- **DB (`iarest`):** `produccion_tareas` (fecha, evento_id?, seccion_cocina_id, elaboracion_nombre,
  cantidad, tiempo_estimado_min, personal_id, orden, estado, tiempo_real_min, started_at, done_at) ·
  `produccion_tiempos_estandar` (elaboracion_nombre, minutos_por_unidad).
- **API:** `/api/produccion/planificar` (IA reparte y secuencia por cocinero con tiempo estimado) ·
  `/api/produccion/perfil` (tareas del cocinero logueado) · `/api/produccion/tiempo` (inicio/fin →
  tiempo real) · `/api/produccion/productividad` (real vs estándar por cocinero/partida).
- **UI:** perfil del cocinero (su lista del día secuenciada + tiempos + botón empezar/terminar) ·
  `/owner → Productividad cocina` (cuadro real vs estándar). `useModulo('produccion')`.
- **Principio:** NO se importa su sistema; se parte de tareas (manual + IA). Si luego ella conecta el
  suyo, alimenta `produccion_tareas`. = "conectar/co-diseñar, no reemplazar".

### Verificación (antes de cada push)
`npx tsc --noEmit` 0 errores + `next build` con deps (el `tsc` solo no reproduce el build de Vercel) →
PR a `main` → preview Ready.

## Orden recomendado para mañana
1. **Bloque A — Comercial & comisiones** (lo pide el comprador; net-new claro).
2. **Bloque B — Material de eventos** (piloto limpio; diseño ya hecho).
3. **Bloque C — Marketplace self-service** (el wow para cerrar).
- Cocina (Bloque D) → conectar en paralelo en cuanto tengamos los datos del stack de ella.
