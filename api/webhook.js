import { webhookHandler } from './_lib/webhook.js';
import { db } from './_lib/db.js';
import { obtenerPago } from './_lib/mp.js';

export default webhookHandler({ db, obtenerPago, env: process.env });
