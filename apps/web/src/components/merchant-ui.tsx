import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

/**
 * Building blocks of the merchant workspace: page headers, KPI cards, panels, tables, badges and
 * empty states. They hold no state and no motion (merchant screens stay still), so both server pages
 * and client forms can use them. Colours and radii come only from the design tokens.
 */

/** Form control look shared by every merchant form; invalid fields get the error border. */
export const fieldClass =
  'min-w-0 rounded-control-ui border border-border bg-surface px-3.5 py-2.5 text-ink placeholder:text-ink-faint disabled:bg-page disabled:text-ink-muted aria-[invalid=true]:border-error';

export const primaryButtonClass =
  'inline-flex items-center justify-center gap-2 rounded-control-ui bg-brand px-5 py-2.5 font-semibold text-surface hover:bg-brand-hover disabled:opacity-60';

export const secondaryButtonClass =
  'inline-flex items-center justify-center gap-2 rounded-control-ui border border-border bg-surface px-4 py-2.5 font-semibold text-ink hover:border-brand hover:text-brand disabled:opacity-60';

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string | undefined;
  actions?: ReactNode | undefined;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-5">
      <div className="min-w-0 max-w-2xl">
        <h1 className="text-title-small font-bold leading-tight text-ink">{title}</h1>
        {description && <p className="mt-1.5 text-ink-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export function Panel({
  title,
  description,
  actions,
  children,
  className = '',
  bodyClassName = 'p-5',
  titleId,
}: {
  title?: string | undefined;
  description?: string | undefined;
  actions?: ReactNode | undefined;
  children: ReactNode;
  className?: string | undefined;
  bodyClassName?: string | undefined;
  titleId?: string | undefined;
}) {
  return (
    <section
      aria-labelledby={title ? titleId : undefined}
      className={`rounded-card-ui border border-border bg-surface ${className}`}
    >
      {title && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
          <div className="min-w-0">
            <h2 id={titleId} className="font-semibold text-ink">
              {title}
            </h2>
            {description && <p className="mt-0.5 text-small text-ink-muted">{description}</p>}
          </div>
          {actions}
        </div>
      )}
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}

export type Tone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger';

const TONES: Record<Tone, string> = {
  neutral: 'bg-page text-ink-muted',
  brand: 'bg-brand-tint text-brand',
  success: 'bg-save-tint text-save',
  warning: 'bg-brand-tint text-brand-hover',
  danger: 'bg-error-tint text-error',
};

export type ReviewStatus =
  'draft' | 'submitted' | 'in_review' | 'approved' | 'rejected' | 'suspended' | 'terminated';

/** Badge tone of a business review status. */
export const REVIEW_TONES: Record<ReviewStatus, Tone> = {
  draft: 'neutral',
  submitted: 'brand',
  in_review: 'brand',
  approved: 'success',
  rejected: 'danger',
  suspended: 'danger',
  terminated: 'danger',
};

export function StatusBadge({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-round-ui px-2.5 py-0.5 text-label font-semibold ${TONES[tone]}`}
    >
      <span aria-hidden="true" className="size-1.5 rounded-round-ui bg-current" />
      {children}
    </span>
  );
}

/** One KPI: label, value and an optional comparison line. Values must come from API data only. */
export function KpiCard({
  label,
  value,
  icon: Icon,
  change,
  changeTone = 'neutral',
}: {
  label: string;
  value: string;
  icon?: LucideIcon | undefined;
  change?: string | undefined;
  changeTone?: 'up' | 'down' | 'neutral';
}) {
  const changeClass =
    changeTone === 'up' ? 'text-save' : changeTone === 'down' ? 'text-error' : 'text-ink-muted';
  return (
    <div className="relative min-w-0 overflow-hidden rounded-card-ui border border-border bg-surface p-4 sm:p-5">
      <span aria-hidden="true" className="absolute inset-x-0 top-0 h-0.5 bg-brand" />
      <div className="flex items-start justify-between gap-3">
        <dt className="text-small font-medium text-ink-muted">{label}</dt>
        {Icon && (
          <span className="hidden size-9 shrink-0 place-items-center rounded-control-ui bg-brand-tint text-brand sm:grid">
            <Icon aria-hidden="true" className="size-4.5" />
          </span>
        )}
      </div>
      <dd className="mt-2 text-lead font-bold tabular-nums text-ink [overflow-wrap:anywhere] sm:text-subtitle">
        {value}
      </dd>
      {change && <dd className={`mt-1 text-label sm:text-small ${changeClass}`}>{change}</dd>}
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  text,
  action,
}: {
  icon: LucideIcon;
  title: string;
  text?: string | undefined;
  action?: ReactNode | undefined;
}) {
  return (
    <div className="grid justify-items-center gap-2 rounded-card-ui border border-dashed border-border bg-surface px-6 py-12 text-center">
      <span className="grid size-12 place-items-center rounded-round-ui bg-brand-tint text-brand">
        <Icon aria-hidden="true" className="size-5" />
      </span>
      <p className="mt-2 font-semibold text-ink">{title}</p>
      {text && <p className="max-w-sm text-small text-ink-muted">{text}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

/** Card frame for a data table. Wide tables scroll inside the card, never the page. */
export function TableCard({
  children,
  minWidth = 640,
}: {
  children: ReactNode;
  minWidth?: number;
}) {
  return (
    <div className="min-w-0 overflow-hidden rounded-card-ui border border-border bg-surface">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-small" style={{ minWidth }}>
          {children}
        </table>
      </div>
    </div>
  );
}

export function Th({
  children,
  align = 'left',
}: {
  children?: ReactNode;
  align?: 'left' | 'right';
}) {
  return (
    <th
      scope="col"
      className={`border-b border-border bg-page px-4 py-3 text-label font-semibold uppercase tracking-wide text-ink-muted ${align === 'right' ? 'text-right' : ''}`}
    >
      {children}
    </th>
  );
}

export function Td({
  children,
  align = 'left',
  className = '',
}: {
  children?: ReactNode | undefined;
  align?: 'left' | 'right';
  className?: string | undefined;
}) {
  return (
    <td
      className={`border-t border-border px-4 py-3 align-top text-ink ${align === 'right' ? 'text-right tabular-nums' : ''} ${className}`}
    >
      {children}
    </td>
  );
}

/** Inline error under a form field, linked to it with aria-describedby. */
export function FieldError({ id, message }: { id: string; message?: string | undefined }) {
  if (!message) return null;
  return (
    <p id={id} className="text-small text-error">
      {message}
    </p>
  );
}

/** Badge tone of a deal status. */
export function dealTone(status: string): Tone {
  switch (status) {
    case 'active':
    case 'approved':
      return 'success';
    case 'in_review':
    case 'scheduled':
      return 'brand';
    case 'changes_requested':
    case 'paused':
      return 'warning';
    default:
      return 'neutral';
  }
}

/** Badge tone of an order status. */
export function orderTone(status: string): Tone {
  switch (status) {
    case 'paid':
    case 'completed':
      return 'success';
    case 'awaiting_payment':
    case 'created':
      return 'brand';
    case 'failed':
    case 'cancelled':
    case 'refunded':
    case 'partially_refunded':
      return 'danger';
    default:
      return 'neutral';
  }
}
