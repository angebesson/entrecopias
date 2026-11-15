import test from 'node:test';
import assert from 'node:assert/strict';
import { subirArchivoHandler, nombreSeguro, MAX_BYTES } from '../api/_lib/subir-archivo.js';
import { ARCHIVO_RE } from '../api/_lib/precios.js';

function res() {
  const r = { code: 200, body: null, headers: {} };
  r.status = (c) => ((r.code = c), r);
  r.json = (b) => ((r.body = b), r);
  r.setHeader = (k, v) => (r.headers[k] = v);
  return r;
}
const okStorage = () => {
  const llamadas = [];
  return {
    llamadas,
    storage: () => ({
      createSignedUploadUrl: async (path) => (llamadas.push(path), { data: { signedUrl: `https://x.supabase.co/object/upload/sign/archivos/${path}?token=t`, token: 't', path }, error: null }),
    }),
  };
};
const post = (body) => ({ method: 'POST', body });

test('nombreSeguro: saca acentos, espacios, rutas y simbolos; conserva la extension', () => {
  assert.equal(nombreSeguro('Tesis final (1).PDF'), 'Tesis_final_1.pdf');
  assert.equal(nombreSeguro(String.raw`C:\Users\ana\Información año.docx`), 'Informacion_ano.docx');
  assert.equal(nombreSeguro('../../etc/passwd.png'), 'passwd.png');
  assert.equal(nombreSeguro('....pdf'), 'archivo.pdf');
  assert.equal(nombreSeguro('a'.repeat(300) + '.pdf').length <= 80, true);
});

test('subir-archivo: devuelve ruta con la forma exacta que acepta el pedido', async () => {
  const { storage, llamadas } = okStorage();
  const h = subirArchivoHandler({ storage });
  const r = res();
  await h(post({ nombre: 'Mi apunte.pdf', tipo: 'application/pdf', tamano: 1234 }), r);
  assert.equal(r.code, 200);
  assert.match(r.body.path, ARCHIVO_RE);
  assert.ok(r.body.path.endsWith('/Mi_apunte.pdf'));
  assert.equal(llamadas[0], r.body.path);
  assert.ok(r.body.url.includes('token='));
});

test('subir-archivo: rechaza formatos, tipos que no coinciden, tamanos raros y metodo GET', async () => {
  const { storage, llamadas } = okStorage();
  const h = subirArchivoHandler({ storage });
  for (const mala of [
    { nombre: 'virus.exe', tipo: 'application/x-msdownload', tamano: 100 },
    { nombre: 'sin_extension', tipo: '', tamano: 100 },
    { nombre: 'foto.png', tipo: 'application/pdf', tamano: 100 },
    { nombre: 'a.pdf', tipo: 'application/pdf', tamano: 0 },
    { nombre: 'a.pdf', tipo: 'application/pdf', tamano: MAX_BYTES + 1 },
    { nombre: 'a.pdf', tipo: 'application/pdf', tamano: '100' },
    { nombre: '', tipo: 'application/pdf', tamano: 100 },
    {},
  ]) {
    const r = res();
    await h(post(mala), r);
    assert.equal(r.code, 400, JSON.stringify(mala));
  }
  assert.equal(llamadas.length, 0);
  const r2 = res();
  await h({ method: 'GET' }, r2);
  assert.equal(r2.code, 405);
});

test('subir-archivo: acepta jpg con tipo vacio (algunos navegadores no lo informan) y 500 si Storage falla', async () => {
  const { storage } = okStorage();
  const r1 = res();
  await subirArchivoHandler({ storage })(post({ nombre: 'foto.JPG', tipo: '', tamano: 50 }), r1);
  assert.equal(r1.code, 200);
  const r2 = res();
  await subirArchivoHandler({ storage: () => ({ createSignedUploadUrl: async () => ({ data: null, error: new Error('caido') }) }) })(post({ nombre: 'a.pdf', tipo: 'application/pdf', tamano: 5 }), r2);
  assert.equal(r2.code, 500);
});
