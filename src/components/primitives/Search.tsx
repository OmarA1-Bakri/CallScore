"use client";

import { Search as SearchIcon } from "lucide-react";
import type { InputHTMLAttributes } from "react";

export default function Search(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="search-field">
      <SearchIcon aria-hidden="true" size={14} strokeWidth={1.4} />
      <input {...props} type="search" />
    </label>
  );
}
