import { useRef } from 'react';
import { motion, useMotionValue, useTransform, useSpring } from 'framer-motion';

/**
 * Reusable 3D perspective-tilt card wrapper.
 *
 * Children are elevated in Z-space and tilt to follow the mouse cursor,
 * giving a real depth-of-field illusion.  The inner `children` should
 * NOT apply their own `transform` so they ride along with the tilt.
 *
 * Props
 *   className   – extra Tailwind classes applied to the outer motion.div
 *   intensity   – max tilt angle in degrees (default 9)
 *   scale       – hover scale factor (default 1.03)
 *   children    – any React content
 */
export function Card3D({ children, className = '', intensity = 9, scale = 1.03 }) {
  const ref = useRef(null);
  const mouseX = useMotionValue(0.5);
  const mouseY = useMotionValue(0.5);

  const rawRotateX = useTransform(mouseY, [0, 1], [intensity, -intensity]);
  const rawRotateY = useTransform(mouseX, [0, 1], [-intensity, intensity]);

  const rotateX = useSpring(rawRotateX, { stiffness: 180, damping: 22 });
  const rotateY = useSpring(rawRotateY, { stiffness: 180, damping: 22 });

  // Radial glow that tracks the cursor within the card
  const glowX = useTransform(mouseX, [0, 1], ['0%', '100%']);
  const glowY = useTransform(mouseY, [0, 1], ['0%', '100%']);

  function onMouseMove(e) {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    mouseX.set((e.clientX - rect.left) / rect.width);
    mouseY.set((e.clientY - rect.top) / rect.height);
  }

  function onMouseLeave() {
    mouseX.set(0.5);
    mouseY.set(0.5);
  }

  return (
    <motion.div
      ref={ref}
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
      style={{ rotateX, rotateY, transformStyle: 'preserve-3d' }}
      whileHover={{ scale }}
      transition={{ type: 'spring', stiffness: 260, damping: 24 }}
      className={`group relative cursor-default overflow-hidden ${className}`}
    >
      {/* Subtle radial spotlight that follows the mouse */}
      <motion.div
        className="pointer-events-none absolute inset-0 rounded-[inherit] opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        style={{
          background: `radial-gradient(circle at ${glowX} ${glowY}, rgba(255,255,255,0.07), transparent 65%)`,
        }}
      />
      {/* Top shimmer line */}
      <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-white/25 to-transparent" />
      {/* Elevated content layer */}
      <div style={{ transform: 'translateZ(22px)' }}>{children}</div>
    </motion.div>
  );
}
