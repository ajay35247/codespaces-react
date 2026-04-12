export function Terms() {
  return (
    <main className="mx-auto max-w-5xl px-6 py-16 sm:px-10">
      <div className="rounded-[2rem] bg-slate-950/90 p-10 shadow-2xl shadow-slate-900/20">
        <p className="text-sm uppercase tracking-[0.28em] text-orange-300">Terms of Service</p>
        <h1 className="mt-4 text-4xl font-semibold text-white">Terms & Conditions</h1>
        <p className="mt-4 text-slate-300">These terms govern your access and use of the Speedy Trucks platform. By using our services, you agree to comply with these terms.</p>
        <div className="mt-8 space-y-6 text-slate-300">
          <section>
            <h2 className="text-xl font-semibold text-white">Account Use</h2>
            <p className="mt-3">You are responsible for securing your login credentials and keeping them confidential. Unauthorized access is prohibited.</p>
          </section>
          <section>
            <h2 className="text-xl font-semibold text-white">Payments and Subscriptions</h2>
            <p className="mt-3">All payments are processed in Indian Rupees (INR). Subscription fees, upgrade, downgrade, and cancellation policies are detailed in the payments section.</p>
          </section>
          <section>
            <h2 className="text-xl font-semibold text-white">Intellectual Property</h2>
            <p className="mt-3">All platform content, trademarks, and software are owned by Speedy Trucks. Reproduction without permission is prohibited.</p>
          </section>
          <section>
            <h2 className="text-xl font-semibold text-white">Limitation of Liability</h2>
            <p className="mt-3">Speedy Trucks provides the platform “as is” and is not liable for indirect or incidental losses arising from logistics operations.</p>
          </section>
        </div>
      </div>
    </main>
  );
}
