import { useState, useMemo } from 'react';
import { Banknote, Smartphone, Split, X, WifiOff } from 'lucide-react';

const kes = (v) =>
  `KES ${Number(v || 0).toLocaleString('en-KE', { minimumFractionDigits: 2 })}`;

export function PaymentScreen({ total, vat, online, busy, status, onTake, onCancel }) {
  const [mode, setMode] = useState('cash'); // cash | mpesa | split
  const [cashInput, setCashInput] = useState('');
  const [mpesaInput, setMpesaInput] = useState('');
  const [phone, setPhone] = useState('254');

  const cash = Number(cashInput) || 0;
  const mpesa = mode === 'mpesa' ? total : Number(mpesaInput) || 0;

  const tendered = useMemo(() => {
    if (mode === 'cash') return cash;
    if (mode === 'mpesa') return total;
    return cash + mpesa;
  }, [mode, cash, mpesa, total]);

  const shortfall = total - tendered;
  const change = tendered - total;

  const phoneValid = /^254\d{9}$/.test(phone);
  const needsPhone = mode === 'mpesa' || (mode === 'split' && mpesa > 0);

  const canTake =
    !busy &&
    shortfall <= 0.01 &&
    (!needsPhone || phoneValid) &&
    (mode !== 'split' || (cash > 0 && mpesa > 0));

  // Quick-tender buttons for what a cashier is actually handed. Deduplicated
  // through a Set, because the round-up figure frequently coincides with a
  // note value -- on a 406 total both come out as 500.
  const quickAmounts = useMemo(() => {
    const notes = [50, 100, 200, 500, 1000].filter((n) => n > total);
    const roundUp = Math.ceil(total / 100) * 100;
    const set = new Set(notes);
    if (roundUp > total) set.add(roundUp);
    return [...set].sort((a, b) => a - b).slice(0, 4);
  }, [total]);

  function take() {
    onTake({
      cashAmount: mode === 'mpesa' ? 0 : cash,
      mpesaAmount: mode === 'cash' ? 0 : mpesa,
      phone: needsPhone ? phone : null,
    });
  }

  // On a split, prefill the cash side with whatever the M-Pesa leg leaves
  // outstanding. Saves the cashier doing the subtraction mid-queue.
  function fillRemainingCash() {
    const remaining = Math.max(0, Math.round((total - mpesa) * 100) / 100);
    setCashInput(String(remaining));
  }

  return (
    <div className="pay-overlay">
      <div className="pay">
        <button className="pay__close" onClick={onCancel} disabled={busy}>
          <X size={18} />
        </button>

        {/* Deliberately the largest thing on screen -- the customer reads
            this from across the counter. */}
        <div className="pay__due">
          <span>Amount due</span>
          <strong>{kes(total)}</strong>
          <em>includes VAT of {kes(vat)}</em>
        </div>

        <div className="pay__modes">
          <button
            className={mode === 'cash' ? 'is-active' : ''}
            onClick={() => setMode('cash')}
            disabled={busy}
          >
            <Banknote size={16} />
            Cash
          </button>
          <button
            className={mode === 'mpesa' ? 'is-active' : ''}
            onClick={() => setMode('mpesa')}
            disabled={busy || !online}
            title={!online ? 'M-Pesa needs an internet connection' : undefined}
          >
            <Smartphone size={16} />
            M-Pesa
          </button>
          <button
            className={mode === 'split' ? 'is-active' : ''}
            onClick={() => setMode('split')}
            disabled={busy || !online}
            title={!online ? 'M-Pesa needs an internet connection' : undefined}
          >
            <Split size={16} />
            Split
          </button>
        </div>

        {!online && (
          <p className="pay__offline">
            <WifiOff size={13} />
            No connection to the server. Cash only until it is back.
          </p>
        )}

        {mode === 'split' && (
          <label className="pay__field">
            <span>Paid by M-Pesa</span>
            <input
              type="number"
              inputMode="decimal"
              value={mpesaInput}
              onChange={(e) => setMpesaInput(e.target.value)}
              placeholder="0.00"
              autoFocus
              disabled={busy}
            />
          </label>
        )}

        {(mode === 'cash' || mode === 'split') && (
          <label className="pay__field">
            <span>{mode === 'split' ? 'Paid in cash' : 'Cash received'}</span>
            <input
              type="number"
              inputMode="decimal"
              value={cashInput}
              onChange={(e) => setCashInput(e.target.value)}
              placeholder="0.00"
              autoFocus={mode === 'cash'}
              disabled={busy}
            />
          </label>
        )}

        {mode === 'cash' && (
          <div className="pay__quick">
            <button onClick={() => setCashInput(String(total))} disabled={busy}>
              Exact
            </button>
            {quickAmounts.map((n) => (
              <button key={n} onClick={() => setCashInput(String(n))} disabled={busy}>
                {n.toLocaleString('en-KE')}
              </button>
            ))}
          </div>
        )}

        {mode === 'split' && mpesa > 0 && mpesa < total && (
          <div className="pay__quick">
            <button onClick={fillRemainingCash} disabled={busy}>
              Rest in cash &middot; {kes(total - mpesa)}
            </button>
          </div>
        )}

        {needsPhone && (
          <label className="pay__field">
            <span>Customer's phone</span>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="2547XXXXXXXX"
              disabled={busy}
            />
            {phone.length > 3 && !phoneValid && (
              <em className="pay__hint">Needs to be 254 followed by nine digits</em>
            )}
          </label>
        )}

        <div className="pay__tally">
          {mode === 'split' && (
            <div className="pay__tally-row">
              <span>Covered</span>
              <strong>
                {kes(tendered)} of {kes(total)}
              </strong>
            </div>
          )}

          {shortfall > 0.01 ? (
            <div className="pay__tally-row is-short">
              <span>Still owing</span>
              <strong>{kes(shortfall)}</strong>
            </div>
          ) : change > 0.01 ? (
            <div className="pay__tally-row is-change">
              <span>Change to give</span>
              <strong>{kes(change)}</strong>
            </div>
          ) : tendered > 0 ? (
            <div className="pay__tally-row is-exact">
              <span>Exact payment, no change</span>
            </div>
          ) : null}
        </div>

        {status && <p className="pay__status">{status}</p>}

        <button className="pay__take" onClick={take} disabled={!canTake}>
          {busy
            ? 'Processing...'
            : mode === 'cash'
              ? 'Take cash'
              : mode === 'mpesa'
                ? 'Send STK push'
                : 'Take split payment'}
        </button>
      </div>
    </div>
  );
}