import { useState } from 'react';

const API = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000';

function AuthModal({ onClose, onLoginSuccess }) {
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    const endpoint = isLogin ? '/login' : '/register';

    try {
      const resp = await fetch(`${API}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });

      const data = await resp.json();

      if (!resp.ok) {
        throw new Error(data.detail || 'Server error');
      }

      if (isLogin) {
        localStorage.setItem('auth_token', data.access_token);
        localStorage.setItem('auth_username', username);
        onLoginSuccess(username);
      } else {
        alert('Registration successful, you can now sign in.');
        setIsLogin(true);
        setPassword('');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="p2f-modal-backdrop">

      <div className="p2f-modal p2f-auth" role="dialog" aria-modal="true" aria-labelledby="p2f-auth-title">

        <button type="button" onClick={onClose} className="p2f-icon-btn p2f-auth__close" aria-label="Close">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </button>

        <div className="p2f-auth__head">
          <h2 id="p2f-auth-title" className="p2f-auth__title">
            {isLogin ? 'Welcome back' : 'Create an account'}
          </h2>
          <p className="p2f-auth__sub">
            Sign in to save diagrams to the catalog.
          </p>
        </div>

        {error && (
          <div className="p2f-alert p2f-alert--error" role="alert">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="p2f-auth__form">

          <label className="p2f-label">
            Username
            <input
              type="text" required value={username} onChange={e => setUsername(e.target.value)}
              placeholder="Enter your username..."
              autoComplete="username"
              className="p2f-field"
            />
          </label>

          <label className="p2f-label">
            Password
            <input
              type="password" required value={password} onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete={isLogin ? 'current-password' : 'new-password'}
              className="p2f-field"
            />
          </label>

          <button
            type="submit" disabled={isLoading}
            className="p2f-btn p2f-btn--primary p2f-btn--lg"
          >
            {isLoading && <span className="p2f-spinner" aria-hidden="true" />}
            {isLoading ? 'Processing...' : (isLogin ? 'Sign in' : 'Sign up')}
          </button>
        </form>

        <div className="p2f-auth__switch">
          {isLogin ? "Don't have an account yet? " : "Already have an account? "}
          <button
            type="button" onClick={() => { setIsLogin(!isLogin); setError(''); }}
            className="p2f-link"
          >
            {isLogin ? 'Sign up' : 'Sign in'}
          </button>
        </div>

      </div>
    </div>
  );
}

export default AuthModal;
