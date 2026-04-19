"use client";

import { useState } from "react";
import type { ReactElement } from "react";

interface BrandWordmarkProps {
  readonly accent: string;
  readonly surface: string;
  readonly rule: string;
}

/**
 * Wordmark for Binary Baron · AI Laboratory.
 *
 * The brand asset lives at `/brand/binary-baron-wordmark.png`. The PNG is
 * dropped into `public/brand/` by the user post-merge. Until then the image
 * request 404s, so we render a readable text fallback instead of a broken-
 * image icon. The `useState` + `onError` keeps the experience clean either
 * way: if the file exists the image renders; if it doesn't, the text shows.
 */
export default function BrandWordmark({
  accent,
  surface,
  rule,
}: BrandWordmarkProps): ReactElement {
  const [imageFailed, setImageFailed] = useState<boolean>(false);

  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        minWidth: "260px",
        minHeight: "64px",
        border: `1px solid ${rule}`,
        padding: "14px 20px",
        background: surface,
      }}
    >
      {imageFailed ? (
        <span
          style={{
            color: accent,
            fontSize: "14px",
            letterSpacing: "0.04em",
            fontWeight: 500,
          }}
        >
          [ BINARY BARON · AI LABORATORY ]
        </span>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src="/brand/binary-baron-wordmark.png"
          alt="Binary Baron · AI Laboratory"
          width={180}
          height={48}
          style={{ height: "auto" }}
          onError={() => setImageFailed(true)}
        />
      )}
    </div>
  );
}
