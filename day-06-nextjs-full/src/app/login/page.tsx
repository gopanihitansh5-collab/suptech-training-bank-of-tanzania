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
            <div className="brand-subtitle">Day 6 · Local training</div>
          </div>
        </div>
        <h1>Sign in to the demo</h1>
        <p>Use the local demo credentials configured in your private <code>.env</code> file.</p>
        <LoginForm />
        <div className="login-note">
          Synthetic training records only. This local sign-in is not a production identity system.
        </div>
      </section>
    </main>
  );
}
