import { randomUUID } from 'node:crypto';

// Tipos permitidos (extension -> tipo MIME). El bucket repite estas reglas en supabase/storage.sql.
export const TIPOS = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
};
export const MAX_BYTES = 20 * 1024 * 1024; // 20 MB, como dice la pagina
export const BUCKET = 'archivos';

/** Deja solo letras, numeros, punto, guion y guion bajo; conserva la extension; maximo 80 caracteres. */
export function nombreSeguro(nombre) {
  const base = String(nombre).split(/[\\/]/).pop().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const punto = base.lastIndexOf('.');
  const ext = punto > 0 ? base.slice(punto + 1).toLowerCase().replace(/[^a-z0-9]/g, '') : '';
  const raiz = (punto > 0 ? base.slice(0, punto) : base)
    .replace(/[^A-Za-z0-9_-]+/g, '_')
    .replace(/^[_-]+|[_-]+$/g, '')
    .slice(0, 70);
  return `${raiz || 'archivo'}${ext ? '.' + ext : ''}`;
}

/**
 * POST /api/subir-archivo
 * Recibe { nombre, tipo, tamano } (NO el archivo). Valida y devuelve una URL firmada de subida directa
 * a Supabase Storage (vale 2 horas y solo sirve para esa ruta). Asi el archivo no pasa por Vercel
 * (limite de 4,5 MB por pedido) y la clave secreta nunca llega al navegador.
 */
export function subirArchivoHandler({ storage }) {
  return async function handler(req, res) {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return res.status(405).json({ error: 'Metodo no permitido' });
    }

    const { nombre, tipo, tamano } = req.body ?? {};
    if (typeof nombre !== 'string' || !nombre.trim()) {
      return res.status(400).json({ error: 'Falta el nombre del archivo' });
    }
    const seguro = nombreSeguro(nombre);
    const ext = seguro.includes('.') ? seguro.split('.').pop() : '';
    if (!Object.hasOwn(TIPOS, ext)) {
      return res.status(400).json({ error: 'Formato no permitido. Usá .pdf, .doc, .docx, .jpg o .png' });
    }
    if (tipo && tipo !== TIPOS[ext]) {
      return res.status(400).json({ error: 'El tipo de archivo no coincide con su extensión' });
    }
    if (!Number.isInteger(tamano) || tamano < 1 || tamano > MAX_BYTES) {
      return res.status(400).json({ error: 'El archivo debe pesar hasta 20 MB' });
    }

    const path = `pendientes/${randomUUID()}/${seguro}`;
    const { data, error } = await storage().createSignedUploadUrl(path);
    if (error || !data?.signedUrl) {
      console.error('No se pudo crear la URL de subida:', error?.message);
      return res.status(500).json({ error: 'No se pudo preparar la subida. Probá de nuevo.' });
    }
    return res.status(200).json({ path, url: data.signedUrl });
  };
}
