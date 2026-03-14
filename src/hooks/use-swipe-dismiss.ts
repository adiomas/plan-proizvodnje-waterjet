"use client";

import { useRef, useEffect, type RefObject } from "react";

interface UseSwipeDismissOptions {
  onDismiss: () => void;
  threshold?: number;
  velocityThreshold?: number; // px/ms
  enabled?: boolean;
}

interface UseSwipeDismissReturn {
  sheetRef: RefObject<HTMLDivElement | null>;
  handleRef: RefObject<HTMLDivElement | null>;
  backdropRef: RefObject<HTMLDivElement | null>;
}

export function useSwipeDismiss({
  onDismiss,
  threshold = 80,
  velocityThreshold = 0.5,
  enabled = true,
}: UseSwipeDismissOptions): UseSwipeDismissReturn {
  const sheetRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);

  // Stable ref for onDismiss to avoid effect re-runs
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;

  // Wait for entry animation to finish, then enable swipe
  useEffect(() => {
    const sheet = sheetRef.current;
    if (!sheet || !enabled) return;

    let animReady = false;
    let dismissing = false;

    // Drag state — all ref-based, zero re-renders
    let startY = 0;
    let startX = 0;
    let dragging = false;
    let horizontal = false;
    let dy = 0;
    let velocity = 0;
    let lastY = 0;
    let lastTime = 0;

    sheet.style.willChange = "transform";

    // Detect if entry animation is running
    const onAnimEnd = () => {
      animReady = true;
      sheet.style.animation = "none";
    };

    const animations = sheet.getAnimations();
    if (animations.length === 0) {
      animReady = true;
    } else {
      sheet.addEventListener("animationend", onAnimEnd, { once: true });
    }

    // --- Touch handlers ---
    const onTouchStart = (e: TouchEvent) => {
      if (!animReady || dismissing) return;
      // Don't hijack scroll if content is scrolled
      const target = e.target as HTMLElement;
      const scrollable = target.closest('[data-swipe-scroll]');
      if (scrollable && scrollable.scrollTop > 0) return;
      const touch = e.touches[0];
      startY = touch.clientY;
      startX = touch.clientX;
      lastY = touch.clientY;
      lastTime = Date.now();
      dragging = false;
      horizontal = false;
      dy = 0;
      velocity = 0;
      sheet.style.transition = "none";
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!animReady || dismissing || horizontal) return;
      const touch = e.touches[0];
      const currentDy = touch.clientY - startY;
      const dx = touch.clientX - startX;

      // Determine gesture direction on first significant move
      if (!dragging && !horizontal) {
        if (Math.abs(dx) > Math.abs(currentDy) && Math.abs(dx) > 10) {
          horizontal = true;
          return;
        }
        if (currentDy > 5) {
          dragging = true;
        }
      }

      if (dragging && currentDy > 0) {
        e.preventDefault();
        dy = currentDy;

        // Velocity tracking
        const now = Date.now();
        const dt = now - lastTime;
        if (dt > 5) {
          velocity = (touch.clientY - lastY) / dt;
          lastY = touch.clientY;
          lastTime = now;
        }

        // Direct DOM — no re-render
        sheet.style.transform = `translateY(${dy}px)`;

        // Fade backdrop
        if (backdropRef.current) {
          const sheetHeight = sheet.offsetHeight;
          const progress = Math.min(dy / sheetHeight, 1);
          backdropRef.current.style.opacity = String(1 - progress);
        }
      }
    };

    const onTouchEnd = () => {
      if (!animReady || dismissing || !dragging) {
        dragging = false;
        return;
      }

      // If the user paused (> 100ms since last move), velocity is stale
      const timeSinceLastMove = Date.now() - lastTime;
      const effectiveVelocity = timeSinceLastMove > 100 ? 0 : velocity;

      const shouldDismiss = dy > threshold || effectiveVelocity > velocityThreshold;

      if (shouldDismiss) {
        dismissing = true;
        sheet.style.transition = "transform 0.25s cubic-bezier(0.32, 0.72, 0, 1)";
        sheet.style.transform = "translateY(100%)";

        if (backdropRef.current) {
          backdropRef.current.style.transition = "opacity 0.25s ease";
          backdropRef.current.style.opacity = "0";
        }

        const onTransitionEnd = (e: TransitionEvent) => {
          if (e.propertyName !== "transform" || !dismissing) return;
          sheet.removeEventListener("transitionend", onTransitionEnd);
          dismissing = false;
          onDismissRef.current();
        };
        sheet.addEventListener("transitionend", onTransitionEnd);

        // Fallback if transitionend doesn't fire
        setTimeout(() => {
          if (dismissing) {
            sheet.removeEventListener("transitionend", onTransitionEnd);
            dismissing = false;
            onDismissRef.current();
          }
        }, 350);
      } else {
        // Snap back
        sheet.style.transition = "transform 0.25s cubic-bezier(0.25, 0.46, 0.45, 0.94)";
        sheet.style.transform = "translateY(0)";

        if (backdropRef.current) {
          backdropRef.current.style.transition = "opacity 0.25s ease";
          backdropRef.current.style.opacity = "1";
        }
      }

      dragging = false;
      dy = 0;
    };

    // Attach to entire sheet (full sheet is drag target)
    sheet.addEventListener("touchstart", onTouchStart, { passive: true });
    sheet.addEventListener("touchmove", onTouchMove, { passive: false });
    sheet.addEventListener("touchend", onTouchEnd, { passive: true });

    return () => {
      sheet.style.willChange = "";
      sheet.removeEventListener("animationend", onAnimEnd);
      sheet.removeEventListener("touchstart", onTouchStart);
      sheet.removeEventListener("touchmove", onTouchMove);
      sheet.removeEventListener("touchend", onTouchEnd);
    };
  }, [enabled, threshold, velocityThreshold]);

  return { sheetRef, handleRef, backdropRef };
}
