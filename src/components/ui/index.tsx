import {
  createContext, useCallback, useContext, useRef, useState,
  type ButtonHTMLAttributes, type ReactNode, type HTMLAttributes,
} from 'react';
import { esAccionCritica } from '../../types';
import { Icon, type IconName } from '../icons';

export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

/* ── Spinner ─────────────────────────────────────────────────────────── */
export function Spinner({ label = 'Cargando…' }: { label?: string }) {
  return (
    <div className="rsp-loading" role="status" aria-live="polite">
      <span className="rsp-spinner" aria-hidden="true" />
      <span className="u-muted">{label}</span>
    </div>
  );
}

/* ── Button ──────────────────────────────────────────────────────────── */
type Variant = 'primary' | 'outline' | 'ghost' | 'danger';
interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: 'sm' | 'md';
  icon?: IconName;
  /** Si la acción es crítica, marca el botón (indica 2FA). */
  critical?: boolean;
}
export function Button({ variant = 'primary', size = 'md', icon, critical, className, children, ...rest }: ButtonProps) {
  return (
    <button
      className={cn('rsp-btn', `rsp-btn-${variant}`, size === 'sm' && 'rsp-btn-sm', critical && 'rsp-btn-critical', className)}
      {...rest}
    >
      {icon && <Icon name={icon} size={16} />}
      {children}
      {critical && <span className="rsp-btn-critical-tag" title="Requiere verificación 2FA">2FA</span>}
    </button>
  );
}

/* ── Badge ───────────────────────────────────────────────────────────── */
type Tone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'info';
export function Badge({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return <span className={cn('rsp-badge', `rsp-badge-${tone}`)}>{children}</span>;
}

export function badgeToneDeEstado(estado: string): Tone {
  const map: Record<string, Tone> = {
    vigente: 'success', aprobado: 'success', resuelta: 'success', procesada: 'success',
    cerrada: 'success', activa: 'success', al_dia: 'success',
    revision: 'info', validacion: 'info', firma: 'info', programado: 'info',
    subsanacion: 'warning', vencido: 'warning', retenida: 'warning', pendiente: 'warning',
    rechazada: 'danger', anulada: 'danger', baja: 'danger', inconsistencia: 'danger',
    historico: 'neutral', borrador: 'neutral',
  };
  return map[estado] ?? 'neutral';
}

/* ── Card ────────────────────────────────────────────────────────────── */
export function Card({ children, className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('rsp-card', className)} {...rest}>{children}</div>;
}
export function CardHeader({ title, subtitle, actions }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="rsp-card-header">
      <div>
        <h3 className="rsp-card-title">{title}</h3>
        {subtitle && <p className="rsp-card-subtitle">{subtitle}</p>}
      </div>
      {actions && <div className="u-row">{actions}</div>}
    </div>
  );
}

/* ── KPI ─────────────────────────────────────────────────────────────── */
export function KPI({ label, value, icon, tone = 'neutral' }: { label: string; value: ReactNode; icon?: IconName; tone?: Tone }) {
  return (
    <div className="rsp-kpi">
      {icon && <span className="rsp-kpi-icon"><Icon name={icon} /></span>}
      <div>
        <div className="rsp-kpi-value">{value}</div>
        <div className={cn('rsp-kpi-label', tone !== 'neutral' && `rsp-badge rsp-badge-${tone}`)}>{label}</div>
      </div>
    </div>
  );
}

/* ── PageHeader ──────────────────────────────────────────────────────── */
export function PageHeader({ title, subtitle, actions, breadcrumb }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; breadcrumb?: ReactNode }) {
  return (
    <div className="rsp-page-header rsp-fade-up">
      <div>
        {breadcrumb && <div className="rsp-breadcrumb u-muted">{breadcrumb}</div>}
        <h1 className="rsp-page-title">{title}</h1>
        {subtitle && <p className="rsp-page-subtitle">{subtitle}</p>}
      </div>
      {actions && <div className="u-row u-wrap">{actions}</div>}
    </div>
  );
}

/* ── Empty ───────────────────────────────────────────────────────────── */
export function Empty({ icon = 'folder', title, hint, actions }: { icon?: IconName; title: string; hint?: string; actions?: ReactNode }) {
  return (
    <div className="rsp-empty">
      <span className="rsp-empty-icon"><Icon name={icon} size={28} /></span>
      <h3>{title}</h3>
      {hint && <p className="u-muted">{hint}</p>}
      {actions && <div className="u-row">{actions}</div>}
    </div>
  );
}

/* ── ErrorState (pantalla de error amigable) ─────────────────────────── */
export function ErrorState({ title = 'Algo ha ido mal', message, hint, onRetry }: {
  title?: string;
  message: string;
  hint?: string;
  onRetry?: () => void;
}) {
  return (
    <div className="rsp-empty rsp-error-state" role="alert">
      <span className="rsp-empty-icon rsp-empty-icon-danger"><Icon name="alert" size={28} /></span>
      <h3>{title}</h3>
      <p className="u-muted" style={{ whiteSpace: 'pre-wrap' }}>{message}</p>
      {hint && <p className="u-muted" style={{ fontSize: 'var(--fs-xs)' }}>{hint}</p>}
      {onRetry && (
        <div className="u-row">
          <Button size="sm" variant="outline" icon="refresh" onClick={onRetry}>Reintentar</Button>
        </div>
      )}
    </div>
  );
}

/* ── Table ───────────────────────────────────────────────────────────── */
export interface Column<T> {
  key: string;
  header: ReactNode;
  render?: (row: T) => ReactNode;
  width?: string;
}
export function Table<T>({ columns, rows, rowKey, onRowClick }: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
}) {
  return (
    <div className="rsp-table-wrap">
      <table className="rsp-table">
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} style={c.width ? { width: c.width } : undefined}>{c.header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={rowKey(row)} onClick={onRowClick ? () => onRowClick(row) : undefined} className={onRowClick ? 'rsp-row-clickable' : undefined}>
              {columns.map((c) => (
                <td key={c.key}>{c.render ? c.render(row) : String((row as Record<string, unknown>)[c.key] ?? '')}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ── Modal ───────────────────────────────────────────────────────────── */
export function Modal({ open, title, onClose, children, footer }: {
  open: boolean; title: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="rsp-modal-backdrop" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="rsp-modal" onClick={(e) => e.stopPropagation()}>
        <div className="rsp-modal-header">
          <h3>{title}</h3>
          <button className="rsp-icon-btn" onClick={onClose} aria-label="Cerrar">✕</button>
        </div>
        <div className="rsp-modal-body">{children}</div>
        {footer && <div className="rsp-modal-footer">{footer}</div>}
      </div>
    </div>
  );
}

/* ── Tabs ────────────────────────────────────────────────────────────── */
export function Tabs({ tabs, active, onChange }: {
  tabs: { id: string; label: ReactNode }[];
  active: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="rsp-tabs" role="tablist">
      {tabs.map((t) => (
        <button
          key={t.id}
          role="tab"
          aria-selected={active === t.id}
          className={cn('rsp-tab', active === t.id && 'rsp-tab-active')}
          onClick={() => onChange(t.id)}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

/* ── Stepper ─────────────────────────────────────────────────────────── */
export function Stepper({ pasos, actual }: { pasos: string[]; actual: number }) {
  return (
    <ol className="rsp-stepper">
      {pasos.map((p, i) => (
        <li key={p} className={cn('rsp-step', i < actual && 'rsp-step-done', i === actual && 'rsp-step-current')}>
          <span className="rsp-step-dot">{i < actual ? <Icon name="check" size={12} /> : i + 1}</span>
          <span className="rsp-step-label">{p}</span>
        </li>
      ))}
    </ol>
  );
}

/* ── Field ───────────────────────────────────────────────────────────── */
export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="rsp-field">
      <span>{label}</span>
      {children}
      {hint && <small className="u-muted">{hint}</small>}
    </label>
  );
}

/* ── Toast ───────────────────────────────────────────────────────────── */
interface Toast { id: number; tipo: 'success' | 'error' | 'info'; mensaje: string }
const ToastContext = createContext<{ toast: (mensaje: string, tipo?: Toast['tipo']) => void } | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const idRef = useRef(0);
  const toast = useCallback((mensaje: string, tipo: Toast['tipo'] = 'info') => {
    const id = ++idRef.current;
    setToasts((t) => [...t, { id, tipo, mensaje }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000);
  }, []);
  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="rsp-toasts" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={cn('rsp-toast', `rsp-toast-${t.tipo}`)}>{t.mensaje}</div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast debe usarse dentro de <ToastProvider>');
  return ctx;
}

/** Determina si una acción requiere 2FA y devuelve la etiqueta apropiada. */
export function requiere2FA(accion: string): boolean {
  return esAccionCritica(accion);
}
