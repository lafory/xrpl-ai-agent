const $ = (id) => document.getElementById(id);

async function api(path, body) {
  const response = await fetch(path, {
    method: body ? 'POST' : 'GET',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await response.json().catch(() => ({ status: 'rejected', error: 'Malformed response' }));
  if (!response.ok || payload.status === 'rejected') {
    throw new Error(payload.error || `Request failed (${response.status})`);
  }
  return payload.result;
}

function show(el, text, ok) {
  el.textContent = text;
  el.className = `output ${ok ? 'ok' : 'err'}`;
}

function amountText(amount) {
  return typeof amount === 'string'
    ? `${Number(amount) / 1_000_000} XRP`
    : `${amount.value} ${amount.currency}`;
}

async function refresh() {
  const wallet = await api('/api/wallet');
  $('network').textContent = wallet.network;
  $('address').textContent = wallet.address;
  $('balance').textContent = `${wallet.balanceXrp} XRP`;
  $('guardrail').textContent = `${wallet.maxSpendXrp} XRP / tx`;

  if (!wallet.agentEnabled) {
    $('agent-hint').textContent = 'Agent disabled: OPENAI_API_KEY is not set.';
    $('agent-send').disabled = true;
  }

  const rows = wallet.offers.map(
    (offer) =>
      `<tr><td>${offer.seq}</td><td>${amountText(offer.taker_gets)}</td><td>${amountText(offer.taker_pays)}</td><td>${offer.quality}</td></tr>`,
  );
  document.querySelector('#offers tbody').innerHTML =
    rows.join('') || '<tr><td colspan="4" class="empty">No open offers</td></tr>';

  $('nfts').innerHTML =
    wallet.nfts.map((nft) => `<li>${nft.NFTokenID}</li>`).join('') || '<li class="empty">No NFTs held</li>';
}

async function withButton(button, action) {
  button.disabled = true;
  try {
    await action();
  } finally {
    button.disabled = false;
  }
}

function amountFrom(form, prefix) {
  const currency = form[`${prefix}Currency`].value.trim();
  const issuer = form[`${prefix}Issuer`].value.trim();
  return { currency, value: form[`${prefix}Value`].value.trim(), issuer: issuer || null };
}

$('refresh').addEventListener('click', (event) =>
  withButton(event.target, () => refresh().catch((error) => show($('dex-output'), error.message, false))),
);

$('agent-send').addEventListener('click', (event) =>
  withButton(event.target, async () => {
    const output = $('agent-output');
    show(output, 'Thinking…', true);
    try {
      const result = await api('/api/agent', { input: $('agent-input').value });
      show(output, result.output, true);
      await refresh();
    } catch (error) {
      show(output, error.message, false);
    }
  }),
);

$('dex-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const form = event.target;
  return withButton(form.querySelector('button'), async () => {
    const output = $('dex-output');
    show(output, 'Submitting…', true);
    try {
      const result = await api('/api/dex/order', {
        takerGets: amountFrom(form, 'gets'),
        takerPays: amountFrom(form, 'pays'),
        passive: form.passive.checked,
      });
      show(output, `${result.summary}\nhash: ${result.hash}`, true);
      await refresh();
    } catch (error) {
      show(output, error.message, false);
    }
  });
});

$('nft-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const form = event.target;
  return withButton(form.querySelector('button'), async () => {
    const output = $('nft-output');
    show(output, 'Submitting…', true);
    try {
      const result = await api('/api/nft/accept', {
        nftokenOfferIndex: form.nftokenOfferIndex.value.trim(),
        side: form.side.value,
      });
      show(output, `${result.summary}\nhash: ${result.hash}`, true);
      await refresh();
    } catch (error) {
      show(output, error.message, false);
    }
  });
});

refresh().catch((error) => show($('dex-output'), error.message, false));
