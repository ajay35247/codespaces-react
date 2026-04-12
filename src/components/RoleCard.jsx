import { ArrowRightIcon } from '@heroicons/react/24/solid';

export function RoleCard({ title, description, link, gradient }) {
  return (
    <a
      href={link}
      className={`group block rounded-3xl border border-white/10 bg-gradient-to-br ${gradient} p-6 shadow-xl shadow-slate-900/10 transition hover:-translate-y-1 hover:shadow-2xl`}
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-white">{title}</h2>
          <p className="mt-3 text-sm leading-6 text-slate-100">{description}</p>
        </div>
        <ArrowRightIcon className="h-6 w-6 text-white opacity-70 transition group-hover:opacity-100" />
      </div>
    </a>
  );
}
