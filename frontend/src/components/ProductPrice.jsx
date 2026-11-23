import { discountPercent, formatCurrency } from '../lib/formatters';

export default function ProductPrice({ price, mrp, inline = false, className = '' }) {
  const discount = discountPercent(price, mrp);
  const content = (
    <>
      <span className={`break-words [overflow-wrap:anywhere] tabular-nums tracking-tight ${inline ? 'text-2xl sm:text-3xl font-bold text-ink' : 'text-base font-bold text-ink'}`}>
        {formatCurrency(price)}
      </span>
      {discount > 0 && (
        <span className='flex flex-wrap items-center gap-1.5 text-xs [overflow-wrap:anywhere]'>
          <span className='line-through tabular-nums text-muted'>{formatCurrency(mrp)}</span>{' '}
          <span className='inline-flex items-center rounded-md bg-emerald-50 px-1.5 py-0.5 text-[11px] font-semibold text-emerald-700 border border-emerald-200/80 shadow-[0_1px_2px_rgba(16,185,129,0.08)]'>
            {discount}% off
          </span>
        </span>
      )}
    </>
  );

  return (
    <div className={`${inline ? 'flex items-baseline gap-3' : 'flex flex-col gap-0.5'} ${className}`}>
      {content}
    </div>
  );
}
