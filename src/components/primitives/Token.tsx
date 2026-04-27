import clsx from "clsx";

export interface TokenProps {
  readonly symbol: string;
  readonly name?: string;
}

export default function Token({ symbol, name }: TokenProps) {
  return (
    <span className="token-chip">
      <span className="token-mark" aria-hidden="true">{symbol.slice(0, 1)}</span>
      <span className="token-symbol">{symbol}</span>
      {name ? <span className={clsx("token-name")}>{name}</span> : null}
    </span>
  );
}
