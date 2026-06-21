# `@central/core-receipts` — render unificado de recibos/tickets con glosa IA

> Spec de diseño. Origen: Alberto comparte `receiptmaker.ai` (16/06/2026) → "esto para
> nuestros negocios". Tras descartar el caso "fake receipt" (incompatible con VeriFactu),
> el objetivo aprobado es **emitir los recibos/tickets REALES más bonitos y con marca**,
> de forma **transversal** a las verticales, con un **toque de IA en cada emisión** confinado
> a una capa de presentación no-fiscal.

## 1. Objetivo y alcance

Crear un módulo compartido `packages/core-receipts` (scope `@central/core-receipts`, fuente
TS pura, consumido por las apps con `file:` deps como el resto) que, a partir de **datos
estructurados fiscalmente seguros**, renderice documentos de cara al cliente en tres salidas:

- **HTML** (pantalla / imprimir-a-PDF del navegador) — comportamiento actual de las 3 apps.
- **PDF** (adjunto de email) — capacidad **nueva**.
- **ESC/POS térmico** — migración de lo que ya existe en ia-rest.

Todo ello con **branding por negocio** y una **glosa IA opcional** (mensaje personalizado,
traducción al idioma del huésped, microcopy) que **nunca** toca el contenido fiscal.

### Fuera de alcance (YAGNI)
- Generar recibos "falsos" / plantillas de terceros (Walmart, Uber…). Descartado por riesgo legal y choque con VeriFactu.
- Que la IA construya el **payload fiscal**. El payload lo sigue produciendo `@central/core-fiscal` + adaptadores.
- Plataforma: no emite documentos; queda fuera.

## 2. Estado actual (mapa del código, 16/06/2026)

| Aspecto | ia-rest | ialimp | sivra | plataforma |
|---|---|---|---|---|
| Render factura | ESC/POS binario + HTML | HTML (print navegador) | HTML heredado de ialimp | — |
| Librería PDF | ❌ ninguna | ❌ ninguna | ❌ ninguna | ❌ |
| Impresora térmica | ✅ ESC/POS cocina | ❌ | ❌ | ❌ |
| VeriFactu | ✅ Fase 1 local + Fase 2 preparada | 🟡 esquema preparado | ❌ N/A | ❌ |
| White-label | ❌ marca única | ✅ multi-tenant (CSS vars) | ❌ interno | ❌ |

Ficheros clave:
- ia-rest ESC/POS: `apps/ia-rest/src/lib/courier.ts` (`generarEscPos()`, `generarTextoPlano()`).
- ia-rest factura HTML: `apps/ia-rest/src/app/api/factura/cliente/route.ts`.
- ia-rest adaptador VeriFactu: `apps/ia-rest/src/lib/verifactu.ts` (`construirFactura`, `generarXmlLROE`, bloque `SistemaInformatico`).
- ialimp factura HTML: `apps/ialimp/app/api/propietario/[token]/factura/[id]/route.ts` (helpers `esc()`, `eur()`, `fdate()`).
- ialimp branding: `apps/ialimp/lib/branding.ts` (`getBranding(empresa_id)`, `brandingFrom()`), migración `add_empresa_branding.sql` (`marca_nombre`, `logo_url`, `color_primario/secundario/light`).
- sivra facturación: `apps/sivra/app/api/admin/limpiadoras/facturacion/route.ts` (envío por `nodemailer`).
- Núcleo fiscal puro: `packages/core-fiscal` (`calcularHuella`, `generarQrData`, `parseFechaLocalAEAT`, `calcularFiscal`, `escapeXml`).

**Conclusión clave:** la separación *dato fiscal puro* vs *adaptador* **ya existe** en
`core-fiscal`. `core-receipts` se enchufa **aguas abajo** del dato fiscal: solo presenta, nunca calcula ni altera lo fiscal.

## 3. Decisiones aprobadas

- **Transversal** desde el inicio (módulo compartido), no por-vertical.
- **Modo A (base, todas las verticales):** IA en cada emisión, **solo capa de presentación** (glosa no-fiscal). El payload fiscal se inyecta determinista y se **valida** tras la IA.
- **Modo B (opcional, solo ialimp/sivra):** la IA compone también el *layout* no-fiscal dentro de un whitelist de componentes. Apagado por defecto. **ia-rest no puede activarlo.**
- **PDF real** vía `@react-pdf/renderer` (JS puro, sin chromium → sin dolor en Vercel serverless), manteniendo el HTML actual para pantalla/print y ESC/POS para térmica.

## 4. Arquitectura

```
packages/core-receipts/
├── src/
│   ├── types.ts            # ReceiptDoc (union discriminada), Branding, Glosa
│   ├── branding.ts         # Branding + adaptadores (getBranding ialimp, constantes ia-rest/sivra)
│   ├── glosa/
│   │   ├── provider.ts     # interfaz GlosaProvider
│   │   ├── ai.ts           # impl con @central/core-ai (modo A), cache + fallback
│   │   └── static.ts       # glosa determinista de respaldo por negocio/idioma
│   ├── renderers/
│   │   ├── html.ts         # ReceiptDoc -> string HTML (theme-agnostic, vars --brand-*)
│   │   ├── pdf.ts          # ReceiptDoc -> Buffer (@react-pdf/renderer)
│   │   └── thermal.ts      # ReceiptDoc -> Buffer ESC/POS (migrado de courier.ts)
│   ├── integrity.ts        # assertFiscalIntegrity (fail-closed)
│   ├── i18n.ts             # es (default), en, ca — plumbing desde ya
│   └── index.ts            # renderReceipt() orquestador
└── __tests__/snapshots/
```

### 4.1 Modelo de datos
`ReceiptDoc` = unión discriminada por `kind`:
- `ticket-verifactu` (ia-rest): incluye `fiscal: { numero, fechaLocal, emisor, dest, base, iva, total, huella, qrData }` — producido por `verifactu.ts`/`core-fiscal`. **Congelado** (`Readonly`, nunca se muta).
- `factura-cliente` (ia-rest + ialimp): `fiscal` + `lineas[]`.
- `recibo-limpieza` (ialimp/sivra): justificante de sesión/payout.

Cada doc lleva `fiscal` (inmutable, verbatim) + `presentation` (branding + glosa). El renderer
copia los valores de `fiscal` **literalmente**; no recalcula nada.

### 4.2 Branding
`Branding = { nombre, logoUrl?, primario, secundario, light, lang }`. Resolutores:
- ialimp: adaptar el `getBranding(empresa_id)` existente → primera vez que Sique Brilla (oro/negro) se aplica a una factura real.
- ia-rest: constante `IAREST_BRAND`.
- sivra: constante `SIVRA_BRAND`.

La plantilla HTML es **agnóstica al tema** vía CSS custom properties (`--brand-primario`,
`--brand-secundario`, `--brand-light`, `--brand-logo`), igual que el patrón ya usado en ialimp.

### 4.3 Glosa IA (modo A)
`GlosaProvider.generar(ctx): Promise<string>` donde `ctx` es **solo no-fiscal** (nombre cliente,
resumen de ítems, idioma, tono del negocio). Salida **restringida**:
- Texto plano, longitud máxima acotada.
- **Sin cifras ni símbolos de moneda** (sanitizado/validado).
- Se coloca en una región dedicada `.glosa`, **lejos de los campos fiscales**.

Operativa:
- **Caché** por clave `(negocioId, idioma, kind, hashContenidoNoFiscal)` → no se paga LLM por documentos equivalentes.
- **Fallback** determinista (`glosa/static.ts`) si la IA falla, agota timeout o no hay red.
- **Nunca en el camino caliente térmico:** `thermal.ts` usa glosa precomputada/cacheada o ninguna, para imprimir al instante y offline.

### 4.4 Modo B (opcional ialimp/sivra)
Flag `layout: 'ai-full'`: la IA elige orden/estilo de secciones **no-fiscales** dentro de un
whitelist de componentes. El bloque fiscal se inyecta determinista y pasa por `assertFiscalIntegrity`
igual que en modo A. Apagado por defecto; bloqueado en ia-rest por tipo (`ticket-verifactu`).

### 4.5 Guardia de integridad fiscal
`assertFiscalIntegrity(doc, salida)` (se ejecuta en **todos** los renderers):
- Verifica que cada valor fiscal obligatorio (numero, NIF emisor/dest, base, iva, total, fecha, huella, datos QR) aparece **verbatim** en la salida renderizada.
- Verifica que la región de glosa **no contiene** ninguna de las cifras fiscales y respeta los límites.
- **Falla cerrado**: lanza antes de emitir si algo no cuadra. No hay emisión sin integridad.

### 4.6 Orquestador
```ts
renderReceipt(doc: ReceiptDoc, opts: {
  branding: Branding,
  salida: 'html' | 'pdf' | 'thermal',
  glosa?: GlosaProvider,        // omitido o fallback => sin IA
  layout?: 'standard' | 'ai-full',
}): Promise<string | Buffer>
```
Flujo: resolver glosa (con caché/fallback) → render por salida → `assertFiscalIntegrity` → devolver.

## 5. Elección de librería PDF
Hoy no hay ninguna. Evaluado:
- **Puppeteer/chromium**: pixel-perfect desde el HTML actual, pero binario pesado y frágil en Vercel serverless. ❌
- **`@react-pdf/renderer`** ✅: JS puro, sin chromium, determinista. Plantilla propia (no reusa el HTML), pero alimentada por el mismo `ReceiptDoc`.
- **Seguir con "print del navegador"**: gratis para pantalla, pero no sirve para adjuntar PDF a emails (ialimp propietario, sivra).

Decisión: `@react-pdf/renderer` para PDFs adjuntos; HTML para pantalla/print; ESC/POS para térmica. Tres renderers, un solo `ReceiptDoc`.

## 6. Plan de integración (app por app)
1. **ia-rest `courier.ts`**: mover `generarEscPos`/`generarTextoPlano` → `renderers/thermal.ts`; ia-rest lo importa. **Cero cambio fiscal.** Regresión por igualdad de bytes (ver §7).
2. **ia-rest `/api/factura/cliente`**: sustituir HTML inline por `renderReceipt(doc, { branding: IAREST_BRAND, salida: 'html' })`; opción `salida:'pdf'` para copia por email.
3. **ialimp `/api/propietario/[token]/factura/[id]`**: sustituir HTML inline (mover `esc/eur/fdate` al paquete) por `renderReceipt(doc, { branding: await getBranding(empresa_id), salida })` → ejercita por fin el white-label Sique Brilla. Añadir `salida:'pdf'` para adjuntar al email.
4. **sivra `/api/admin/limpiadoras/facturacion`**: `renderReceipt` con `SIVRA_BRAND`, adjuntando PDF al `nodemailer`.

## 7. Testing
- **Snapshots** golden HTML por `(kind, branding, idioma)`.
- **Igualdad de bytes ESC/POS** vs `courier.ts` actual: la migración no debe cambiar ni un byte del ticket impreso (guardia de regresión).
- **Integridad fiscal** (property test): para payloads fiscales aleatorios, todo campo obligatorio sobrevive a HTML/PDF/ESC/POS y la glosa nunca contiene cifras fiscales.
- **Fallback de glosa**: provider que lanza → mensaje determinista; el camino térmico no llama nunca a la IA.

## 8. Despliegue por fases (respeta CLAUDE.md)
- **Fase 1**: paquete + `thermal.ts` migrado con igualdad de bytes (tickets ia-rest idénticos).
- **Fase 2**: renderer HTML adoptado en las 3 rutas de factura — primero paridad visual, luego branding. ⚠️ ialimp tiene piloto vivo (Sique Brilla): los cambios visuales van detrás de snapshot de paridad + flag.
- **Fase 3**: glosa IA (modo A) tras feature flag por negocio + PDF para emails.
- **Fase 4**: modo B experimental en ialimp/sivra.

i18n (`lang`) se cablea desde ya (es por defecto; en/ca después), barato y alineado con el valor "glosa en el idioma del huésped".

## 9. Riesgos y mitigaciones
- **Romper VeriFactu** → `assertFiscalIntegrity` fail-closed + igualdad de bytes ESC/POS + la IA jamás toca `fiscal`.
- **Coste/latencia LLM** → caché por plantilla + glosa fuera del camino térmico + fallback determinista.
- **Piloto ialimp en vivo** → paridad visual por snapshot antes de tocar nada + flag por empresa.
- **PDF en Vercel** → `@react-pdf/renderer` (sin chromium).
