import { redirect } from 'next/navigation';
import { LoginForm } from '@/components/login-form';
import { getDemoSession } from '@/lib/auth';

export default async function LoginPage() {
  if (await getDemoSession()) redirect('/');

  return (
    <main className="login-screen">
      <section className="login-card">
        <div className="brand">
          <div className="brand-mark" aria-hidden="true">S</div>
          <div>
            <div className="brand-title">SupTech Monitor</div>
            <div className="brand-subtitle">Supervisory intelligence</div>
          </div>
        </div>
        <h1>Sign in to SupTech Monitor</h1>
        <p>Use the demo account configured for this training environment.</p>
        <LoginForm />
        <div className="login-note">
          Synthetic training records only. Demo access is not an official Bank of Tanzania identity system.
        </div>
      </section>
    </main>
  );
}
