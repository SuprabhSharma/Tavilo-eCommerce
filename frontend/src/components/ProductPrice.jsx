import { discountPercent, formatCurrency } from '../lib/formatters';

export default function ProductPrice({ price, mrp, inline = false, className = '' }) {
  const discount = discountPercent(price, mrp);
  const content = (
    <>
      <span className={`break-words [overflow-wrap:anywhere] tabular-nums ${inline ? 'text-3xl font-bold' : 'font-bold text-ink'}`}>
        {formatCurrency(price)}
      </span>
      {discount > 0 && (
        <span className='break-words text-xs text-muted [overflow-wrap:anywhere]'>
          <span className='line-through tabular-nums'>{formatCurrency(mrp)}</span>{' '}
          <span className='font-semibold text-emerald-600'>
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
