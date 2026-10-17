# Grupo ASegura: paquete de alta en directorios de corredurías

Borrador para Alberto. Nada de esto está enviado ni registrado. Los datos salen del código (fuente única).

## 1. Datos NAP (copiar exactos, iguales en todos los sitios)

| Campo | Valor | Origen |
|---|---|---|
| Nombre comercial | Grupo ASegura | `packages/module-seguros/src/mediador.ts:98` |
| Corredor responsable | Alberto Suárez Gutiérrez (NIF 28823484E) | `mediador.ts:100-101` |
| Dirección | San Juan de La Palma, nº 28, 41003 Sevilla | `mediador.ts:105` |
| Teléfono | +34 637 349 990 (formato E.164: +34637349990) | `mediador.ts:134`, `telefonoLegible()` |
| Email | hola@grupoasegura.es | `mediador.ts:119` |
| Web | https://grupoasegura.es | `apps/asegura-web/lib/sitio.ts:33` |
| Clave DGSFP | CS-F/0170 | `mediador.ts:104` |
| Horario | Lunes a viernes, de 9:00 a 18:00 (sin pausa) | `apps/asegura-web/lib/sitio.ts:276-279` |
| Coordenadas (pin Maps) | 37.3948384, -5.9904272 | `sitio.ts:145` |

**PENDIENTE (Alberto):**
- Horario en la ficha de Google Business: en el código consta que el perfil no lo tenía (`sitio.ts:270-271`). Confirmar que ya está publicado.

**Resuelto (Alberto, 17/10/2026):** el email público único es hola@grupoasegura.es y el móvil público es 637 349 990 (`mediador.ts`). `info@grupoasegura.es` ya no se publica.

## 2. Textos

**Corta (155 caracteres):**
> Grupo ASegura, correduría inscrita en la DGSFP (CS-F/0170), en Sevilla. Comparamos varias compañías para hogar, comunidad, comercio, auto, vida y salud.

**Larga (627 caracteres):**
> Grupo ASegura es una correduría de seguros inscrita en el Registro administrativo de distribuidores de seguros de la DGSFP con la clave CS-F/0170. Tiene su domicilio en Sevilla y media en toda España. Al ser correduría trabajamos con varias compañías: comparamos sus coberturas y precios para el seguro de hogar, comunidad de propietarios, comercio y empresa, auto y moto, vida y salud, y te explicamos qué cubre cada opción y en qué se diferencian. Atendemos por teléfono, WhatsApp y correo electrónico, de lunes a viernes de 9:00 a 18:00. Los clientes tienen un área privada donde consultar y guardar sus pólizas.

Base: `apps/asegura-web/app/page.tsx:20` y `:191`, y `app/layout.tsx:104`. No hay promesas de ahorro ni superlativos.

## 3. Categorías sugeridas

- Principal: «Correduría de seguros» (en Google, «Insurance agency» si la lista no tiene la de correduría; confirmar al dar de alta).
- Secundarias: «Agente de seguros», «Asesoría de seguros».
- Servicios: seguro de hogar, comunidades de propietarios, comercios, auto y moto, vida y salud, decesos, responsabilidad civil.

## 4. Directorios

| Directorio | URL de alta | Gratis | Estado |
|---|---|---|---|
| correduriadeseguros.net | buscar | ? | pendiente |
| qdq.com | buscar | ? | pendiente |
| prontopro.es | buscar | ? | pendiente |
| Google Business Profile | business.google.com (verificar) | sí | pendiente |
| Páginas Amarillas | buscar | ? | pendiente |
| Registro DGSFP (solo comprobar la ficha) | buscar en dgsfp.mineco.gob.es | ? | pendiente |
| Colegio de mediadores de Sevilla | buscar | ? | pendiente |

Para el registro de la DGSFP no se da de alta nada: solo se comprueba que la clave CS-F/0170, el nombre y el domicilio coinciden con lo de la tabla de la sección 1.

## 5. Reglas

- **Consistencia NAP:** mismo nombre, dirección, teléfono y horario, escritos igual, en todos los directorios. Si uno cambia, se cambian todos.
- **Enlace a la web con atribución:** cada ficha enlaza a la web con su propio utm, que `apps/asegura-web/lib/atribucion.ts` captura (`utm_source`, `utm_medium`):
  - correduriadeseguros.net: `https://grupoasegura.es/?utm_source=correduriadeseguros&utm_medium=directorio`
  - qdq.com: `https://grupoasegura.es/?utm_source=qdq&utm_medium=directorio`
  - prontopro.es: `https://grupoasegura.es/?utm_source=prontopro&utm_medium=directorio`
  - Google Business Profile: `https://grupoasegura.es/?utm_source=google-business&utm_medium=directorio`
  - Páginas Amarillas: `https://grupoasegura.es/?utm_source=paginasamarillas&utm_medium=directorio`
  - Colegio de mediadores: `https://grupoasegura.es/?utm_source=colegio-mediadores-sevilla&utm_medium=directorio`
- **Sin envíos:** nada de esto se manda ni se registra sin el OK de Alberto para cada alta.
