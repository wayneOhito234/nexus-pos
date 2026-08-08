import { CheckCircle2, XCircle, Info, X } from 'lucide-react';

const ICONS = { success: CheckCircle2, error: XCircle, info: Info };

export function ToastContainer({ toasts, onDismiss }) {
  return (
    <div className="toast-container">
      {toasts.map((t) => {
        const Icon = ICONS[t.type] || Info;
        return (
          <div key={t.id} className={`toast toast--${t.type}`}>
            <Icon size={18} className="toast__icon" />
            <span className="toast__message">{t.message}</span>
            <button className="toast__close" onClick={() => onDismiss(t.id)}>
              <X size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}