"use client";

import clsx from "clsx";
import type { ButtonHTMLAttributes } from "react";

export interface FilterChipProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly active?: boolean;
}

export default function FilterChip({ active = false, className, ...props }: FilterChipProps) {
  return <button type="button" className={clsx("filter-chip", active && "filter-chip-active", className)} {...props} />;
}
