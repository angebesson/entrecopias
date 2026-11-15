import test from 'node:test';
import assert from 'node:assert/strict';
import { firmar, verificarFirma } from '../api/_lib/firma.js';

const secreto = 'secreto-de-prueba';
const ahora = Date.UTC(2026, 10, 15, 12, 0, 0);
const ts = String(ahora);
const base = { requestId: 'req-123', dataId: 'ABC123', secreto, ahora };

test('acepta una firma valida (id en mayuscula se pasa a minuscula)', () => {
  const v1 = firmar({ requestId: 'req-123', dataId: 'abc123', ts, secreto });
  assert.equal(verificarFirma({ ...base, firma: `ts=${ts},v1=${v1}` }), true);
});

test('rechaza secreto distinto, id distinto y firma ausente o mal formada', () => {
  const v1 = firmar({ requestId: 'req-123', dataId: 'abc123', ts, secreto });
  const firma = `ts=${ts},v1=${v1}`;
  assert.equal(verificarFirma({ ...base, firma, secreto: 'otro' }), false);
  assert.equal(verificarFirma({ ...base, firma, dataId: '999' }), false);
  assert.equal(verificarFirma({ ...base, firma, requestId: 'otro' }), false);
  assert.equal(verificarFirma({ ...base, firma: undefined }), false);
  assert.equal(verificarFirma({ ...base, firma: 'basura' }), false);
  assert.equal(verificarFirma({ ...base, firma: `ts=${ts},v1=zz` }), false);
  assert.equal(verificarFirma({ ...base, firma, secreto: '' }), false);
});

test('rechaza una firma vieja (mas de 5 minutos)', () => {
  const v1 = firmar({ requestId: 'req-123', dataId: 'abc123', ts, secreto });
  assert.equal(verificarFirma({ ...base, firma: `ts=${ts},v1=${v1}`, ahora: ahora + 6 * 60 * 1000 }), false);
});

test('acepta ts en segundos', () => {
  const tsSeg = String(Math.floor(ahora / 1000));
  const v1 = firmar({ requestId: 'req-123', dataId: 'abc123', ts: tsSeg, secreto });
  assert.equal(verificarFirma({ ...base, firma: `ts=${tsSeg},v1=${v1}` }), true);
});
