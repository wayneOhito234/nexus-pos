const formatKes = (value) =>
  `KES ${Number(value).toLocaleString('en-KE', { minimumFractionDigits: 2 })}`;

export function ChangeConfirm({ amountReceived, total, onAcknowledge, onCancel }) {
  const change = amountReceived - total;

  return (
    <div className="manager-pin-overlay">
      <div className="change-confirm-box">
        <h3>Drawer open</h3>
        <p className="change-confirm-box__label">Give the customer their change</p>

        <div className="change-confirm-box__amount">{formatKes(change)}</div>

        <div className="change-confirm-box__breakdown">
          <div>
            <span>Received</span>
            <span>{formatKes(amountReceived)}</span>
          </div>
          <div>
            <span>Total due</span>
            <span>{formatKes(total)}</span>
          </div>
        </div>

        <div className="manager-pin-actions">
          <button type="button" onClick={onCancel}>Cancel</button>
          <button type="button" className="change-confirm-box__ack" onClick={onAcknowledge}>
            I've given the change
          </button>
        </div>
      </div>
    </div>
  );
}