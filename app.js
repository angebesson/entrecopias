// ===================================================================
// Copia Litoral — order calculator, ticket/cart, and checkout hook
// ===================================================================

const state = {
  cart: [],      // { id, label, qty, unitPrice, subtotal }
  file: null,    // File object (name only is used; no real upload happens)
};

const money = (n) => `$${n.toLocaleString('es-AR')}`;

// ---------- Tabs (Impresiones / Fotografía) ----------
const tabs = document.querySelectorAll('.tab');
const panels = document.querySelectorAll('.tab-panel');

tabs.forEach((tab) => {
  tab.addEventListener('click', () => {
    tabs.forEach((t) => { t.classList.remove('active'); t.setAttribute('aria-selected', 'false'); });
    tab.classList.add('active');
    tab.setAttribute('aria-selected', 'true');

    const target = tab.dataset.tab;
    panels.forEach((p) => {
      p.hidden = p.dataset.panel !== target;
    });
  });
});

function activeTab() {
  return document.querySelector('.tab.active').dataset.tab;
}

// ---------- File upload (simulated — no real upload/storage) ----------
const fileInput = document.getElementById('archivo');
const fileNameEl = document.getElementById('fileName');

fileInput.addEventListener('change', () => {
  const file = fileInput.files[0];
  state.file = file || null;
  fileNameEl.textContent = file ? `Archivo listo: ${file.name}` : '';
});

// ---------- Price calculation ----------
function selectedOptionPrice(selectId) {
  const el = document.getElementById(selectId);
  const opt = el.options[el.selectedIndex];
  return Number(opt.dataset.price || 0);
}

function calculateCurrentConfig() {
  if (activeTab() === 'impresiones') {
    const base =
      selectedOptionPrice('tamano') +
      selectedOptionPrice('calidad') +
      selectedOptionPrice('faz') +
      selectedOptionPrice('papel');
    const terminado = selectedOptionPrice('terminado'); // flat fee, not per-copy
    const copias = Math.max(1, Number(document.getElementById('copias').value || 1));

    const label = buildImpresionesLabel(copias);
    const unitSubtotal = base * copias + terminado;
    return { label, qty: copias, unitPrice: base, flat: terminado, subtotal: unitSubtotal };
  } else {
    const base = selectedOptionPrice('tamanoFoto') + selectedOptionPrice('acabadoFoto');
    const copias = Math.max(1, Number(document.getElementById('copiasFoto').value || 1));
    const label = buildFotoLabel(copias);
    const unitSubtotal = base * copias;
    return { label, qty: copias, unitPrice: base, flat: 0, subtotal: unitSubtotal };
  }
}

function buildImpresionesLabel(copias) {
  const tamano = document.getElementById('tamano').selectedOptions[0].text;
  const calidad = document.getElementById('calidad').selectedOptions[0].text;
  return `${tamano} · ${calidad} · x${copias}`;
}

function buildFotoLabel(copias) {
  const tamano = document.getElementById('tamanoFoto').selectedOptions[0].text;
  return `Foto ${tamano} · x${copias}`;
}

// ---------- Ticket / cart rendering ----------
const ticketItemsEl = document.getElementById('ticketItems');
const ticketTotalEl = document.getElementById('ticketTotal');
const heroTickerTotalEl = document.getElementById('heroTickerTotal');
const payBtn = document.getElementById('payBtn');

function renderTicket() {
  if (state.cart.length === 0) {
    ticketItemsEl.innerHTML = `<p class="ticket-empty">Todavía no agregaste nada. Completá el formulario y sumalo acá.</p>`;
    payBtn.disabled = true;
  } else {
    ticketItemsEl.innerHTML = state.cart.map((item) => `
      <div class="ticket-item">
        <span>${item.label}</span>
        <span>${money(item.subtotal)}
          <button type="button" class="ticket-item-remove" data-id="${item.id}">quitar</button>
        </span>
      </div>
    `).join('');
    payBtn.disabled = false;
  }

  const total = state.cart.reduce((sum, item) => sum + item.subtotal, 0);
  ticketTotalEl.textContent = money(total);
  heroTickerTotalEl.textContent = money(total);

  document.querySelectorAll('.ticket-item-remove').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.cart = state.cart.filter((item) => item.id !== btn.dataset.id);
      renderTicket();
      showToast('Ítem eliminado del ticket');
    });
  });
}

// ---------- Add to cart ----------
const form = document.getElementById('orderForm');

form.addEventListener('submit', (e) => {
  e.preventDefault();

  if (!form.checkValidity()) {
    form.reportValidity();
    return;
  }

  const config = calculateCurrentConfig();
  state.cart.push({
    id: crypto.randomUUID(),
    label: config.label + (state.file ? ` · ${state.file.name}` : ''),
    subtotal: config.subtotal,
  });

  renderTicket();
  showToast('Agregado al ticket ✓');
});

// ---------- Toast ----------
const toastEl = document.getElementById('toast');
let toastTimer = null;

function showToast(message) {
  toastEl.textContent = message;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2200);
}

// ===================================================================
// Mercado Pago — SANDBOX SIMULATION
//
// A real integration needs a backend: the access token that creates a
// "preference" (the object Mercado Pago uses to know what's being
// charged) is secret and can never live in front-end code. This demo
// simulates that round trip so the flow can be shown end-to-end.
//
// To make this real:
//   1. Stand up a small backend (Node/Express or a Firebase Function).
//   2. It calls POST https://api.mercadopago.com/checkout/preferences
//      with your ACCESS TOKEN (server-side only) and the cart items.
//   3. It returns the preference "init_point" URL.
//   4. The button below redirects the browser to that URL instead of
//      running the simulateMercadoPagoCheckout() function.
// ===================================================================

payBtn.addEventListener('click', () => {
  if (state.cart.length === 0) return;
  simulateMercadoPagoCheckout();
});

function simulateMercadoPagoCheckout() {
  const total = state.cart.reduce((sum, item) => sum + item.subtotal, 0);
  payBtn.disabled = true;
  payBtn.textContent = 'Redirigiendo a Mercado Pago…';

  // Simulated network delay, standing in for the real preference-creation call
  setTimeout(() => {
    const confirmed = window.confirm(
      `[SANDBOX] Simulación de Mercado Pago\n\n` +
      `Total a pagar: ${money(total)}\n\n` +
      `En producción, acá se abriría el Checkout real de Mercado Pago.\n` +
      `¿Simular pago aprobado?`
    );

    if (confirmed) {
      state.cart = [];
      renderTicket();
      showToast('Pago simulado aprobado ✓ (sandbox)');
    } else {
      showToast('Pago simulado cancelado');
    }

    payBtn.textContent = 'Pagar con Mercado Pago';
    payBtn.disabled = state.cart.length === 0;
  }, 900);
}

// ---------- Init ----------
renderTicket();
