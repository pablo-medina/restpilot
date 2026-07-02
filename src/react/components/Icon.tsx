import type { HTMLAttributes } from "react";

type Props = {
  html: string;
} & Pick<HTMLAttributes<HTMLSpanElement>, "className" | "style">;

/** SVG icon shell — always a child of interactive elements, never on the button itself. */
export function Icon({ html, className, style }: Props) {
  return (
    <span className={className} style={style} aria-hidden="true" dangerouslySetInnerHTML={{ __html: html }} />
  );
}
