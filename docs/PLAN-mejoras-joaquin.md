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

## Orden recomendado para mañana
1. **Bloque A — Comercial & comisiones** (lo pide el comprador; net-new claro).
2. **Bloque B — Material de eventos** (piloto limpio; diseño ya hecho).
3. **Bloque C — Marketplace self-service** (el wow para cerrar).
- Cocina (Bloque D) → conectar en paralelo en cuanto tengamos los datos del stack de ella.
