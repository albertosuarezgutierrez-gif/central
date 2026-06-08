/**
 * ROI Intranet — Google Apps Script
 * Web App para subir facturas/recibos a Google Drive desde Vercel
 *
 * SETUP:
 * 1. Abre script.google.com → Nuevo proyecto → pega este código
 * 2. Edita FOLDER_ID con el ID de tu carpeta "Facturas Bercell" en Drive
 * 3. Implementar → Nueva implementación → Web app
 *    - Ejecutar como: Yo (tu cuenta Google)
 *    - Acceso: Cualquier persona (Anyone)
 * 4. Copia la URL de implementación → Vercel env: DRIVE_SCRIPT_URL=<url>
 */

// ── CONFIGURACIÓN ──────────────────────────────────────────────────────────────
const ROOT_FOLDER_ID = "REEMPLAZA_CON_ID_CARPETA_DRIVE"; // p.ej: "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms"
const SUBFOLDER_BY_YEAR = true;   // Crea subcarpetas por año: 2026/, 2025/...
const SUBFOLDER_BY_MONTH = true;  // Crea subcarpetas por mes: 01-Enero/, etc.

const MONTH_NAMES = [
  "01-Enero","02-Febrero","03-Marzo","04-Abril","05-Mayo","06-Junio",
  "07-Julio","08-Agosto","09-Septiembre","10-Octubre","11-Noviembre","12-Diciembre"
];

// ── HANDLER PRINCIPAL ──────────────────────────────────────────────────────────
function doPost(e) {
  try {
    // CORS preflight
    const output = ContentService.createTextOutput();
    output.setMimeType(ContentService.MimeType.JSON);

    const data = JSON.parse(e.postData.contents);
    const { fileBase64, fileName, mimeType, fecha } = data;

    if (!fileBase64 || !fileName) {
      output.setContent(JSON.stringify({ ok: false, error: "Faltan campos: fileBase64 o fileName" }));
      return output;
    }

    // Determinar carpeta destino
    const rootFolder = DriveApp.getFolderById(ROOT_FOLDER_ID);
    let targetFolder = rootFolder;

    if (fecha) {
      const d = new Date(fecha);
      const year = d.getFullYear().toString();
      const monthIdx = d.getMonth(); // 0-based

      if (SUBFOLDER_BY_YEAR) {
        targetFolder = getOrCreateSubfolder(targetFolder, year);
      }
      if (SUBFOLDER_BY_MONTH) {
        targetFolder = getOrCreateSubfolder(targetFolder, MONTH_NAMES[monthIdx]);
      }
    }

    // Crear archivo en Drive
    const bytes = Utilities.base64Decode(fileBase64);
    const blob = Utilities.newBlob(bytes, mimeType || "application/pdf", fileName);
    const file = targetFolder.createFile(blob);

    // Hacer el archivo accesible con link
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

    output.setContent(JSON.stringify({
      ok: true,
      fileId: file.getId(),
      url: file.getUrl(),
      carpeta: targetFolder.getName(),
      nombre: file.getName(),
    }));
    return output;

  } catch (err) {
    const output = ContentService.createTextOutput();
    output.setMimeType(ContentService.MimeType.JSON);
    output.setContent(JSON.stringify({ ok: false, error: err.toString() }));
    return output;
  }
}

// Permite testear desde el navegador
function doGet(e) {
  const output = ContentService.createTextOutput();
  output.setMimeType(ContentService.MimeType.JSON);
  output.setContent(JSON.stringify({ ok: true, status: "ROI Drive Upload Script activo" }));
  return output;
}

// ── HELPERS ────────────────────────────────────────────────────────────────────
function getOrCreateSubfolder(parent, name) {
  const existing = parent.getFoldersByName(name);
  if (existing.hasNext()) return existing.next();
  return parent.createFolder(name);
}
