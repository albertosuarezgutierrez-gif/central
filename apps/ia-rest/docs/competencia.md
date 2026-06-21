# ia.rest — Inteligencia competitiva (Voice POS hostelería)

> Documento disparado por la aparición de **comandiavoz.com** (anuncio pagado en
> Instagram/Meta — el enlace traía `fbclid`). Cubre el **mercado completo** de
> comanda por voz para hostelería en España, no solo ese competidor.
>
> **Última actualización:** 2026-06-21
> **Estado de los datos:** el sitio `comandiavoz.com` NO se pudo leer (egress de
> red bloqueado en la sesión web: `WebFetch` → 403 "Host not in allowlist";
> `WebSearch` es US-only y no indexa el dominio). Todo lo de comandiavoz queda
> como **pendiente de verificar** (ver §2 y §11). El resto del mercado SÍ está
> verificado con fuentes (ver §10).

---

## 1. Aviso de método (leer primero)

Hay que separar **dos categorías** que las búsquedas mezclan:

- **(A) Comanda por voz del CAMARERO en sala** — el camarero dicta el pedido
  junto a la mesa y se transcribe al TPV/cocina. **Es el nicho exacto de ia.rest.**
  Pocos competidores reales.
- **(B) Voice AI para PEDIDOS TELEFÓNICOS / drive-thru** — un agente IA atiende
  la llamada o al coche. Mercado enorme pero **distinto** (SoundHound, Presto,
  Bite Buddy, Loman, Foreva, VOICEplug, Slang, Kea, Certus…). Sirven como
  referencia tecnológica y de marketing, **no** como rival directo en sala.

`comandiavoz.com`, por nombre, parece categoría (A). **Sin verificar.**

---

## 2. El objetivo: comandiavoz.com

| Dato | Estado |
|---|---|
| Qué hace exactamente | ❌ No verificado (web ilegible desde la sesión) |
| Propuesta de valor / claims | ❌ No verificado |
| Funcionalidades | ❌ No verificado |
| Precios / planes | ❌ No verificado |
| Hardware e integraciones TPV | ❌ No verificado |
| Empresa / razón social / ubicación | ❌ No verificado |
| Nº de clientes / reseñas | ❌ No verificado |
| Marketing | 🟡 **Inferencia**: el `fbclid` del enlace confirma que se llegó vía clic en un anuncio/enlace de **Meta (Facebook/Instagram)**. Consistente con que hacen **paid social**. No confirmado en Meta Ad Library (bloqueada). |

> ⚠️ **No confundir con homónimos:** "Comandia POS" (comandiapos.com, POS
> mexicano) y "Comandos de Voz" (comandosdevoz.com, prompts de Alexa/ChatGPT)
> **no** son este producto.

**Cómo completar §2** (ver checklist §11): habilitar egress de red para
`comandiavoz.com` + Meta Ad Library, **o** pegar aquí el contenido de su home,
precios y features.

---

## 3. Competidores directos — categoría A (voz del camarero en sala)

**El nicho de ia.rest está poco poblado.** La voz *tableside* sigue siendo rara:
solo Veovox la tiene como núcleo; el resto la menciona como añadido.

- **Veovox (Suiza)** — el referente internacional más directo. El camarero lleva
  smartphone + auricular y toma la comanda "solo hablando"; el pedido reconocido
  se valida en pantalla y va en tiempo real al TPV y a cocina. También sin
  auricular, hablando a un "AudioBox" (altavoz industrial) para entornos
  ruidosos. QSR, full-service y drive-thru. *Precio no público.*
- **Storyous (chequo, opera en España)** — se anunció como "primer sistema de
  gestión para restauración con comandos de voz": comanda en 3 clics "o incluso
  por voz", directa a cocina/impresora. *Precio no público.*
- **Qamarero (España)** — all-in-one (TPV, comandero, carta digital, pedir y
  pagar, KDS). Han desplegado "toma de comandas por voz" + bot de reservas
  telefónicas. *Mecánica de la voz y precio no verificados.*
- **SmartBar (España)** — comanda desde el móvil junto al cliente "incluso por
  voz", licencias PDA ilimitadas. *No verificado en su propia web (403).*

> "Voiceomatic" (citado en el encargo) **no se encontró** en ninguna búsqueda —
> posible nombre inexacto o producto muy de nicho.

---

## 4. Mapa de precios del TPV de hostelería español

ia.rest compite también contra el TPV táctil estándar (la voz es el diferenciador).
Precios verificados vía agregadores (extractos de búsqueda; ver §10):

| Producto | Precio | Notas |
|---|---|---|
| **Glop** | Mini desde 199 € / Pro desde 399 € (licencia única) · o 19,90 €/mes | Modular, almacén |
| **Ágora** | desde 32 €/mes | Cloud, stock, comandas digitales |
| **Revo Xef** | XEF ONE ~49,90 €/mes; Plus 69,90 €/mes | iPad/Apple, gama alta |
| **Last.app** | Starter ~46-50 € / Growth ~87-95 € / Unlimited ~160-175 €/mes | TPV + reservas + delivery |
| **Tipsi / Miss Tipsi** | LITE desde 25 € / TPV desde 33,95 €/mes | +100 funcionalidades |
| **Cuiner** | bajo solicitud | KDS, CuinerPAY, reservas |
| **Bite Buddy** (voice-AI, ref. modelo) | **1,50 $/pedido completado** | Pay-per-order, categoría B |

**Lectura:** el mercado SaaS español está en **~25-95 €/mes por local** (o licencia
única ~200-400 € en Glop). ia.rest (59 € base + por usuario + 12 €/mesa QR) está
**en gama media-alta**: hay que justificar el premium con la voz + el stack vertical
(almacén, contabilidad, VeriFactu, eventos), no competir por precio.

---

## 5. Dolores del sector que justifican la venta (cuantificados)

- **Rotación de personal:** ~80% anual en restauración; 45% de operadores dicen
  no tener personal suficiente para la demanda.
- **Errores de comanda:** los sistemas automatizados reducen errores de pedido
  ~25% (Toast 2025); 81% de operadores planean ampliar IA en pedidos/reservas.
- **Velocidad / ROI del comandero:** estudio atribuido a Storyous — el comandero
  electrónico incrementa el volumen ~9% (hasta +20% en hora punta), reduce un 30%
  los pasos del camarero y ahorra hasta 45 min/servicio.
- **Adopción IA:** 82% de ejecutivos de restauración planean ampliar el uso de IA;
  2026/2027 descrito como el salto del "restaurante con IA" de novedad a necesidad.

> Estos datos son munición de **landing/blog** — pero recuerda la regla de ia.rest:
> NUNCA nombrar competidores en material público; usar "TPV convencional".

---

## 6. Normativa — VeriFactu / TicketBAI

> 🚨 **HALLAZGO ACCIONABLE: el calendario VeriFactu CAMBIÓ.** El maestro de
> ia.rest (`.claude/skills/ia-rest-maestro`, §VeriFactu) y la skill todavía dicen
> **sociedades 1-ene-2026 / autónomos 1-jul-2026**. Eso quedó **prorrogado un año**.

- **Real Decreto-ley 15/2025, de 2 de diciembre** (BOE 3-dic-2025) aplazó ambas
  fechas: **sociedades → 1-enero-2027**, **resto de obligados → 1-julio-2027**.
  Corroborado por la nota informativa AEAT "Ampliación del plazo de adaptación"
  (título confirmado; la página da 403 al fetch directo) y por fuentes secundarias.
- **VeriFactu** (RD 1007/2023): registro por factura, **hash encadenado** y **QR**
  verificable AEAT. Aplica en toda España **excepto País Vasco** (TicketBAI/LROE).
- **Sanciones:** hasta 50.000 €/ejercicio por software no certificado; hasta
  1.000 € por licencia no homologada; hasta 150.000 €/año a fabricantes que
  incumplan.

**Acción recomendada (no ejecutada aquí):** verificar la fecha en la sede oficial
de la AEAT y, si se confirma, actualizar la sección VeriFactu del maestro y de la
skill **antes** de usar "2026" en cualquier material comercial/legal. Sigue siendo
un **argumento de venta**: ia.rest ya trae VeriFactu encadenado nativo.

---

## 7. Battlecard — dónde gana ia.rest

Frente a un comandero por voz "puro" (que es lo que probablemente sea comandiavoz):

**Fortalezas de ia.rest (diferenciadores):**
- No es solo comanda por voz: es un **vertical completo** — Voice+Brain (PTT,
  few-shot por turno), KDS, turnos servicio+fichaje, QR de mesa, **almacén**
  (escandallos, recepción OCR, ciclo de compras), **contabilidad** (cierre diario,
  IVA 303, export A3/Sage/Holded), **VeriFactu nativo**, **eventos/catering**,
  CRM, analytics + agentes IA (Auto-Healer, QA, Lead Hunter…).
- **VeriFactu de serie** con hash SHA-256 encadenado y QR AEAT.
- **Cobro integrado** (Stripe Connect en LIVE; QR de mesa, propinas digitales).
- **Cocina central / catering** como modelo aparte (trazabilidad APPCC, materiales).
- Stack IA propio centralizado (`lib/ai-client.ts`) con pasarela de plataforma.

**Dónde nos pueden atacar (a vigilar en comandiavoz):**
- **Precio**: si comandiavoz es comanda-por-voz barata y simple, puede ganar al
  bar pequeño por coste/sencillez. ia.rest debe vender el stack, no el precio.
- **Time-to-value / onboarding**: un producto monofunción se instala en minutos.
- **Integración con el TPV ya instalado**: si comandiavoz se integra sobre Glop/
  Revo/Ágora, reduce fricción de cambio; ia.rest pide sustituir el TPV.
- **Precisión de la voz en ruido** y soporte multi-idioma de camareros.

---

## 8. Recomendaciones accionables para ia.rest

1. **Completar el perfil de comandiavoz** (ver §11) — sin eso, el battlecard es
   genérico. Es lo primero.
2. **Corregir el calendario VeriFactu** a 2027 en maestro/skill tras verificar en
   AEAT (§6). Riesgo legal/comercial si se comunica 2026.
3. **Mensaje comercial:** posicionar ia.rest como "no es un comandero, es tu
   restaurante entero por voz + IA" — apoyarse en los dolores cuantificados (§5)
   sin nombrar rivales (regla del proyecto).
4. **Defensa de precio:** preparar argumento de TCO (un solo sistema vs. TPV +
   comandero + facturación + contabilidad por separado).
5. **Vigilancia continua:** guardar el anuncio de Meta y revisar Meta Ad Library
   periódicamente para ver su gasto/creatividades.

---

## 9. Limitación de esta sesión

`WebFetch` devolvió **403 "Host not in allowlist"** para TODOS los hosts (incluida
Wikipedia) y `web.archive.org` está bloqueado: la política de red de este entorno
web no permite egress general. Para completar la parte de comandiavoz hace falta
**habilitar egress** (ver https://code.claude.com/docs/en/claude-code-on-the-web)
o **pegar el contenido** del sitio. La parte de mercado (§3-§6) se obtuvo por
`WebSearch` (US-only) a través de extractos.

---

## 10. Fuentes (mercado — verificado)

- Veovox: https://www.veovox.com/ · https://www.veovox.com/solutions-order-taking-full-service-restaurants
- Storyous (vía prensa): https://www.hosteltur.com/comunidad/nota/016274_storyous-primer-sistema-de-gestion-para-restauracion-que-incorpora-comandos-de-voz.html
- Qamarero: https://qamarero.com/ · https://qamarero.com/comandero-digital/
- SmartBar: https://smartbar.io/
- Precios TPV: https://www.glop.es/ · https://www.agorapos.com/ · https://revo.works/en/revoxef · https://www.last.app/precios · https://tipsitpv.com/ · https://cuiner.com/ · https://comparadortpv.es/
- Voice-AI (categoría B, referencia): https://bitebuddy.ai/blog/restaurant-voice-ai · https://foreva.ai/ · https://loman.ai/
- Dolores/tendencias: https://revmo.ai/restaurant-technology-ai-trends-2026/ · https://revmo.ai/blog/best-ai-voice-tools-for-restaurants-2025 · https://www.fsrmagazine.com/feature/the-2026-tech-forecast-why-voice-ai-will-become-mission-critical-for-independent-restaurants/
- IA en sala (España): https://ecoemprendedorxxi.es/inmersa360-lleva-la-inteligencia-artificial-a-la-mesa-del-restaurante/ · https://restauracionnews.com/2025/11/evolucion-tecnologica-restauracion/
- VeriFactu / aplazamiento 2027: nota AEAT "Ampliación del plazo de adaptación" (sede.agenciatributaria.gob.es) · https://guiafiscal.es/autonomos/verifactu-2026-guia/ · https://inza.blog/2025/12/04/modificacion-de-plazos-de-obligatoriedad-de-adopcion-de-verifactu/ · https://www.verifactu.com/verifactu-hosteleria/ · https://numier.com/verifactu/

---

## 11. Checklist de investigación pendiente (comandiavoz.com)

Rellenar cuando haya acceso web o contenido pegado:

- [ ] Qué hace exactamente y propuesta de valor (home)
- [ ] Lista completa de funcionalidades
- [ ] Precios / planes / coste de hardware / setup
- [ ] Hardware requerido e integraciones con TPV españoles
- [ ] Idiomas soportados y precisión de voz en ruido
- [ ] Empresa: razón social, fundadores, ubicación, año (aviso legal + Registro Mercantil)
- [ ] WHOIS/RDAP del dominio (fecha de registro, registrante)
- [ ] Reseñas, clientes, casos de uso, presencia en redes
- [ ] Meta Ad Library: campañas activas, gasto, creatividades
- [ ] Comparativa fila-a-fila ia.rest vs comandiavoz (cerrar §7)
