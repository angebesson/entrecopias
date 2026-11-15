import { createHmac, timingSafeEqual } from 'node:crypto';

// Verificacion de la firma de los avisos (webhooks) de Mercado Pago.
// Segun la documentacion oficial: header x-signature = "ts=...,v1=..."; se firma
// "id:<data.id en minuscula>;request-id:<x-request-id>;ts:<ts>;" con HMAC-SHA256.

export function firmar({ requestId, dataId, ts, secreto }) {
  const manifiesto = `id:${String(dataId).toLowerCase()};request-id:${requestId};ts:${ts};`;
  return createHmac('sha256', secreto).update(manifiesto).digest('hex');
}

export function verificarFirma({ firma, requestId, dataId, secreto, ahora = Date.now(), toleranciaSeg = 300 }) {
  if (!firma || !requestId || !dataId || !secreto) return false;

  const partes = new Map();
  for (const p of String(firma).split(',')) {
    const [k, ...v] = p.split('=');
    if (k && v.length) partes.set(k.trim(), v.join('=').trim());
  }
  const ts = partes.get('ts');
  const v1 = partes.get('v1');
  if (!ts || !v1 || !/^\d+$/.test(ts) || !/^[0-9a-f]+$/i.test(v1)) return false;

  const ms = Number(ts) > 1e12 ? Number(ts) : Number(ts) * 1000; // MP mando ts en segundos y en ms
  if (Math.abs(ahora - ms) > toleranciaSeg * 1000) return false;

  const esperado = Buffer.from(firmar({ requestId, dataId, ts, secreto }), 'hex');
  const recibido = Buffer.from(v1, 'hex');
  return esperado.length === recibido.length && timingSafeEqual(esperado, recibido);
}
