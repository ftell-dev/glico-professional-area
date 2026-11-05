import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import StatusBadge from '../components/StatusBadge'
import { useAuth } from '../AuthContext'
import { supabase } from '../lib/supabaseClient'

const statusContent = {
  pending: {
    title: 'Seu cadastro está em análise',
    description: 'Vamos revisar seus dados profissionais. O acesso às próximas etapas será liberado assim que a análise for concluída.',
    color: 'orange',
  },
  approved: {
    title: 'Seu acesso está liberado',
    description: 'Seu registro profissional foi aprovado. Esta área será seu ponto de partida para acompanhar sua prática na Glico.',
    color: 'green',
  },
  rejected: {
    title: 'Cadastro não aprovado',
    description: 'Não foi possível aprovar seus dados profissionais. Entre em contato com a equipe Glico para entender os próximos passos.',
    color: 'red',
  },
}

export default function Painel() {
  const { user, profile, loading, profileError } = useAuth()
  const [signingOut, setSigningOut] = useState(false)
  const [patients, setPatients] = useState([])
  const [selectedPatientId, setSelectedPatientId] = useState('')
  const [readings, setReadings] = useState([])
  const [dietEntries, setDietEntries] = useState([])
  const [medications, setMedications] = useState([])
  const [patientLoading, setPatientLoading] = useState(false)
  const [detailLoading, setDetailLoading] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)
  const [view, setView] = useState('15days')
  const [selectedDate, setSelectedDate] = useState(localDate())
  const [patientName, setPatientName] = useState('')
  const [glucose, setGlucose] = useState('')
  const [measuredAt, setMeasuredAt] = useState(localDateTime())
  const [mealTiming, setMealTiming] = useState('before')
  const [dietDate, setDietDate] = useState(localDate())
  const [dietNotes, setDietNotes] = useState('')
  const [medicationForm, setMedicationForm] = useState({
    name: '', insulinType: '', dose: '', schedulePeriod: 'morning',
    scheduleLabel: '', instructions: '', riskWarnings: '',
  })
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!user || profile?.status !== 'approved' || !supabase) return undefined
    let active = true
    setPatientLoading(true)
    supabase.from('patients').select('id, full_name, created_at').order('full_name').then(({ data, error: queryError }) => {
      if (!active) return
      if (queryError) setError('Não foi possível carregar os pacientes. Confira se as tabelas do Supabase foram atualizadas.')
      else {
        setPatients(data ?? [])
        setSelectedPatientId((current) => data?.some((patient) => patient.id === current) ? current : data?.[0]?.id ?? '')
      }
      setPatientLoading(false)
    })
    return () => { active = false }
  }, [user, profile?.status, refreshKey])

  useEffect(() => {
    if (!selectedPatientId || !supabase) {
      setReadings([])
      setDietEntries([])
      setMedications([])
      return undefined
    }
    let active = true
    setDetailLoading(true)
    Promise.all([
      supabase.from('glucose_readings').select('id, measured_at, glucose_mg_dl, meal_timing').eq('patient_id', selectedPatientId).order('measured_at', { ascending: false }),
      supabase.from('diet_entries').select('id, entry_date, notes, created_at').eq('patient_id', selectedPatientId).order('entry_date', { ascending: false }),
      supabase.from('medications').select('id, name, insulin_type, dose, schedule_period, schedule_label, instructions, risk_warnings').eq('patient_id', selectedPatientId).order('created_at', { ascending: false }),
    ]).then(([readingResult, dietResult, medicationResult]) => {
      if (!active) return
      const queryError = readingResult.error || dietResult.error || medicationResult.error
      setError(queryError ? 'Não foi possível carregar os dados deste paciente. Confira o schema do Supabase.' : '')
      setReadings(readingResult.data ?? [])
      setDietEntries(dietResult.data ?? [])
      setMedications(medicationResult.data ?? [])
      setDetailLoading(false)
    })
    return () => { active = false }
  }, [selectedPatientId, refreshKey])

  if (!loading && !user) return <Navigate to="/login" replace />

  const currentStatus = profile?.status ?? 'pending'
  const content = statusContent[currentStatus] ?? statusContent.pending
  const selectedPatient = patients.find((patient) => patient.id === selectedPatientId)
  const visibleReadings = readings.filter((reading) => {
    const day = dateKey(reading.measured_at)
    if (view === 'day') return day === selectedDate
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - 14)
    return new Date(reading.measured_at) >= cutoff
  }).sort((first, second) => new Date(first.measured_at) - new Date(second.measured_at))

  async function handleSignOut() {
    setSigningOut(true)
    await supabase.auth.signOut()
    setSigningOut(false)
  }

  async function handleCreatePatient(event) {
    event.preventDefault()
    await submitAction(async () => {
      const { data, error: insertError } = await supabase.from('patients').insert({ professional_id: user.id, full_name: patientName.trim() }).select('id, full_name').single()
      if (insertError) throw insertError
      setPatients((current) => [...current, data].sort((first, second) => first.full_name.localeCompare(second.full_name)))
      setSelectedPatientId(data.id)
      setPatientName('')
      setNotice('Paciente adicionado.')
    })
  }

  async function handleAddReading(event) {
    event.preventDefault()
    await submitAction(async () => {
      const { error: insertError } = await supabase.from('glucose_readings').insert({
        patient_id: selectedPatientId,
        measured_at: new Date(measuredAt).toISOString(),
        glucose_mg_dl: Number(glucose),
        meal_timing: mealTiming,
      })
      if (insertError) throw insertError
      setGlucose('')
      setNotice('Medição registrada.')
      setRefreshKey((current) => current + 1)
    })
  }

  async function handleAddDietEntry(event) {
    event.preventDefault()
    await submitAction(async () => {
      const { error: insertError } = await supabase.from('diet_entries').insert({ patient_id: selectedPatientId, entry_date: dietDate, notes: dietNotes.trim() })
      if (insertError) throw insertError
      setDietNotes('')
      setNotice('Registro alimentar salvo.')
      setRefreshKey((current) => current + 1)
    })
  }

  async function handleAddMedication(event) {
    event.preventDefault()
    await submitAction(async () => {
      const { error: insertError } = await supabase.from('medications').insert({
        patient_id: selectedPatientId,
        name: medicationForm.name.trim(),
        insulin_type: medicationForm.insulinType,
        dose: medicationForm.dose.trim(),
        schedule_period: medicationForm.schedulePeriod,
        schedule_label: medicationForm.scheduleLabel.trim(),
        instructions: medicationForm.instructions.trim(),
        risk_warnings: medicationForm.riskWarnings.trim(),
      })
      if (insertError) throw insertError
      setMedicationForm({ name: '', insulinType: '', dose: '', schedulePeriod: 'morning', scheduleLabel: '', instructions: '', riskWarnings: '' })
      setNotice('Orientação de medicamento adicionada.')
      setRefreshKey((current) => current + 1)
    })
  }

  async function submitAction(action) {
    setError('')
    setNotice('')
    setSubmitting(true)
    try {
      await action()
    } catch {
      setError('Não foi possível salvar. Confira os dados e tente novamente.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="dashboard-shell">
      <header className="topbar">
        <a className="topbar-brand" href="/painel" aria-label="Glico, painel"><span className="brand-mark brand-mark-small">g</span><span>Glico <i>profissional</i></span></a>
        <button className="button button-destructive" type="button" onClick={handleSignOut} disabled={signingOut}>
          <span className="logout-icon" aria-hidden="true">↗</span>{signingOut ? 'Saindo...' : 'Sair'}
        </button>
      </header>

      <div className="dashboard-content">
        <header className="page-heading dashboard-heading">
          <span className="section-label">ÁREA PROFISSIONAL</span>
          <h1>Seu espaço de cuidado.</h1>
          <p>Olá{profile?.full_name ? `, ${profile.full_name.split(' ')[0]}` : ''}. Aqui começa sua experiência Glico.</p>
        </header>

        {loading ? (
          <div className="loading-state" role="status">Carregando seu perfil...</div>
        ) : profileError ? (
          <div className="notice notice-error" role="alert">{profileError} Confira se o schema do Supabase foi aplicado.</div>
        ) : !profile ? (
          <div className="notice notice-warning" role="status">Seu perfil ainda não está disponível. Se você acabou de se cadastrar, confirme seu e-mail e aguarde a sincronização.</div>
        ) : (
          <>
            <section className={`review-banner review-${content.color}`}>
              <div className="review-indicator" aria-hidden="true"><span /></div>
              <div className="review-copy"><span className="section-label">STATUS DO CADASTRO</span><h2>{content.title}</h2><p>{content.description}</p></div>
              <StatusBadge status={currentStatus} />
            </section>

            {error && <div className="notice notice-error dashboard-alert" role="alert">{error}</div>}
            {notice && <div className="notice notice-success dashboard-alert" role="status">{notice}</div>}

            <section className="profile-section">
              <div className="section-heading"><span className="section-label">SEU PERFIL</span><span className="profile-lock">● Dados protegidos</span></div>
              <div className="profile-card">
                <div className="profile-avatar" aria-hidden="true">{profile.full_name?.trim().charAt(0)?.toUpperCase() || 'P'}</div>
                <div className="profile-main"><h2>{profile.full_name}</h2><p>{profile.profession}</p></div>
                <div className="profile-registration"><span className="section-label">REGISTRO PROFISSIONAL</span><strong>{profile.registration_type} {profile.registration_number} <span>/ {profile.registration_state}</span></strong></div>
              </div>
            </section>

            {currentStatus === 'approved' ? (
              <div className="care-layout">
                <aside className="patient-sidebar">
                  <div className="section-heading"><span className="section-label">PACIENTES</span><span className="patient-count">{patients.length}</span></div>
                  <form className="patient-create" onSubmit={handleCreatePatient}>
                    <label className="field-label" htmlFor="patient-name">Adicionar paciente</label>
                    <div className="inline-form"><input id="patient-name" value={patientName} onChange={(event) => setPatientName(event.target.value)} placeholder="Nome completo" required /><button className="button button-primary" type="submit" disabled={submitting}>Adicionar</button></div>
                  </form>
                  {patientLoading ? <p className="empty-copy">Carregando pacientes...</p> : patients.length ? (
                    <nav className="patient-list" aria-label="Lista de pacientes">
                      {patients.map((patient) => <button className={`patient-option${patient.id === selectedPatientId ? ' is-selected' : ''}`} type="button" key={patient.id} onClick={() => setSelectedPatientId(patient.id)}><span className="patient-avatar" aria-hidden="true">{patient.full_name.charAt(0).toUpperCase()}</span><span>{patient.full_name}</span><span className="patient-arrow" aria-hidden="true">›</span></button>)}
                    </nav>
                  ) : <p className="empty-copy">Nenhum paciente cadastrado.</p>}
                </aside>

                <section className="patient-workspace" aria-live="polite">
                  {!selectedPatient ? <div className="workspace-empty"><span className="section-label">ACOMPANHAMENTO</span><h2>Comece pela sua lista de pacientes.</h2><p>Adicione um paciente para registrar medições, acompanhar a alimentação e organizar medicações.</p></div> : <>
                    <header className="patient-heading"><div><span className="section-label">ACOMPANHAMENTO DO PACIENTE</span><h2>{selectedPatient.full_name}</h2></div><span className="patient-record-label">PRONTUÁRIO</span></header>

                    <section className="data-section glucose-section">
                      <div className="section-heading"><div><span className="section-label">CURVA GLICÊMICA</span><h3>Variação das medições</h3></div><div className="view-switch" role="group" aria-label="Período da curva"><button type="button" className={view === '15days' ? 'is-active' : ''} onClick={() => setView('15days')}>15 dias</button><button type="button" className={view === 'day' ? 'is-active' : ''} onClick={() => setView('day')}>Dia específico</button></div></div>
                      {view === 'day' && <label className="date-picker">Data <input type="date" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} /></label>}
                      {detailLoading ? <p className="empty-copy">Carregando registros...</p> : <GlucoseChart readings={visibleReadings} />}
                      <div className="table-heading"><h4>Medições</h4><span>{visibleReadings.length} registros</span></div>
                      <div className="table-scroll"><table className="data-table"><thead><tr><th>Data e hora</th><th>Glicemia</th><th>Relação com refeição</th></tr></thead><tbody>{visibleReadings.map((reading) => <tr key={reading.id}><td>{formatDateTime(reading.measured_at)}</td><td><strong>{reading.glucose_mg_dl} <small>mg/dL</small></strong></td><td><MealTiming value={reading.meal_timing} /></td></tr>)}</tbody></table>{!detailLoading && !visibleReadings.length && <p className="empty-copy table-empty">Sem medições neste período.</p>}</div>
                      <form className="entry-form glucose-form" onSubmit={handleAddReading}>
                        <span className="form-title">Registrar glicemia</span>
                        <label className="field"><span>Glicemia (mg/dL)</span><input type="number" min="20" max="1000" value={glucose} onChange={(event) => setGlucose(event.target.value)} placeholder="Ex.: 112" required /></label>
                        <label className="field"><span>Data e hora</span><input type="datetime-local" value={measuredAt} onChange={(event) => setMeasuredAt(event.target.value)} required /></label>
                        <label className="field"><span>Momento da refeição</span><select value={mealTiming} onChange={(event) => setMealTiming(event.target.value)}><option value="before">Antes de comer</option><option value="after">Após comer</option><option value="unrelated">Sem relação com refeição</option></select></label>
                        <button className="button button-primary" type="submit" disabled={submitting}>Salvar medição</button>
                      </form>
                    </section>

                    <section className="data-section">
                      <div className="section-heading"><div><span className="section-label">ALIMENTAÇÃO</span><h3>Contexto da dieta</h3></div><span className="section-symbol" aria-hidden="true">◷</span></div>
                      <form className="entry-form diet-form" onSubmit={handleAddDietEntry}>
                        <label className="field"><span>Data</span><input type="date" value={dietDate} onChange={(event) => setDietDate(event.target.value)} required /></label>
                        <label className="field diet-notes"><span>Observações alimentares</span><textarea rows="3" value={dietNotes} onChange={(event) => setDietNotes(event.target.value)} placeholder="Refeições, horários ou mudanças relatadas pelo paciente" required /></label>
                        <button className="button button-secondary" type="submit" disabled={submitting}>Salvar registro</button>
                      </form>
                      <div className="diet-list">{dietEntries.map((entry) => <article className="diet-entry" key={entry.id}><time>{formatDate(entry.entry_date)}</time><p>{entry.notes}</p></article>)}{!dietEntries.length && <p className="empty-copy">Ainda não há registros alimentares.</p>}</div>
                    </section>

                    <section className="data-section medication-section">
                      <div className="section-heading"><div><span className="section-label">PLANO TERAPÊUTICO</span><h3>Medicamentos</h3></div><span className="section-symbol" aria-hidden="true">✚</span></div>
                      <div className="medication-list">{medications.map((medication) => <MedicationItem key={medication.id} medication={medication} />)}{!medications.length && <p className="empty-copy">Nenhuma orientação de medicamento cadastrada.</p>}</div>
                      <form className="entry-form medication-form" onSubmit={handleAddMedication}>
                        <span className="form-title">Adicionar orientação</span>
                        <label className="field"><span>Medicamento</span><input value={medicationForm.name} onChange={(event) => setMedicationForm((current) => ({ ...current, name: event.target.value }))} placeholder="Nome do medicamento" required /></label>
                        <div className="form-grid">
                          <label className="field"><span>Tipo de insulina</span><select value={medicationForm.insulinType} onChange={(event) => setMedicationForm((current) => ({ ...current, insulinType: event.target.value }))} required><option value="" disabled>Selecione uma opção</option><option value="regular">Regular</option><option value="rapid">Ação rápida</option><option value="intermediate">Ação intermediária</option><option value="long">Ação longa</option><option value="other">Outro / não se aplica</option></select></label>
                          <label className="field"><span>Dosagem</span><input value={medicationForm.dose} onChange={(event) => setMedicationForm((current) => ({ ...current, dose: event.target.value }))} placeholder="Ex.: conforme prescrição" required /></label>
                        </div>
                        <div className="form-grid">
                          <label className="field"><span>Período</span><select value={medicationForm.schedulePeriod} onChange={(event) => setMedicationForm((current) => ({ ...current, schedulePeriod: event.target.value }))}><option value="morning">☀ Manhã</option><option value="afternoon">◉ Tarde</option><option value="evening">☾ Noite</option><option value="bedtime">⌂ Ao deitar</option><option value="custom">◷ Outro horário</option></select></label>
                          <label className="field"><span>Horário e frequência</span><input value={medicationForm.scheduleLabel} onChange={(event) => setMedicationForm((current) => ({ ...current, scheduleLabel: event.target.value }))} placeholder="Ex.: 30 min antes do jantar" required /></label>
                        </div>
                        <label className="field"><span>Passo a passo de uso</span><textarea rows="3" value={medicationForm.instructions} onChange={(event) => setMedicationForm((current) => ({ ...current, instructions: event.target.value }))} placeholder="Orientações definidas pelo profissional" required /></label>
                        <label className="field"><span>Avisos e riscos</span><textarea rows="2" value={medicationForm.riskWarnings} onChange={(event) => setMedicationForm((current) => ({ ...current, riskWarnings: event.target.value }))} placeholder="Cuidados e sinais de alerta" /></label>
                        <button className="button button-secondary" type="submit" disabled={submitting}>Adicionar ao plano</button>
                      </form>
                    </section>
                  </>}
                </section>
              </div>
            ) : <p className="dashboard-note">O acompanhamento de pacientes será liberado após a aprovação do seu registro profissional.</p>}
          </>
        )}
      </div>
    </main>
  )
}

function GlucoseChart({ readings }) {
  if (!readings.length) return <div className="chart-empty">Registre medições para visualizar a curva glicêmica.</div>
  const values = readings.map((reading) => Number(reading.glucose_mg_dl))
  const min = Math.min(...values)
  const max = Math.max(...values)
  const spread = Math.max(max - min, 30)
  const low = Math.max(0, min - spread * 0.25)
  const high = max + spread * 0.25
  const points = readings.map((reading, index) => ({
    x: readings.length === 1 ? 50 : 8 + index * 84 / (readings.length - 1),
    y: 82 - ((Number(reading.glucose_mg_dl) - low) / (high - low)) * 64,
    reading,
  }))
  const path = points.map((point, index) => `${index ? 'L' : 'M'} ${point.x} ${point.y}`).join(' ')
  return <div className="glucose-chart" role="img" aria-label={`Curva glicêmica com ${readings.length} medições`}><div className="chart-scale"><span>{Math.round(high)} mg/dL</span><span>{Math.round((high + low) / 2)} mg/dL</span><span>{Math.round(low)} mg/dL</span></div><svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><path className="chart-gridline" d="M 0 18 H 100 M 0 50 H 100 M 0 82 H 100" /><path className="chart-line" d={path} />{points.map((point) => <circle className="chart-point" key={point.reading.id} cx={point.x} cy={point.y} r="1.8"><title>{point.reading.glucose_mg_dl} mg/dL, {formatDateTime(point.reading.measured_at)}</title></circle>)}</svg><div className="chart-dates"><span>{formatDate(readings[0].measured_at.slice(0, 10))}</span><span>{formatDate(readings[readings.length - 1].measured_at.slice(0, 10))}</span></div></div>
}

function MealTiming({ value }) {
  const labels = { before: 'Antes de comer', after: 'Após comer', unrelated: 'Sem relação' }
  return <span className={`meal-tag meal-${value}`}>{labels[value] ?? 'Não informado'}</span>
}

function MedicationItem({ medication }) {
  const types = { regular: 'Regular', rapid: 'Ação rápida', intermediate: 'Ação intermediária', long: 'Ação longa', other: 'Outro / não se aplica' }
  const periods = { morning: '☀ Manhã', afternoon: '◉ Tarde', evening: '☾ Noite', bedtime: '⌂ Ao deitar', custom: '◷ Outro horário' }
  return <article className="medication-item"><div className="medication-topline"><span className="medication-period">{periods[medication.schedule_period] ?? '◷ Horário'}</span><span className="medication-dose">{medication.dose}</span></div><h4>{medication.name}</h4><p className="medication-type">{types[medication.insulin_type] ?? medication.insulin_type}</p><p className="medication-schedule">{medication.schedule_label}</p><div className="medication-instructions"><strong>Como usar</strong><p>{medication.instructions}</p></div>{medication.risk_warnings && <div className="medication-warning"><strong>Avisos e riscos</strong><p>{medication.risk_warnings}</p></div>}</article>
}

function localDate() {
  const date = new Date()
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function localDateTime() {
  return `${localDate()}T${String(new Date().getHours()).padStart(2, '0')}:${String(new Date().getMinutes()).padStart(2, '0')}`
}

function dateKey(value) {
  const date = new Date(value)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function formatDate(value) {
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium' }).format(new Date(`${value}T12:00:00`))
}

function formatDateTime(value) {
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(value))
}