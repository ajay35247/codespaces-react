export function FAQ() {
  return (
    <main className="mx-auto max-w-5xl px-6 py-16 sm:px-10">
      <div className="rounded-[2rem] bg-slate-950/90 p-10 shadow-2xl shadow-slate-900/20">
        <p className="text-sm uppercase tracking-[0.28em] text-orange-300">FAQ</p>
        <h1 className="mt-4 text-4xl font-semibold text-white">Frequently Asked Questions</h1>
        <div className="mt-10 space-y-8 text-slate-300">
          <section>
            <h2 className="text-2xl font-semibold text-white">How do I sign up?</h2>
            <p className="mt-3">Use the Register page to create a new account with your email, password, and role.</p>
          </section>
          <section>
            <h2 className="text-2xl font-semibold text-white">How do I reset my password?</h2>
            <p className="mt-3">Use the Forgot Password page to receive a reset link by email.</p>
          </section>
          <section>
            <h2 className="text-2xl font-semibold text-white">What payment options are supported?</h2>
            <p className="mt-3">Packages and subscriptions are priced in Indian Rupees (INR) and are available through the Payments page.</p>
          </section>
          <section>
            <h2 className="text-2xl font-semibold text-white">How can I contact support?</h2>
            <p className="mt-3">Use the Contact page to submit a support request or email support@aptrucking.in directly.</p>
          </section>
        </div>
      </div>
    </main>
  );
}
