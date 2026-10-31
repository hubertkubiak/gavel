import { prefersReducedMotion } from '../../core/services/motion.service';

/** Confetti for the winner only. Lazy-loaded so it never lands in the initial bundle. */
export async function celebrate(): Promise<void> {
  if (prefersReducedMotion()) return;
  const { default: confetti } = await import('canvas-confetti');
  const colors = ['#a78bfa', '#7c3aed', '#c4f542', '#f5f5f7'];
  const burst = (x: number, angle: number) =>
    confetti({
      particleCount: 90,
      spread: 70,
      startVelocity: 55,
      angle,
      origin: { x, y: 0.7 },
      colors,
    });
  burst(0.2, 60);
  burst(0.8, 120);
  setTimeout(() => confetti({ particleCount: 140, spread: 120, origin: { y: 0.4 }, colors }), 350);
}
