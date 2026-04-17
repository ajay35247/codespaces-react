import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { buildApiUrl } from '../utils/api';

export function VerifyEmail() {
  const { token } = useParams();
  const [status, setStatus] = useState('pending');
  const navigate = useNavigate();

  useEffect(() => {
    async function verify() {
      try {
        const response = await fetch(buildApiUrl(`/auth/verify-email/${token}`), {
          credentials: 'include',
        });
        if (!response.ok) throw new Error('Verification failed');
        setStatus('success');
        setTimeout(() => navigate('/login'), 2000);
      } catch (error) {
        setStatus('error');
      }
    }
    verify();
  }, [token, navigate]);

  return (
    <main className="mx-auto max-w-3xl px-6 py-16 sm:px-10">
      <div className="rounded-[2rem] bg-slate-950/90 p-10 shadow-2xl shadow-slate-900/20 text-center">
        <p className="text-sm uppercase tracking-[0.28em] text-orange-300">Email verification</p>
        <h1 className="mt-4 text-4xl font-semibold text-white">Verify your email</h1>
        <p className="mt-3 text-slate-300">
          {status === 'pending' && 'Verifying your account...'}
          {status === 'success' && 'Your email has been verified. Redirecting to login...'}
          {status === 'error' && 'Verification failed or link expired. Please contact support.'}
        </p>
      </div>
    </main>
  );
}
