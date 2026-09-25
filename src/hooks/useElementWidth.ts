"use client";

import { useCallback, useState } from "react";

/**
 * Measures an element's width for pixel-accurate SVG charts.
 *
 * Charts are drawn in real pixels rather than a scaled viewBox, so strokes,
 * markers and labels keep their intended size at every container width.
 */
export function useElementWidth<T extends HTMLElement>(): [(node: T | null) => void, number] {
  const [width, setWidth] = useState(0);

  const ref = useCallback((node: T | null) => {
    if (!node) return;
    setWidth(node.getBoundingClientRect().width);
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return [ref, width];
}
