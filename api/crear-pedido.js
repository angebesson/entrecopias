import { crearPedidoHandler } from './_lib/crear-pedido.js';
import { db } from './_lib/db.js';
import { crearPreferencia } from './_lib/mp.js';

export default crearPedidoHandler({ db, crearPreferencia, env: process.env });
