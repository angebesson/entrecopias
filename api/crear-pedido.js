import { crearPedidoHandler } from './_lib/crear-pedido.js';
import { db, storage } from './_lib/db.js';
import { crearPreferencia } from './_lib/mp.js';

async function archivoExiste(ruta) {
  const { data, error } = await storage().exists(ruta);
  if (error && data !== false) throw error;
  return data === true;
}

export default crearPedidoHandler({ db, crearPreferencia, archivoExiste, env: process.env });
