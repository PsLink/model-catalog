import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// hue-* (index.css) pick one color, so a later one replaces an earlier one,
// as with Tailwind's own utilities: a chip's default grey gives way to a
// tag's hue.
const twMerge = extendTailwindMerge<"hue">({
  extend: { classGroups: { hue: [{ hue: ["red", "orange", "yellow", "green", "blue", "purple", "grey"] }] } },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
