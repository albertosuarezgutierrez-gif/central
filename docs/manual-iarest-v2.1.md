# ia.rest — Manual de usuario y cuenta DEMO

**TPV con Inteligencia Artificial para Restaurantes**  
Manual de usuario · Cuenta de prueba DEMO  
Mayo 2026 · v2.1 · Next.js 16 · Supabase · Vercel · Whisper + Claude

---

## 1. Acceso al sistema

ia.rest funciona como PWA (Progressive Web App) — se abre en el navegador y se puede instalar en móvil o tablet como app nativa. Sin descargas obligatorias, sin tiendas de apps. También disponible como **APK Android nativa** con PTT físico y notificaciones completas.

### 1.1 URLs del proyecto

| Recurso | URL |
|---|---|
| **App principal (TPV)** | https://www.iarest.es |
| **Documentación** | https://ia-rest-docs.vercel.app |
| **Login directo DEMO** | https://www.iarest.es/login?t=62d3124f5185d326ba0e5632 |
| **APK Android** | https://www.iarest.es/app (auto-update via version.json) |

### 1.2 Cuenta de prueba DEMO

Usa el enlace directo DEMO para acceder al restaurante de prueba. Todos los datos son ficticios, seguros para explorar sin riesgo.

#### Usuarios disponibles

| Rol | PIN | Pantalla de acceso |
|---|---|---|
| 🔑 **Super Admin** | 9999 | Todo el sistema (`/super`) |
| 👑 **Owner** | 1369 | Panel gestión (`/owner`) + sala |
| 🛠️ **Jefe de sala** | 2566 | Cuadro de mando sala (`/jefe`) |
| 🍽️ **Camarero** | 7672 | Sala TPV (`/edge`) |
| 👨‍🍳 **Cocina** | 3297 | KDS cocina (`/kds`) |
| 🏃 **Running** | 5310 | Vista running (`/running`) |

> 🎤 **Login por voz** — Mantén pulsado el micrófono en la pantalla de login y di tu nombre. Whisper te identifica automáticamente (confianza >60%). Si no, muestra lista para elegir manualmente.

---

## 2. Carta del restaurante DEMO

36 productos pre-cargados en 6 categorías. Los más relevantes para probar el sistema:

### Entrantes

| Producto | Precio · Alérgenos |
|---|---|
| Patatas bravas | 6,50 € · sin alérgenos |
| Croquetas caseras | 7,00 € · ⚠ GLUTEN |
| Jamón ibérico | 14,00 € |
| Tabla de quesos | 12,00 € · ⚠ LÁCTEOS |

### Principales

| Producto | Precio · Alérgenos |
|---|---|
| Entrecot a la brasa | 22,00 € |
| Merluza a la plancha | 18,00 € · ⚠ PESCADO |
| Paella valenciana | 16,00 € · ⚠ MARISCO |

### Bebidas con formatos

| Producto | Formatos disponibles |
|---|---|
| Cerveza | Caña 2,50 € · Mediana 3,00 € |
| Vino | Copa 3,50 € · Botella 18,00 € |
| Agua mineral | 2,00 € |

> ⚠️ **Prueba de alérgenos** — Ve a una mesa → pulsa ALERG → activa Gluten → di "una ración de croquetas". El sistema avisa del conflicto ANTES de confirmar la comanda.

---

## 3. Roles y pantallas

### 3.1 Camarero — `/edge`

Pantalla principal del camarero. Diseñada para usarse con una mano en el móvil mientras se lleva algo en la otra.

#### Flujo de voz — el modo estrella

1. Pulsa y mantén el botón PTT (Push-to-Talk) grande
2. Habla: *"dos cañas y una ensalada a la mesa cuatro"*
3. Suelta — Whisper (Groq) transcribe en <1 segundo
4. Claude (BRAIN) interpreta y muestra la comanda
5. El sistema la lee en voz alta (TTS, es-ES) — confirma o corrige
6. Pulsa CONFIRMAR — va a cocina, sigues con la siguiente mesa

#### Comandos de voz reconocidos

| Tipo | Ejemplo |
|---|---|
| Pedido simple | *"Una caña a la T01"* |
| Pedido múltiple | *"Tres cañas, dos vinos y una agua a la cuatro"* |
| Con formato | *"Una media ración de jamón y una ración de patatas"* |
| Con nota | *"Un entrecot muy hecho sin sal a la seis"* |
| Pedir cuenta | *"Cuenta a la mesa tres"* |
| Marcar 86 | *"86 la paella"* — marca producto agotado |
| Marchar mesa | *"Mesa cuatro lista para marchar"* |

#### Botones del header

- **VOX ON/OFF** — activa/desactiva la lectura TTS de confirmación
- **ALERG** — declara los 14 alérgenos EU del cliente en esa mesa
- **MANUAL / VOZ** — cambia entre modo PTT y carta táctil

---

### 3.2 Cocina (KDS) — `/kds`

Pantalla para el personal de cocina. Alta legibilidad, se actualiza en tiempo real sin recargar. Diseñada para leer desde 3 metros.

#### Tabs disponibles

- **Por sección** — cada partida tiene su tab (Cocina caliente, Fría, Barra...)
- **PASE** — vista del jefe de pase: todas las mesas activas a la vez
- **PROD** — All-Day view: contador grande de unidades pendientes por producto

#### Acciones

- **Toca un ítem** — toggle listo/pendiente
- **Botón MARCHAR verde** — cierra la comanda y manda push al camarero asignado
- **Confirmación por voz** — di *"listo la cuatro"* o *"mesa 4 pasa"* con el PTT

> 👨‍🍳 **Login cocina** — PIN 3297 → redirige al KDS filtrado por Cocina caliente. Jefe de sala (PIN 2566) ve todas las secciones.

---

### 3.3 Jefe de sala — `/jefe`

Cuadro de mando de solo lectura con visión global de sala, estado de todas las mesas y mensajería interna. Diseñado para gestionar el servicio sin interferir en el flujo del camarero.

---

### 3.4 Panel Owner — `/owner`

Panel de gestión completo del restaurante. Accesible con rol owner.

| Tab | Qué puedes hacer |
|---|---|
| **Carta** | Ver, editar y añadir productos. Importar carta desde foto (IA) |
| **Mesas** | Gestionar mesas, zonas, capacidades y estados |
| **Personal** | Crear camareros, asignar roles y secciones. QR de acceso camarero |
| **Secciones** | Gestionar partidas del KDS |
| **Impresoras** | Configurar CloudPRNT o IP local |
| **Facturas** | Ver facturas Verifactu con hash SHA-256 y QR AEAT |
| **Restaurante** | NIF, razón social y datos para Verifactu |
| **Config QR** | Gestión add-on QR en mesa (+12 €/mesa/mes) |
| **Alertas** | 7 reglas de alerta pre-configuradas, logs, notificaciones |

> 📸 **Importar carta con IA** — Carta → Importar desde foto. Sube una foto de tu carta en papel, Claude la lee y carga todos los productos automáticamente con nombre, precio y categoría. Solo revisar y confirmar.

---

### 3.5 Super Admin — `/super`

Acceso exclusivo del administrador del sistema. Requiere URL de shield con cookie de 8h. Permite gestión de todos los restaurantes, clientes, sugerencias y datos de entrenamiento IA.

---

## 4. Funcionalidades avanzadas

### 4.1 Sistema 86 — producto agotado

El 86 avisa al camarero en tiempo real si un producto está agotado, antes de confirmar la comanda.

- Di *"86 la paella"* — se marca agotada en el turno activo
- Cualquier comanda posterior con paella recibe AVISO antes de confirmar
- El ítem aparece tachado en rojo en la pantalla de confirmación

### 4.2 Alérgenos EU 1169/2011

Trazabilidad legal completa de alérgenos con log automático en BD. Cumple el Reglamento europeo.

1. Camarero pulsa ALERG → panel de los 14 alérgenos EU
2. Activa alérgenos del cliente (ej: Gluten)
3. Al dictar comanda, el sistema cruza con alérgenos del producto
4. Si hay conflicto → TTS *"Alérgeno detectado: Croquetas contiene gluten"*
5. Banner ámbar en pantalla de confirmación
6. Registro en `alergeno_confirmaciones` (trazabilidad legal con timestamp)

> 📋 **Los 14 alérgenos EU** — Gluten · Crustáceos · Huevo · Pescado · Cacahuetes · Soja · Lácteos · Frutos de cáscara · Apio · Mostaza · Sésamo · Dióxido de azufre · Altramuces · Moluscos. Conforme al Reglamento (UE) 1169/2011.

### 4.3 Verifactu — facturación legal ✅

Genera facturas con hash encadenado SHA-256 y QR de la AEAT. **Activo en producción** y conforme con la normativa española vigente desde 2026.

- Camarero dice *"Cuenta a la mesa cuatro"* o pulsa el botón de cuenta
- El sistema genera la factura con hash y QR automáticamente
- La factura queda en `/owner → Facturas` con trazabilidad completa

Para usar Verifactu configura NIF y Razón Social en `/owner → Restaurante`.

### 4.4 Motor de Flujos v2

Sistema avanzado de enrutado de comandas a impresoras y KDS.

- **Reglas de envío** — configura qué productos van a qué impresora/sección
- **Horarios** — reglas con time slots (ej: desayunos a barra, comidas a cocina)
- **Multi-sección** — un ítem puede ir a varias secciones simultáneamente
- **Fallback de impresora** — si la principal falla, reintenta en la de respaldo
- **Pase al marchar** — notificación automática al jefe de pase cuando se marca lista una comanda

### 4.5 QR en mesa — add-on

Los clientes pueden ver la carta, hacer pedidos y pagar directamente desde su móvil escaneando el QR de la mesa. Sin app, sin registro.

- **+12 €/mesa/mes** (add-on sobre el plan base)
- Configuración en `/owner → Config QR`
- Modos disponibles: solo carta, pedido + pago opcional, menú cerrado con precio mínimo por persona
- Split de cuenta entre comensales integrado
- Llamada al camarero desde el QR

### 4.6 Notificaciones push PWA

Cuando cocina marca una mesa como lista, el camarero asignado recibe push en su móvil aunque la pantalla esté apagada.

1. Entra en `/edge` con el camarero
2. El navegador pide permiso para notificaciones — acepta
3. Desde ese momento recibes alertas de cocina en tiempo real

### 4.7 Alertas de ritmo de servicio

El sistema monitoriza el ritmo del servicio y envía alertas automáticas:

- 7 reglas pre-configuradas por restaurante nuevo
- Cron cada 2 minutos comprobando métricas
- Alertas vía push, TTS y panel `/jefe`
- Ejemplos: mesa con comanda abierta >X minutos, tickets/hora por debajo del umbral, impresora sin respuesta

---

## 5. Guía de prueba completa — 15 minutos

Abre 3 pestañas y sigue este flujo para probar el 100% del sistema:

> 🖥️ **Setup inicial — 3 pestañas**  
> Pestaña 1: Camarero (PIN 7672) · Pestaña 2: Cocina (PIN 3297) · Pestaña 3: Owner (PIN 1369)  
> Todas en https://www.iarest.es/login?t=62d3124f5185d326ba0e5632

**PASO 1 — Primera comanda por voz**
- Pestaña camarero → PTT → di: *"dos cañas y unas patatas bravas a la S01"*
- Escucha la confirmación en voz alta (TTS)
- Pulsa CONFIRMAR
- Pestaña cocina → verás la comanda aparecer en tiempo real

**PASO 2 — Cocina marca listo**
- Pestaña cocina → toca cada ítem para marcarlo listo
- Pulsa MARCHAR cuando todo esté preparado
- El camarero recibe notificación push en el móvil

**PASO 3 — Prueba de alérgenos**
- Pestaña camarero → botón ALERG → activa "Gluten"
- PTT → di: *"una ración de croquetas a la S01"*
- Escucha: *"Alérgeno detectado: Croquetas caseras contiene gluten"*
- Observa el banner ámbar en la pantalla de confirmación

**PASO 4 — Prueba del sistema 86**
- PTT → di: *"86 la paella"*
- PTT → di: *"una paella a la S02"*
- El sistema avisa que está agotada antes de confirmar

**PASO 5 — Modo manual (táctil)**
- Header → botón MANUAL
- Selecciona una mesa del grid visual de zonas
- Toca productos de la carta táctil PDA-style
- Confirma la comanda

**PASO 6 — KDS vistas PASE y PROD**
- Pestaña cocina → tab PASE: todas las mesas activas con barras de progreso
- Tab PROD: contador de unidades pendientes por producto (All-Day View)

**PASO 7 — Confirmación por voz en cocina**
- Pestaña cocina con una comanda activa
- Mantén PTT y di: *"listo la uno"*
- El sistema marca ítems automáticamente y manda push al camarero

**PASO 8 — Panel owner**
- `/owner` → revisa la carta de 36 productos
- Añade un producto manualmente
- Tab Facturas → ver facturas Verifactu con QR AEAT
- Tab Config QR → explorar configuración del add-on QR

---

## 6. Mesas y secciones DEMO

### 6.1 Distribución de mesas

12 mesas en 3 zonas. Todas libres y listas para probar.

| Zona | Mesas |
|---|---|
| **Salón interior** | S01 – S06 |
| **Terraza** | T01 – T03 |
| **Barra** | B01 – B03 |

### 6.2 Secciones de cocina

El KDS filtra por sección. Cada cocinero ve solo su partida.

| ID | Nombre |
|---|---|
| `calientes` | Cocina caliente |
| `frios` | Cocina fría |
| `barra` | Barra |
| `postres` | Postres |
| `sala` | Sala |

---

## 7. Precios y planes

ia.rest usa **pricing por usuario** — pagas solo por los camareros activos que necesitas. Sin planes fijos, sin límite de mesas, sin comisión por transacción.

| Usuarios (camarero + cocina + jefe de sala) | Precio/mes |
|---|---|
| Base | 59 € |
| Usuarios 2 – 6 | +20 €/usuario |
| Usuarios 7 en adelante | +15 €/usuario |

**Ejemplos:** 1 usuario = 59 € · 3 usuarios = 99 € · 6 usuarios = 159 €

- **Trial de 14 días** — sin tarjeta de crédito
- **Descuento anual** — 18% menos pagando el año completo
- **Add-on QR en mesa** — +12 €/mesa/mes
- **Sin comisión** por pedido ni por transacción

> La competencia cobra desde 99,99 €/mes independientemente del tamaño del equipo.

---

## 8. Hardware recomendado

### Terminal camarero — Samsung Galaxy A15 5G

| Especificación | Detalle |
|---|---|
| Pantalla | 6,5″ Super AMOLED (visible en terraza) |
| Batería | 5.000 mAh — turno completo sin cargar |
| Conectividad | 5G + Wi-Fi 5 + NFC |
| Resistencia | IP54 — salpicaduras sin problema |
| Precio orientativo | 180–220 € (mayo 2026) |

### Impresora de tickets

Compatible con cualquier impresora ESC/POS por TCP/IP (red local) o CloudPRNT (Star).

### Bridge local (impresión en red local)

Si la impresora no tiene conexión directa a internet, ia.rest incluye un agente bridge que puede correr en:
- **Android con Termux** — coste 0 €
- **PC de caja existente** — coste 0 €
- **Raspberry Pi Zero 2W** — ~25 €

### MDM (gestión de flota)

Para bloquear el terminal en modo kiosco y gestionar la flota remotamente: **Esper.io** (desde 3 €/dispositivo/mes) o **Miradore** (plan gratuito disponible).

---

## 9. Glosario

| Término | Significado |
|---|---|
| **PTT** | Push-to-Talk — botón de grabación de voz |
| **BRAIN** | Modelo Claude de Anthropic — interpreta las comandas |
| **EAR** | Whisper de Groq — transcripción de voz a texto |
| **TTS** | Text-to-Speech — el sistema lee la comanda en voz alta |
| **KDS** | Kitchen Display System — pantalla de cocina |
| **PASE** | Vista del jefe de pase: todas las mesas activas |
| **PROD** | All-Day view: contador de unidades pendientes por producto |
| **86** | Producto agotado en el turno actual |
| **Verifactu** | Estándar de facturación con hash SHA-256 (España, 2026) |
| **Motor de Flujos** | Sistema de reglas que decide a dónde va cada comanda |
| **Bridge** | Agente local que conecta ia.rest con impresoras físicas |
| **Multi-tenant** | Un sistema, múltiples restaurantes aislados |
| **RLS** | Row Level Security — aislamiento de datos en Supabase |
| **CloudPRNT** | Protocolo Star para impresoras de tickets en la nube |

---

## 10. Contacto y soporte

| Recurso | Enlace / Dato |
|---|---|
| **App** | https://www.iarest.es |
| **Docs** | https://ia-rest-docs.vercel.app |
| **GitHub** | github.com/albertosuarezgutierrez-gif/ia.rest |
| **Email** | alberto.suarez.gutierrez@gmail.com |

> 📌 **Nota sobre la cuenta DEMO** — Los datos del DEMO pueden resetearse periódicamente. Para un tenant propio con tus datos reales, contacta para dar de alta un nuevo restaurante en el sistema.

---

*www.iarest.es · Mayo 2026 · v2.1*
