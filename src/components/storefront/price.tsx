import { formatINR } from "@/lib/money";

export function Price({
  priceMinor,
  compareAtMinor,
  from = false,
  className = "",
}: {
  priceMinor: number;
  compareAtMinor?: number | null;
  from?: boolean;
  className?: string;
}) {
  const onSale = compareAtMinor != null && compareAtMinor > priceMinor;
  return (
    <p className={`tabular-nums ${className}`}>
      {from && <span className="text-espresso-soft">From </span>}
      <span className={onSale ? "text-burgundy" : undefined}>{formatINR(priceMinor)}</span>
      {onSale && (
        <>
          {" "}
          <s className="text-espresso-soft">
            <span className="sr-only">was </span>
            {formatINR(compareAtMinor)}
          </s>
        </>
      )}
    </p>
  );
}
