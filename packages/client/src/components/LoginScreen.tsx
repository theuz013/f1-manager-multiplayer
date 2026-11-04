import React, { useState } from 'react';

export interface AuthUser {
  id: string;
  username: string;
  name: string;
}

export default function LoginScreen({ onLogin }: { onLogin: (user: AuthUser) => void }) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/auth/${mode}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha na autenticação');
      localStorage.setItem('f1m_token', data.token);
      onLogin(data.user);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: '24px' }}>
      <form className="card" onSubmit={submit} style={{ width: '100%', maxWidth: '360px', display: 'grid', gap: '14px' }}>
        <h2>🏎️ F1 Manager 2026</h2>
        <p style={{ color: 'var(--muted)', margin: 0, fontSize: '0.9rem' }}>
          {mode === 'login' ? 'Entre com sua conta de gerente.' : 'Crie sua conta de gerente.'}
        </p>

        <label style={{ display: 'grid', gap: '6px', color: 'var(--label)' }}>
          Usuário
          <input autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} required />
        </label>
        <label style={{ display: 'grid', gap: '6px', color: 'var(--label)' }}>
          Senha
          <input
            type="password"
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>

        {error && <p role="alert" style={{ color: '#ff5a5a', margin: 0, fontSize: '0.88rem' }}>{error}</p>}

        <button className="primary" type="submit" disabled={loading}>
          {loading ? 'Aguarde...' : mode === 'login' ? 'Entrar' : 'Criar conta'}
        </button>
        <button type="button" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(null); }}>
          {mode === 'login' ? 'Não tem conta? Criar conta' : 'Já tem conta? Entrar'}
        </button>
      </form>
    </div>
  );
}
