"use client";

import { useEffect, useRef, type RefObject } from "react";

type ZoomLevel = "day" | "week" | "month";

const ZOOM_ORDER: ZoomLevel[] = ["month", "week", "day"];
const ZOOM_IN_THRESHOLD = 1.4;
const ZOOM_OUT_THRESHOLD = 0.65;

interface UsePinchZoomOptions {
  containerRef: RefObject<HTMLDivElement | null>;
  zoom: ZoomLevel;
  onZoomChange: (level: ZoomLevel) => void;
}

export function usePinchZoom({
  containerRef,
  zoom,
  onZoomChange,
}: UsePinchZoomOptions): void {
  const initialDistRef = useRef<number | null>(null);
  const zoomAtStartRef = useRef<ZoomLevel>(zoom);

  useEffect(() => {
    zoomAtStartRef.current = zoom;
  }, [zoom]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const getDistance = (touches: TouchList): number => {
      const dx = touches[1].clientX - touches[0].clientX;
      const dy = touches[1].clientY - touches[0].clientY;
      return Math.sqrt(dx * dx + dy * dy);
    };

    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        initialDistRef.current = getDistance(e.touches);
        zoomAtStartRef.current = zoom;
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length !== 2 || initialDistRef.current === null) return;

      const currentDist = getDistance(e.touches);
      const scale = currentDist / initialDistRef.current;

      const currentIdx = ZOOM_ORDER.indexOf(zoomAtStartRef.current);

      if (scale > ZOOM_IN_THRESHOLD && currentIdx < ZOOM_ORDER.length - 1) {
        const newZoom = ZOOM_ORDER[currentIdx + 1];
        initialDistRef.current = currentDist;
        zoomAtStartRef.current = newZoom;
        onZoomChange(newZoom);
      } else if (scale < ZOOM_OUT_THRESHOLD && currentIdx > 0) {
        const newZoom = ZOOM_ORDER[currentIdx - 1];
        initialDistRef.current = currentDist;
        zoomAtStartRef.current = newZoom;
        onZoomChange(newZoom);
      }
    };

    const handleTouchEnd = () => {
      initialDistRef.current = null;
    };

    el.addEventListener("touchstart", handleTouchStart, { passive: true });
    el.addEventListener("touchmove", handleTouchMove, { passive: true });
    el.addEventListener("touchend", handleTouchEnd, { passive: true });

    return () => {
      el.removeEventListener("touchstart", handleTouchStart);
      el.removeEventListener("touchmove", handleTouchMove);
      el.removeEventListener("touchend", handleTouchEnd);
    };
  }, [containerRef, zoom, onZoomChange]);
}
