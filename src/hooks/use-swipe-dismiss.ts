"use client";

import { useRef, useCallback, useEffect, useState, type CSSProperties, type RefObject } from "react";

interface UseSwipeDismissOptions {
  onDismiss: () => void;
  threshold?: number;
  enabled?: boolean;
}

interface UseSwipeDismissReturn {
  sheetRef: RefObject<HTMLDivElement | null>;
  handleRef: RefObject<HTMLDivElement | null>;
  style: CSSProperties;
}

export function useSwipeDismiss({
  onDismiss,
  threshold = 80,
  enabled = true,
}: UseSwipeDismissOptions): UseSwipeDismissReturn {
  const sheetRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<HTMLDivElement>(null);
  const startY = useRef(0);
  const startX = useRef(0);
  const isDragging = useRef(false);
  const isHorizontal = useRef(false);
  const [deltaY, setDeltaY] = useState(0);
  const [isDismissing, setIsDismissing] = useState(false);

  const onTouchStart = useCallback((e: TouchEvent) => {
    if (!enabled) return;
    const touch = e.touches[0];
    startY.current = touch.clientY;
    startX.current = touch.clientX;
    isDragging.current = false;
    isHorizontal.current = false;
  }, [enabled]);

  const onTouchMove = useCallback((e: TouchEvent) => {
    if (!enabled || isHorizontal.current) return;
    const touch = e.touches[0];
    const dy = touch.clientY - startY.current;
    const dx = touch.clientX - startX.current;

    // Determine gesture direction on first significant move
    if (!isDragging.current && !isHorizontal.current) {
      if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 10) {
        isHorizontal.current = true;
        return;
      }
      if (dy > 5) {
        isDragging.current = true;
      }
    }

    if (isDragging.current && dy > 0) {
      e.preventDefault();
      setDeltaY(dy);
    }
  }, [enabled]);

  const onTouchEnd = useCallback(() => {
    if (!enabled || !isDragging.current) {
      setDeltaY(0);
      isDragging.current = false;
      return;
    }

    if (deltaY > threshold) {
      setIsDismissing(true);
      // Animate out then dismiss
      requestAnimationFrame(() => {
        setTimeout(() => {
          onDismiss();
          setDeltaY(0);
          setIsDismissing(false);
        }, 200);
      });
    } else {
      setDeltaY(0);
    }
    isDragging.current = false;
  }, [enabled, deltaY, threshold, onDismiss]);

  useEffect(() => {
    const handle = handleRef.current;
    if (!handle || !enabled) return;

    handle.addEventListener("touchstart", onTouchStart, { passive: true });
    handle.addEventListener("touchmove", onTouchMove, { passive: false });
    handle.addEventListener("touchend", onTouchEnd, { passive: true });

    return () => {
      handle.removeEventListener("touchstart", onTouchStart);
      handle.removeEventListener("touchmove", onTouchMove);
      handle.removeEventListener("touchend", onTouchEnd);
    };
  }, [enabled, onTouchStart, onTouchMove, onTouchEnd]);

  const style: CSSProperties = isDismissing
    ? { transform: "translateY(100%)", transition: "transform 0.2s cubic-bezier(0.32, 0.72, 0, 1)" }
    : deltaY > 0
    ? { transform: `translateY(${deltaY}px)`, transition: "none" }
    : { transform: "translateY(0)", transition: "transform 0.2s cubic-bezier(0.32, 0.72, 0, 1)" };

  return { sheetRef, handleRef, style };
}
