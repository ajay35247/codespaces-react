export function PrivacyPolicy() {
  return (
    <main className="mx-auto max-w-5xl px-6 py-16 sm:px-10">
      <div className="rounded-[2rem] bg-slate-950/90 p-10 shadow-2xl shadow-slate-900/20">
        <p className="text-sm uppercase tracking-[0.28em] text-orange-300">Privacy policy</p>
        <h1 className="mt-4 text-4xl font-semibold text-white">Privacy Policy</h1>
        <p className="mt-4 text-slate-300">Speedy Trucks is committed to protecting the personal data of our users across India. This policy explains how we collect, use, disclose, and protect your information.</p>
        <div className="mt-8 space-y-6 text-slate-300">
          <section>
            <h2 className="text-xl font-semibold text-white">Information We Collect</h2>
            <p className="mt-3">We collect account information, contact details, usage analytics, location data for tracking, and payment metadata. Passwords are always stored securely using hashing.</p>
          </section>
          <section>
            <h2 className="text-xl font-semibold text-white">Cookies and Tracking</h2>
            <p className="mt-3">Cookies are used for secure sessions, consent management, and anonymous analytics. We do not sell your personal data.</p>
          </section>
          <section>
            <h2 className="text-xl font-semibold text-white">Data Security</h2>
            <p className="mt-3">We use JWT authentication, bcrypt hashing, and secure transport protocols. Access to backend systems is protected with environment secrets.</p>
          </section>
          <section>
            <h2 className="text-xl font-semibold text-white">Your Rights</h2>
            <p className="mt-3">Users may request corrections or account deletion through support. We respect GDPR-style rights for eligible users and maintain data access controls.</p>
          </section>
        </div>
      </div>
    </main>
  );
}
