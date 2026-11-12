import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { loginAccount } from '../api/client'
import '../styles/sentinel-ui.css'

export default function Login() {
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  async function submit(event) {
    event.preventDefault(); setBusy(true); setError('')
    try { const result = await loginAccount(email, password); navigate(result.user?.household_id ? '/dashboard' : '/register') }
    catch (err) { setError(err.message) }
    finally { setBusy(false) }
  }
  return <main className="auth-shell"><section className="auth-card">
    <span className="eyebrow">SENTINELHOME ACCESS</span><h1>Welcome back.</h1>
    <p>Sign in to continue monitoring your registered household.</p>
    <form onSubmit={submit} className="auth-form">
      <label>Email<input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" /></label>
      <label>Password<input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" /></label>
      {error && <div className="auth-error">{error}</div>}
      <button disabled={busy}>{busy ? 'Signing in…' : 'Sign in →'}</button>
    </form>
    <p className="auth-footer">New to SentinelHome? <Link to="/register" state={{ from: location.pathname }}>Create an account</Link></p>
  </section></main>
}
