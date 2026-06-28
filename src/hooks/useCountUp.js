import { useState, useRef, useEffect } from 'react'

/** ¿El usuario pidió reducir las animaciones en el sistema? */
export function prefersReducedMotion() {
  return typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
}

/**
 * Anima un número desde su valor anterior hasta `target` (easeOutCubic).
 * La primera vez cuenta desde 0. Respeta prefers-reduced-motion (salta al valor).
 */
export function useCountUp(target, duration = 650) {
  const [val, setVal] = useState(0)
  const fromRef = useRef(0)

  useEffect(() => {
    const from = fromRef.current
    const to = target
    if (from === to) return
    if (prefersReducedMotion()) { fromRef.current = to; setVal(to); return }

    let raf, start
    const tick = (t) => {
      if (start == null) start = t
      const p = Math.min((t - start) / duration, 1)
      const eased = 1 - Math.pow(1 - p, 3)
      setVal(from + (to - from) * eased)
      if (p < 1) raf = requestAnimationFrame(tick)
      else fromRef.current = to
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, duration])

  return val
}
