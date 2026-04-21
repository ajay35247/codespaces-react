import { useRef } from 'react';
import { motion, useMotionValue, useTransform, useSpring } from 'framer-motion';
import { ArrowRightIcon } from '@heroicons/react/24/solid';

/** Maps the gradient prop to a fitting emoji icon for the role. */
const ROLE_ICON = {
  'from-sky-600 to-cyan-500':      '🚚',
  'from-orange-500 to-amber-500':  '🧑‍✈️',
  'from-indigo-600 to-violet-500': '🏗️',
  'from-emerald-600 to-lime-500':  '🤝',
};

export function RoleCard({ title, description, link, gradient }) {
  const ref = useRef(null);
  const mouseX = useMotionValue(0.5);
  const mouseY = useMotionValue(0.5);

  const rawRotateX = useTransform(mouseY, [0, 1], [8, -8]);
  const rawRotateY = useTransform(mouseX, [0, 1], [-8, 8]);
  const rotateX = useSpring(rawRotateX, { stiffness: 200, damping: 22 });
  const rotateY = useSpring(rawRotateY, { stiffness: 200, damping: 22 });
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

  const icon = ROLE_ICON[gradient] || '●';

  return (
    <a href={link} className="block outline-none">
      {/* Gradient border ring — 1 px transparent → gradient on hover */}
      <motion.div
        ref={ref}
        onMouseMove={onMouseMove}
        onMouseLeave={onMouseLeave}
        style={{ rotateX, rotateY, transformStyle: 'preserve-3d' }}
        whileHover={{ scale: 1.04 }}
        transition={{ type: 'spring', stiffness: 240, damping: 22 }}
        className={`group relative rounded-3xl bg-gradient-to-br ${gradient} p-0.5 shadow-2xl`}
      >
        {/* Inner glass panel */}
        <div className="relative flex flex-col gap-4 rounded-[calc(1.5rem-2px)] bg-slate-950/88 p-6 backdrop-blur-xl card-shine overflow-hidden">
          {/* Gradient tint behind content */}
          <div className={`absolute inset-0 bg-gradient-to-br ${gradient} opacity-[0.07] transition-opacity duration-300 group-hover:opacity-[0.14]`} />

          {/* Mouse-tracking radial glow */}
          <motion.div
            className="pointer-events-none absolute inset-0 rounded-[inherit] opacity-0 transition-opacity duration-300 group-hover:opacity-100"
            style={{
              background: `radial-gradient(circle at ${glowX} ${glowY}, rgba(255,255,255,0.06), transparent 60%)`,
            }}
          />

          {/* Top shimmer line */}
          <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />

          {/* Content — elevated in Z */}
          <div className="relative flex items-start justify-between gap-4" style={{ transform: 'translateZ(20px)' }}>
            <div className="text-3xl leading-none select-none">{icon}</div>
            <ArrowRightIcon className="mt-1 h-5 w-5 shrink-0 text-white/50 transition-all duration-300 group-hover:translate-x-1 group-hover:text-white" />
          </div>

          <div className="relative" style={{ transform: 'translateZ(20px)' }}>
            <h2 className="text-lg font-bold text-white">{title}</h2>
            <p className="mt-2 text-sm leading-6 text-white/65">{description}</p>
          </div>
        </div>
      </motion.div>
    </a>
  );
}

