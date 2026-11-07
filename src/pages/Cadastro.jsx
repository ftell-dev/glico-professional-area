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
  const [stage, setStage] = useState('form')
  const [verificationCode, setVerificationCode] = useState('')
  const [phoneToVerify, setPhoneToVerify] = useState('')

  if (user && stage === 'form') return <Navigate to="/painel" replace />

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
    const phoneDigits = form.phone.replace(/\D/g, '')
    const phone = phoneDigits.length === 11
      ? `+55${phoneDigits}`
      : phoneDigits.startsWith('55') && phoneDigits.length === 13
        ? `+${phoneDigits}`
        : ''
    if (!phone) {
      setError('Informe um telefone celular válido com DDD.')
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
      phone,
      password: form.password,
      options: {
        channel: 'sms',
        data: {
          full_name: form.fullName.trim(),
          cpf: cleanCpf(form.cpf),
          profession: form.profession,
          registration_type: selectedProfession.registration,
          registration_number: form.registrationNumber.trim(),
          registration_state: form.registrationState,
          phone,
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
      const { error: signOutError } = await supabase.auth.signOut()
      setError(signOutError
        ? `A confirmação por SMS está desativada no Supabase e não foi possível encerrar a sessão: ${signOutError.message}`
        : 'A confirmação por SMS está desativada no Supabase. Ative a confirmação de telefone para concluir o cadastro.')
      return
    }

    setPhoneToVerify(phone)
    setStage('verify')
    setSuccess(`Enviamos um código por SMS para ${form.phone}.`)
  }

  async function handleVerifyPhone(event) {
    event.preventDefault()
    setError('')
    setSuccess('')
    setStage('verifying')
    setSubmitting(true)

    const { error: verificationError } = await supabase.auth.verifyOtp({
      phone: phoneToVerify,
      token: verificationCode.trim(),
      type: 'sms',
    })

    setSubmitting(false)
    if (verificationError) {
      setStage('verify')
      setError(verificationError.message)
      return
    }

    setStage('verified')
    await finishRegistration()
  }

  async function resendVerificationCode() {
    setError('')
    setSuccess('')
    setSubmitting(true)

    const { error: resendError } = await supabase.auth.resend({
      type: 'sms',
      phone: phoneToVerify,
    })

    setSubmitting(false)
    if (resendError) {
      setError(resendError.message)
      return
    }

    setSuccess(`Enviamos um novo código por SMS para ${form.phone}.`)
  }

  async function finishRegistration(event) {
    event?.preventDefault()
    setError('')
    setSuccess('')
    setSubmitting(true)

    const { error: emailError } = await supabase.auth.updateUser(
      { email: form.email.trim() },
      { emailRedirectTo: `${window.location.origin}/painel` },
    )

    setSubmitting(false)
    if (emailError) {
      setError(emailError.message)
      return
    }

    navigate('/painel')
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

          <form className="form-stack" onSubmit={stage === 'form' ? handleSubmit : stage === 'verify' ? handleVerifyPhone : finishRegistration}>
            {stage === 'form' && <>
              <span className="section-label form-section-label">DADOS PESSOAIS</span>
              <FormField label="Nome completo" name="fullName" autoComplete="name" placeholder="Como aparece no seu registro" value={form.fullName} onChange={updateField} required disabled={!configured} />
              <div className="form-grid">
                <FormField label="CPF" name="cpf" inputMode="numeric" autoComplete="off" placeholder="000.000.000-00" value={formatCpf(form.cpf)} onChange={(event) => setForm((current) => ({ ...current, cpf: cleanCpf(event.target.value) }))} required disabled={!configured} />
                <FormField label="Telefone com DDD" name="phone" type="tel" inputMode="tel" autoComplete="tel-national" placeholder="(11) 99999-9999" value={form.phone} onChange={updateField} required disabled={!configured} />
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
                <FormField label={`Número ${selectedProfession?.registration ?? 'do registro'}`} name="registrationNumber" inputMode={selectedProfession?.registration === 'CRM' ? 'numeric' : undefined} placeholder={selectedProfession?.registration === 'CRM' ? 'Número do CRM' : 'Número do registro'} value={form.registrationNumber} onChange={updateField} required disabled={!configured || !selectedProfession} />
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
                {submitting ? 'Enviando código...' : 'Continuar e verificar telefone'}
                {!submitting && <span aria-hidden="true">→</span>}
              </button>
            </>}

            {stage === 'verify' && <>
              <span className="section-label form-section-label">VERIFICAÇÃO DO TELEFONE</span>
              <p>Digite o código enviado por SMS para {form.phone}.</p>
              <FormField label="Código de verificação" name="verificationCode" type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} placeholder="000000" value={verificationCode} onChange={(event) => setVerificationCode(event.target.value.replace(/\D/g, '').slice(0, 6))} required disabled={!configured || submitting} />
              <button className="button button-primary button-full" type="submit" disabled={!configured || submitting}>
                {submitting ? 'Verificando...' : 'Confirmar telefone'}
              </button>
              <button className="button button-full" type="button" onClick={resendVerificationCode} disabled={!configured || submitting}>
                Reenviar código
              </button>
            </>}

            {stage === 'verifying' && <p role="status">Verificando seu telefone...</p>}

            {stage === 'verified' && <>
              <span className="section-label form-section-label">TELEFONE CONFIRMADO</span>
              <p>Confirme o e-mail para concluir o cadastro.</p>
              <FormField label="E-mail profissional" name="email" type="email" autoComplete="email" placeholder="voce@exemplo.com" value={form.email} onChange={updateField} required disabled={!configured || submitting} />
              <button className="button button-primary button-full" type="submit" disabled={!configured || submitting}>
                {submitting ? 'Concluindo cadastro...' : 'Concluir cadastro'}
              </button>
            </>}
          </form>

          <p className="auth-switch">Já tem uma conta? <Link to="/login">Entrar</Link></p>
        </div>
      </section>
    </main>
  )
}