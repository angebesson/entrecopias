import { createClient } from '@supabase/supabase-js';
import { BUCKET } from './subir-archivo.js';

let cliente;
/** Cliente de Supabase con la service key (solo servidor). La tabla tiene RLS activado y sin politicas. */
export function db() {
  if (!cliente) {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
      throw new Error('Faltan SUPABASE_URL o SUPABASE_SERVICE_KEY');
    }
    cliente = createClient(new URL(process.env.SUPABASE_URL.trim()).origin, process.env.SUPABASE_SERVICE_KEY.trim(), {
      auth: { persistSession: false },
    });
  }
  return cliente;
}

/** Bucket privado de archivos (solo accesible con la service key, desde el servidor). */
export function storage() {
  return db().storage.from(BUCKET);
}
