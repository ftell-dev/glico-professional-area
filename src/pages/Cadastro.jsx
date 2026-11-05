import { useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import ConfigurationNotice from '../components/ConfigurationNotice'
import FormField from '../components/FormField'
import { useAuth } from '../AuthContext'
import { cleanCpf, formatCpf, isValidCpf } from '../lib/cpf'
import { supabase } from '../lib/supabaseClient'

const professions = [
  { label: 'Médico(a) / Endocrinologista', registration: 'CRM' },
  { label: 'Nutricionista', registration: 'CRN' },
  { label: 'Educador(a) físico(a) / Personal trainer', registration: 'CREF' },
  { label: 'Enfermeiro(a)', registration: 'COREN' },
  { label: 'Psicólogo(a)', registration: 'CRP' },
  { label: 'Farmacêutico(a)', registration: 'CRF' },
]

const states = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO']

export default function Cadastro() {
  const { user, configured } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState({
    fullName: '', cpf: '', email: '', password: '', confirmPassword: '', profession: '',
    registrationNumber: '', registrationState: '', phone: '', termsAccepted: false,
  })
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [submitting, setSubmitting] = useState(false)

  if (user) return <Navigate to="/painel" replace />

  const selectedProfession = professions.find((profession) => profession.label === form.profession)

  function updateField(event) {
    const { name, value, checked, type } = event.target
    setForm((current) => ({ ...current, [name]: type === 'checkbox' ? checked : value }))
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    setSuccess('')

    if (!isValidCpf(form.cpf)) {
      setError('Informe um CPF válido.')
      return
    }
    if (form.password.length < 8) {
      setError('A senha precisa ter pelo menos 8 caracteres.')
      return
    }
    if (form.password !== form.confirmPassword) {
      setError('As senhas não coincidem.')
      return
    }
    if (!form.termsAccepted) {
      setError('É necessário aceitar os termos de uso para continuar.')
      return
    }

    setSubmitting(true)
    const { data, error: signUpError } = await supabase.auth.signUp({
      email: form.email.trim(),
      password: form.password,
      options: {
        data: {
          full_name: form.fullName.trim(),
          cpf: cleanCpf(form.cpf),
          profession: form.profession,
          registration_type: selectedProfession.registration,
          registration_number: form.registrationNumber.trim(),
          registration_state: form.registrationState,
          phone: form.phone.trim() || null,
          terms_accepted: form.termsAccepted,
        },
      },
    })
    setSubmitting(false)

    if (signUpError) {
      setError(signUpError.message)
      return
    }
    if (data.session) {
      navigate('/painel')
      return
    }

    setSuccess('Cadastro recebido. Verifique seu e-mail para confirmar a conta. O acesso ao painel será liberado após a aprovação do registro profissional.')
  }

  return (
    <main className="auth-layout auth-layout-register">
      <section className="auth-brand" aria-label="Glico">
        <Link className="brand-mark" to="/login" aria-label="Glico, início"><span>g</span></Link>
        <p className="eyebrow">GLICO <span>·</span> ÁREA PROFISSIONAL</p>
        <h1>Uma equipe inteira, em sintonia com cada jornada.</h1>
        <p className="brand-copy">Cadastre-se para acompanhar seus pacientes com uma visão mais conectada do cuidado.</p>
        <div className="brand-rule"><span /></div>
        <span className="brand-caption">CADASTRO SUJEITO À APROVAÇÃO PROFISSIONAL</span>
      </section>

      <section className="auth-panel-wrap">
        <div className="auth-panel register-panel">
          <header className="page-heading">
            <span className="section-label">NOVO ACESSO</span>
            <h2>Cadastro profissional</h2>
            <p>Seus dados serão analisados antes da liberação.</p>
          </header>

          {!configured && <ConfigurationNotice />}
          {error && <div className="notice notice-error" role="alert">{error}</div>}
          {success && <div className="notice notice-success" role="status">{success}</div>}

          <form className="form-stack" onSubmit={handleSubmit}>
            <span className="section-label form-section-label">DADOS PESSOAIS</span>
            <FormField label="Nome completo" name="fullName" autoComplete="name" placeholder="Como aparece no seu registro" value={form.fullName} onChange={updateField} required disabled={!configured} />
            <div className="form-grid">
              <FormField label="CPF" name="cpf" inputMode="numeric" autoComplete="off" placeholder="000.000.000-00" value={formatCpf(form.cpf)} onChange={(event) => setForm((current) => ({ ...current, cpf: cleanCpf(event.target.value) }))} required disabled={!configured} />
              <FormField label="Telefone (opcional)" name="phone" type="tel" autoComplete="tel" placeholder="(00) 00000-0000" value={form.phone} onChange={updateField} disabled={!configured} />
            </div>
            <FormField label="E-mail profissional" name="email" type="email" autoComplete="email" placeholder="voce@exemplo.com" value={form.email} onChange={updateField} required disabled={!configured} />

            <span className="section-label form-section-label">REGISTRO PROFISSIONAL</span>
            <div className="field">
              <label htmlFor="profession">Profissão</label>
              <select id="profession" name="profession" value={form.profession} onChange={(event) => setForm((current) => ({ ...current, profession: event.target.value, registrationNumber: '', registrationState: '' }))} required disabled={!configured}>
                <option value="" disabled>Selecione sua profissão</option>
                {professions.map((profession) => <option key={profession.registration} value={profession.label}>{profession.label}</option>)}
              </select>
            </div>
            <div className="form-grid registration-grid">
              <FormField label={`Número ${selectedProfession?.registration ?? 'do registro'}`} name="registrationNumber" placeholder="Número do registro" value={form.registrationNumber} onChange={updateField} required disabled={!configured || !selectedProfession} />
              <div className="field">
                <label htmlFor="registrationState">UF do registro</label>
                <select id="registrationState" name="registrationState" value={form.registrationState} onChange={updateField} required disabled={!configured || !selectedProfession}>
                  <option value="" disabled>UF</option>
                  {states.map((state) => <option key={state} value={state}>{state}</option>)}
                </select>
              </div>
            </div>

            <span className="section-label form-section-label">SEGURANÇA DA CONTA</span>
            <div className="form-grid">
              <FormField label="Senha" name="password" type="password" autoComplete="new-password" placeholder="Mínimo de 8 caracteres" minLength={8} value={form.password} onChange={updateField} required disabled={!configured} />
              <FormField label="Confirmar senha" name="confirmPassword" type="password" autoComplete="new-password" placeholder="Repita sua senha" minLength={8} value={form.confirmPassword} onChange={updateField} required disabled={!configured} />
            </div>
            <label className="checkbox-field">
              <input type="checkbox" name="termsAccepted" checked={form.termsAccepted} onChange={updateField} required disabled={!configured} />
              <span>Li e aceito os termos de uso e a política de privacidade.</span>
            </label>

            <button className="button button-primary button-full" type="submit" disabled={!configured || submitting}>
              {submitting ? 'Enviando cadastro...' : 'Solicitar acesso'}
              {!submitting && <span aria-hidden="true">→</span>}
            </button>
          </form>

          <p className="auth-switch">Já tem uma conta? <Link to="/login">Entrar</Link></p>
        </div>
      </section>
    </main>
  )
}