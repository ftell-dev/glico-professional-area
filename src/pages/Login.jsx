import { useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import ConfigurationNotice from '../components/ConfigurationNotice'
import FormField from '../components/FormField'
import { useAuth } from '../AuthContext'
import { supabase } from '../lib/supabaseClient'

export default function Login() {
  const { user, configured } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  if (user) return <Navigate to="/painel" replace />

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    setSubmitting(true)

    const { error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim(), password })

    setSubmitting(false)
    if (signInError) {
      setError(signInError.message === 'Invalid login credentials'
        ? 'E-mail ou senha incorretos.'
        : signInError.message)
      return
    }

    navigate('/painel')
  }

  return (
    <main className="auth-layout">
      <section className="auth-brand" aria-label="Glico">
        <Link className="brand-mark" to="/login" aria-label="Glico, início"><span>g</span></Link>
        <p className="eyebrow">GLICO <span>·</span> ÁREA PROFISSIONAL</p>
        <h1>Cuidado conectado começa com quem cuida.</h1>
        <p className="brand-copy">Um espaço dedicado aos profissionais que acompanham a jornada de cada pessoa.</p>
        <div className="brand-rule"><span /></div>
        <span className="brand-caption">ACESSO EXCLUSIVO A PROFISSIONAIS DE SAÚDE</span>
      </section>

      <section className="auth-panel-wrap">
        <div className="auth-panel">
          <header className="page-heading">
            <span className="section-label">BEM-VINDO DE VOLTA</span>
            <h2>Entrar na sua conta</h2>
            <p>Acesse seu espaço profissional Glico.</p>
          </header>

          {!configured && <ConfigurationNotice />}
          {error && <div className="notice notice-error" role="alert">{error}</div>}

          <form className="form-stack" onSubmit={handleSubmit}>
            <FormField label="E-mail profissional" name="email" type="email" autoComplete="email" placeholder="voce@exemplo.com" value={email} onChange={(event) => setEmail(event.target.value)} required disabled={!configured} />
            <FormField label="Senha" name="password" type="password" autoComplete="current-password" placeholder="Sua senha" value={password} onChange={(event) => setPassword(event.target.value)} required disabled={!configured} />
            <button className="button button-primary button-full" type="submit" disabled={!configured || submitting}>
              {submitting ? 'Entrando...' : 'Entrar'}
              {!submitting && <span aria-hidden="true">→</span>}
            </button>
          </form>

          <p className="auth-switch">Ainda não tem acesso? <Link to="/cadastro">Solicite seu cadastro</Link></p>
          <p className="auth-footnote">Acesso restrito a profissionais de saúde cadastrados.</p>
        </div>
      </section>
    </main>
  )
}