import { useState } from 'react';
import { cardAsset } from '@goc/shared';
import { useAuth } from '../store/auth.ts';

const FAN = ['SA', 'HK', 'DQ', 'CJ', 'ST'];

export function AuthPage() {
  const { login, register } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [form, setForm] = useState({ login: '', username: '', email: '', password: '', displayName: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      if (mode === 'login') await login(form.login, form.password);
      else await register({ username: form.username, email: form.email, password: form.password, displayName: form.displayName || undefined });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-screen place-items-center p-4">
      <div className="w-full max-w-sm">
        <div className="relative mx-auto mb-6 h-36 w-64">
          {FAN.map((c, i) => (
            <img
              key={c}
              src={cardAsset(c)}
              alt=""
              className="absolute bottom-0 left-1/2 w-20 drop-shadow-xl"
              style={{ transform: `translateX(-50%) rotate(${(i - 2) * 12}deg)`, transformOrigin: '50% 120%' }}
            />
          ))}
        </div>
        <h1 className="text-center font-display text-4xl text-gold-300">Game of Cards</h1>
        <p className="mt-1 text-center text-cream/60">Callbreak, Hold'em and Blackjack with your friends.</p>

        <form onSubmit={submit} className="panel mt-6 space-y-3 p-5">
          <div className="mb-1 grid grid-cols-2 rounded-lg bg-black/30 p-1 text-sm font-semibold">
            {(['login', 'register'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => {
                  setMode(m);
                  setError('');
                }}
                className={`rounded-md py-1.5 transition ${mode === m ? 'bg-gold-400 text-felt-950' : 'text-cream/70'}`}
              >
                {m === 'login' ? 'Log in' : 'Create account'}
              </button>
            ))}
          </div>
          {mode === 'login' ? (
            <input className="input" placeholder="Username or email" autoComplete="username" value={form.login} onChange={set('login')} required />
          ) : (
            <>
              <input className="input" placeholder="Username" autoComplete="username" value={form.username} onChange={set('username')} required />
              <input className="input" placeholder="Display name (optional)" value={form.displayName} onChange={set('displayName')} maxLength={24} />
              <input className="input" type="email" placeholder="Email" autoComplete="email" value={form.email} onChange={set('email')} required />
            </>
          )}
          <input
            className="input"
            type="password"
            placeholder="Password"
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            value={form.password}
            onChange={set('password')}
            required
          />
          {error && <p className="text-sm text-ember">{error}</p>}
          <button className="btn-gold w-full py-2.5" disabled={busy}>
            {busy ? '…' : mode === 'login' ? 'Log in' : 'Create account'}
          </button>
          {mode === 'register' && <p className="text-center text-xs text-cream/50">New players start with 5,000 chips.</p>}
        </form>
      </div>
    </div>
  );
}
