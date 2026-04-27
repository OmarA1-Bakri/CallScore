"use client";

import clsx from "clsx";
import type { ButtonHTMLAttributes } from "react";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly variant?: "primary" | "ghost" | "outline";
}

export default function Button({ variant = "outline", className, ...props }: ButtonProps) {
  return <button type="button" className={clsx("ui-button", `ui-button-${variant}`, className)} {...props} />;
}
