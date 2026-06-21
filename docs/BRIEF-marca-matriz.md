# Brief — Marca MATRIZ (casa de marcas)

> Documento de contexto para diseñar **nombre + identidad visual** de la marca matriz.
> Autocontenido: quien lo lea no conoce el proyecto. Mercado: **España, pymes**. Idioma: español
> (con proyección internacional). Fundador: **Alberto Suárez Gutiérrez**.

---

## 1. Qué es la matriz (el encargo en una frase)

Una **casa de marcas / fábrica de software vertical**: una empresa-estudio que **fabrica productos
SaaS para pymes españolas**, cada uno con su propia marca, montados sobre una **base común** (IA,
fiscalidad española, identidad/usuarios) y la **misma arquitectura**. La matriz es la **marca madre**
que está *por encima* de los productos: la firma del estudio ("una marca de ___", "powered by ___"),
no un producto en sí.

**Visión:** módulos **independientes y portables** (enchufables a cualquier producto) + una **raíz
común** (plantilla) + **verticales** con la misma estructura. "Fábrica de marcas".

**Posicionamiento:** software de gestión **IA-first**, **sin comisiones**, hecho para el pequeño
negocio español (cumple normativa local: VeriFactu/AEAT, RGPD). Pragmático, honesto, técnico pero
cercano.

---

## 2. Las verticales (los "hijos" que la matriz tiene que cobijar)

La matriz tiene que sentarse bien **encima de marcas muy distintas entre sí**. Estas son las actuales:

### 🍽️ ia.rest — Voice POS / hostelería
- **Qué:** software de gestión para **hostelería española**; estrella = **comanda por voz** con IA.
  "Sin comisión". Facturación legal (VeriFactu). Segmentos: Hostelería · Catering · Espacios.
- **Claim actual:** *"Facturar más no es ganar más. Ahora sí lo es."*
- **Identidad:** **tema oscuro** (casi negro) + acento **terracota/naranja**, tipografía **serif
  display** elegante (aire editorial/premium), cuerpo limpio. Logo lockup "ia·rest".
- **Dominio:** `iarest.es`. **Tono:** sofisticado, confiado, un punto disruptor.

### 🧽 ialimp — SaaS de limpiezas (pisos turísticos)
- **Qué:** SaaS **multi-tenant** para gestionar limpiezas de pisos turísticos (de la salida del
  huésped a la app de la limpiadora con checklist+fotos y la factura al propietario). **White-label**
  por empresa cliente.
- **Identidad:** **tema claro siempre**, acento **índigo** (`#4f46e5`/`#6366f1`, suaves `#eef2ff`),
  tipografía **Nunito** (redonda, amable, 800/900 en titulares). Logo "ia" índigo + "limp" oscuro.
- **Dominio:** `ialimp.es` / app en `app.ialimp.es`. Cliente piloto: **Sique Brilla** (white-label
  negro + dorado). **Tono:** limpio, eficiente, amable, operativo.

### 🏢 sivra — intranet de gestión de alquiler turístico
- **Qué:** intranet privada (tras login) para gestionar pisos turísticos en Sevilla: ingresos,
  gastos, **pricing dinámico**, mensajería con huéspedes, agente IA, coordinación de limpiadoras.
- **Identidad:** utilitaria, de panel/dashboard (no es marca de cara al público). **Tono:** interno,
  data-driven.

### 🏠 House Sevillana — landing de un alojamiento
- **Qué:** landing de **marketing** de un piso/alojamiento turístico (producto pequeño, de marca propia).

> **Lección de paleta para la matriz:** los hijos ya ocupan **terracota+negro** (ia.rest), **índigo
> claro** (ialimp) y **negro+dorado** (Sique Brilla, white-label). La matriz **no debe competir** con
> ninguna; mejor un territorio **neutro/atemporal** (tinta/grafito/hueso) o **un acento propio que no
> choque** con esos tres. Tiene que convivir como **sello/endoso**, a veces en pequeño (footers,
> "una marca de ___").

---

## 3. La base técnica (por qué esto es una "fábrica", no un holding cualquiera)

- **Monorepo** "casa de marcas": raíz = matriz; cada producto en `apps/<vertical>`; **módulos
  compartidos** en `packages/*`, portables y enchufables:
  - `core-ai` (núcleo de IA: cliente NVIDIA NIM, identity-agnostic),
  - `core-fiscal` (IVA universal + España/AEAT **VeriFactu**),
  - `core-identity` (contrato de sesión/inquilino, agnóstico del login).
- Stack: Next.js + React + TypeScript; IA vía **NVIDIA NIM** (texto + visión); Supabase/Postgres;
  despliegue en Vercel.
- Implicación de marca: la matriz vende **"productos verticales montados sobre una base de IA +
  fiscalidad española + identidad, reutilizable"**. Eso es lo diferencial y lo que el nombre/identidad
  pueden capturar: **fábrica/estudio de SaaS vertical con IA, para el negocio español**.
- *(Detalle menor para naming técnico:)* hoy el "scope" de paquetes es `@iarest/*` por herencia
  (ia.rest fue la raíz original); cuando exista la marca matriz, ese namespace podría renombrarse a la
  nueva marca. No condiciona el nombre, pero conviene saberlo.

---

## 4. El encargo a Claude Design

Diseñar la **marca matriz**:

1. **Nombre** (lo primero a estudiar): propuestas + razonamiento. Ver criterios abajo.
2. **Identidad visual:**
   - **Logotipo / símbolo** que funcione (a) **solo** (web del estudio) y (b) como **endoso** pequeño
     dentro de productos ("una marca de ___", badge de footer).
   - **Sistema de marca-madre + marcas-hijas:** cómo se relaciona visualmente la matriz con ia.rest,
     ialimp, etc. (¿endorsed brand? ¿branded house? ¿house of brands pura?). Recomendar arquitectura.
   - **Paleta** neutra/atemporal que conviva con terracota, índigo y negro+dorado (ver §2).
   - **Tipografía** (display + texto) coherente con un estudio técnico/sofisticado.
   - **Tono de voz** del estudio (la matriz habla como empresa, B2B; los productos hablan a su nicho).
3. **Aplicaciones mínimas:** favicon/avatar, firma de email, badge "powered by", portada web del estudio.

---

## 5. Criterios de naming

- **No atado a una vertical** (ni hostelería, ni limpieza, ni alquiler). Paraguas.
- **Corto, pronunciable y memorable** en **español e inglés**.
- **Dominio** disponible (idealmente `.com`; `.es`/`.io`/`.ai` aceptables). Comprobar antes de enamorarse.
- **Sin colisión fonética/visual** con los hijos (`ia.rest`, `ialimp`) para no confundir matriz↔producto.
- **Que evoque** alguno de estos territorios (a elegir/combinar): *fábrica/casa/estudio de marcas*,
  *base/raíz/núcleo común*, *IA aplicada al negocio real*, *software español para pymes*, *oficio +
  tecnología*. Evitar genéricos saturados ("…Labs", "…Tech", "…Soft") salvo que aporten algo.
- **Escalable:** debe servir si mañana hay 8 verticales en otros sectores (no solo turismo/hostelería).

---

## 6. Datos prácticos

- **Mercado:** España, pymes y micropymes (hostelería, limpieza, alquiler turístico… ampliable).
- **Diferenciales reales:** IA aplicada (voz, visión, agentes), **sin comisiones**, **cumplimiento
  español de serie** (VeriFactu/AEAT, RGPD), white-label, móvil-primero donde toca.
- **Fundador:** Alberto Suárez Gutiérrez (responsable también del tratamiento RGPD actual).
- **Activos de marca ya existentes a respetar (no rediseñar aquí):** ia.rest (terracota/negro/serif),
  ialimp (índigo/Nunito/claro), Sique Brilla (negro/dorado, white-label de ialimp).

---

### Resumen para empezar a pensar
Necesito **nombre + identidad de la marca madre** de un **estudio español que fabrica SaaS verticales
con IA y fiscalidad española de serie**. Debe **cobijar marcas muy distintas** (hostelería premium en
terracota/negro, limpieza en índigo amable, alquiler turístico) sin competir con ellas, funcionar como
**sello/endoso** y como marca propia, y **escalar** a nuevos sectores. Empieza por el **nombre**
(con dominios comprobados) y propón la **arquitectura de marca** (cómo se relaciona la matriz con sus
verticales).
