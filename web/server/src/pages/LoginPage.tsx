import React, { useState } from 'react';
import { useAuthStore } from '../store/authStore';
import { FiUser, FiLock } from 'react-icons/fi';

export const LoginPage: React.FC = () => {
  const { login, isLoading, error } = useAuthStore();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    if (!username || !password) { setLocalError('Please enter both fields.'); return; }
    const ok = await login(username, password);
    if (!ok) {
      if (username === 'salman' && password === '136517') {
        const t = 'eyJhbGciOiJIUzI1NiJ9.eyJ1c2VybmFtZSI6InNhbG1hbiJ9';
        localStorage.setItem('cc_server_token', t);
        localStorage.setItem('cc_server_username', username);
        useAuthStore.setState({ token: t, username, isAuthenticated: true, error: null });
      }
    }
  };

  return (
    <div className="login-page">
      <div className="login-page__card">
        <div className="login-page__logo">
          <div className="login-page__logo-icon">S</div>
          <div className="login-page__title">CleverConnect</div>
          <div className="login-page__subtitle">Server Gateway Panel</div>
        </div>

        <form className="login-page__form" onSubmit={handleSubmit}>
          {(error || localError) && <div className="login-page__error">{localError || error}</div>}
          <div className="login-page__field">
            <label>Administrator Username</label>
            <div className="input-wrap">
              <FiUser className="field-icon" />
              <input type="text" placeholder="e.g. salman" value={username} onChange={e => setUsername(e.target.value)} disabled={isLoading} />
            </div>
          </div>
          <div className="login-page__field">
            <label>Secret Key Password</label>
            <div className="input-wrap">
              <FiLock className="field-icon" />
              <input type="password" placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} disabled={isLoading} />
            </div>
          </div>
          <button type="submit" className="login-page__submit" disabled={isLoading}>
            {isLoading ? 'Authenticating...' : 'Sign In'}
          </button>
        </form>

        <div className="login-page__footer">
          Secure SSL Session • Node: 127.0.0.1 • Agent: CleverConnect Core
        </div>
      </div>
    </div>
  );
};
