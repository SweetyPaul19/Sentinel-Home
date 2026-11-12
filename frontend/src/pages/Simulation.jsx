import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, ChevronRight, CircleAlert, Database, Gauge, GitBranch, Loader2, Radio, Search, ShieldCheck, Sparkles } from 'lucide-react'
import { confirmSimulationSafe, getEarthquakeSimulation, startEarthquakeSimulation } from '../api/client'
import '../styles/sentinel-ui.css'

const stages = [
  ['hazard_api', 'Earthquake fixture', 'Controlled input'], ['parameter_generation', 'Gemini parameters', 'Live provider'],
  ['ml_inference', 'XGBoost prediction', 'Live model'], ['urgency_scoring', 'Urgency formula', 'Live calculation'],
  ['rag_retrieval', 'RAG retrieval', 'Voyage + Pinecone'], ['guidance_generation', 'Gemini guidance', 'Live provider'],
  ['alert_persistence', 'Alert persistence', 'MongoDB / store'], ['notification', 'Telegram delivery', 'Live provider'],
  ['confirmation', 'Safety confirmation', 'Decision branch'], ['escalation', 'Voice escalation', 'Only after timeout'],
]
const stageNames = Object.fromEntries(stages.map(([id, title]) => [id, title]))
const ACTIVE_JOB_KEY = 'sentinelhome-active-simulation-job'

const pause = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms))

function JsonPanel({ title, value }) {
  if (value === undefined || value === null) return null
  return <details className="engine-json"><summary>{title}</summary><pre>{JSON.stringify(value, null, 2)}</pre></details>
}

function StageCard({ stageId, title, source, events, index, running }) {
  const stageEvents = events.filter((event) => event.stage === stageId)
  const event = stageEvents[stageEvents.length - 1]
  const status = event?.status || (running ? 'queued' : 'idle')
  return <article className={`engine-stage engine-${status}`} style={{ '--stage-delay': `${index * 60}ms` }}>
    <div className="engine-stage-top"><div className="engine-stage-icon">{status === 'completed' ? <Check size={17} /> : status === 'failed' ? <CircleAlert size={17} /> : status === 'started' || status === 'running' ? <Loader2 size={17} className="engine-spin" /> : <span>{String(index + 1).padStart(2, '0')}</span>}</div><div><span className="engine-stage-number">STEP {String(index + 1).padStart(2, '0')}</span><h3>{title}</h3></div><span className={`engine-badge badge-${status}`}>{status}</span></div>
    <div className="engine-stage-meta"><span>{source}</span>{event?.timestamp && <time>{new Date(event.timestamp).toLocaleTimeString()}</time>}</div>
    {event ? <div className="engine-stage-detail"><strong>{event.title}</strong>{event.detail && <p>{event.detail}</p>}<div className="engine-provenance"><span>{event.execution_mode === 'fixture' ? 'FIXTURE INPUT' : event.source === 'fallback' ? 'FALLBACK' : 'LIVE OUTPUT'}</span>{event.provider && <span>{event.provider}</span>}{event.upstream && <span>← {stageNames[event.upstream] || event.upstream}</span>}</div><div className="engine-inspect"><JsonPanel title="Input / prompt consumed" value={event.request} /><JsonPanel title="Output produced" value={event.response} />{event.error && <pre className="engine-error">{event.error}</pre>}</div></div> : <p className="engine-wait">Waiting for the previous stage to produce an actual output…</p>}
  </article>
}

function UrgencyBreakdown({ events }) {
  const event = events.find((item) => item.stage === 'urgency_scoring' && item.response?.breakdown)
  const breakdown = event?.response?.breakdown
  if (!breakdown) return null
  const rows = [['physical_risk', 'Physical damage', '#61c7ff'], ['hazard', 'Earthquake hazard', '#b99aff'], ['vulnerability', 'Household vulnerability', '#ffd080']]
  return <section className="engine-explain glass-card"><div className="engine-section-title"><Gauge size={18} /><div><span>CALCULATION TRACE</span><h2>How urgency was calculated</h2></div></div><p className="engine-formula">{breakdown.formula}</p><div className="engine-bars">{rows.map(([key, label, color]) => { const row = breakdown[key] || {}; return <div className="engine-bar-row" key={key}><div><span>{label}</span><b>{Number(row.value || 0).toFixed(4)} × {row.weight}</b></div><div className="engine-bar"><i style={{ width: `${Math.min(100, Number(row.contribution || 0) * 100)}%`, background: color }} /></div><strong>{Number(row.contribution || 0).toFixed(4)}</strong></div> })}</div></section>
}

function RAGPanel({ events }) {
  const event = events.find((item) => item.stage === 'rag_retrieval')
  if (!event) return null
  const docs = event.response?.excerpts || []
  return <section className="engine-explain glass-card"><div className="engine-section-title"><Search size={18} /><div><span>RETRIEVAL TRACE</span><h2>RAG found these sources</h2></div></div><p className="engine-query"><b>Generated query:</b> {event.request?.query || '—'}</p><div className="rag-doc-grid">{docs.map((doc, index) => <article key={`${doc.source}-${doc.page}-${index}`}><span>DOCUMENT {index + 1}</span><b>{doc.source} · page {doc.page}</b><p>{doc.excerpt}</p></article>)}</div></section>
}

function HouseholdResult({ item, onConfirm }) {
  const assessment = item.assessment || {}, advice = item.advice || {}, alert = item.alert || {}
  const canConfirm = alert.id && item.confirmation_status !== 'confirmed' && ['active', 'escalation_pending', 'pending'].includes(alert.status)
  return <article className="glass-card engine-household"><div className="engine-household-head"><div><span className="eyebrow">HOUSEHOLD RESULT</span><h3>{item.household_id}</h3></div><span className={`risk-pill risk-${assessment.urgency_level || 'unknown'}`}>{assessment.urgency_level || 'unknown'} · {assessment.urgency_score ?? '—'}</span></div><div className="engine-result-grid"><div><span>Damage grade</span><b>{assessment.damage_grade ?? '—'}</b></div><div><span>Physical risk</span><b>{assessment.physical_damage_risk ?? '—'}</b></div><div><span>Vulnerability</span><b>{assessment.vulnerability_score ?? '—'}</b></div><div><span>Alert</span><b>{alert.status || 'not required'}</b></div></div>{advice.message && <div className="engine-advice"><div className="engine-section-title"><Sparkles size={17} /><h4>Generated safety guidance</h4></div>{advice.degraded && <p className="warning-text">Provider degraded; conservative fallback shown.</p>}<p>{advice.message}</p><small>{(advice.sources || []).map((source) => `${source.source}, p.${source.page}`).join(' · ')}</small></div>}{alert.id && <div className="engine-confirm"><div><b>{item.confirmation_status === 'confirmed' ? 'Safety confirmed' : 'Confirmation window open'}</b><p>{item.confirmation_status === 'confirmed' ? 'The escalation branch has been stopped.' : 'If not confirmed before timeout, configured relatives may be called.'}</p></div>{canConfirm && <button className="safe-button" onClick={() => onConfirm(item.household_id)}>✓ I’m safe</button>}{item.confirmation_status === 'confirmed' && <ShieldCheck className="confirmed-icon" />}</div>}<Link className="dashboard-link" to={`/dashboard/${item.household_id}`}>Open household dashboard →</Link></article>
}

export default function Simulation() {
  const [password, setPassword] = useState(''), [job, setJob] = useState(null), [error, setError] = useState(''), [running, setRunning] = useState(false)
  const events = useMemo(() => job?.events || [], [job]), result = job?.result || job, completed = job?.status === 'completed', latest = events[events.length - 1]
  const logLines = useMemo(() => events.map((event) => `[${event.timestamp ? new Date(event.timestamp).toLocaleTimeString() : '--:--:--'}] ${event.stage} · ${event.status} · ${event.title}`), [events])
  useEffect(() => {
    const savedJobId = window.sessionStorage.getItem(ACTIVE_JOB_KEY)
    if (!savedJobId) return
    let cancelled = false
    getEarthquakeSimulation(savedJobId)
      .then((savedJob) => {
        if (cancelled) return
        setJob(savedJob)
        if (savedJob.status === 'queued' || savedJob.status === 'running') {
          setError('A simulation is still running. Resume status to reconnect to its live progress.')
        } else {
          window.sessionStorage.removeItem(ACTIVE_JOB_KEY)
        }
      })
      .catch(() => { window.sessionStorage.removeItem(ACTIVE_JOB_KEY) })
    return () => { cancelled = true }
  }, [])

  async function trackSimulation(jobId, initialJob = null) {
    let current = initialJob
    let retryCount = 0
    let eventCursor = current?.events?.length || 0
    while (!current || current.status === 'queued' || current.status === 'running') {
      await pause(retryCount ? Math.min(1000 * (2 ** (retryCount - 1)), 8000) : 900)
      try {
        const update = await getEarthquakeSimulation(jobId, eventCursor)
        eventCursor += update.events?.length || 0
        current = {
          ...current,
          ...update,
          events: [...(current?.events || []), ...(update.events || [])],
          result: update.result || current?.result,
        }
        retryCount = 0
        setJob(current)
        setError('')
      } catch (err) {
        if (err.status && err.status < 500 && err.status !== 429) throw err
        retryCount += 1
        if (retryCount >= 10) {
          throw new Error(`Simulation status connection lost. The run is still recoverable; press “Resume status” to reconnect. (${err.message})`)
        }
        setError(`Status connection interrupted; retrying (${retryCount}/10)…`)
      }
    }
    if (current.status === 'failed') throw new Error(current.error || 'Simulation failed')
    window.sessionStorage.removeItem(ACTIVE_JOB_KEY)
    return current
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setRunning(true); setError(''); setJob(null)
    try {
      const started = await startEarthquakeSimulation(password)
      window.sessionStorage.setItem(ACTIVE_JOB_KEY, started.job_id)
      setJob(started)
      const finished = await trackSimulation(started.job_id, started)
      setJob(finished); setPassword('')
    } catch (err) { setError(err.message) } finally { setRunning(false) }
  }

  async function handleResume() {
    if (!job?.job_id) return
    setRunning(true); setError('')
    try { setJob(await trackSimulation(job.job_id, job)) }
    catch (err) { setError(err.message) }
    finally { setRunning(false) }
  }

  async function handleConfirm(householdId) { try { if (!job?.job_id) throw new Error('Simulation session is missing. Run the simulation again.'); await confirmSimulationSafe(job.job_id, householdId); const updated = await getEarthquakeSimulation(job.job_id); setJob(updated) } catch (err) { setError(err.message) } }
  return <main className="simulation-shell"><section className="simulation-hero"><div><span className="eyebrow">SENTINELHOME · INTERNAL ENGINE CONSOLE</span><h1>See the response engine think.</h1><p>Every card below is populated by a real backend event. The controlled earthquake is the only fixture; downstream outputs are passed into the next live component.</p></div><div className={`engine-state ${running ? 'state-running' : completed ? 'state-complete' : ''}`}><span className="live-dot" />{running ? 'LIVE EXECUTION' : completed ? 'RUN COMPLETE' : 'ENGINE STANDBY'}</div></section>
    <section className="glass-card simulation-control"><div><span className="eyebrow">CONTROLLED EARTHQUAKE FIXTURE</span><h2>Launch a deterministic test</h2><p>The event is fixed so the pipeline can be tested without waiting for a disaster. Gemini, ML, RAG, persistence and Telegram still run normally.</p></div><form onSubmit={handleSubmit}><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Simulation password" required /><button disabled={running}>{running ? 'Engine running…' : 'Run live workflow →'}</button></form></section>
    {error && <div className="simulation-error">{error}{!running && job?.job_id && !completed && (job.status === 'queued' || job.status === 'running') && <button className="simulation-resume" onClick={handleResume}>Resume status</button>}</div>}
    {(running || events.length > 0) && <><section className="engine-overview"><div className="engine-counter"><Radio size={18} /><b>{events.length}</b><span>backend events received</span></div><div className="engine-counter"><GitBranch size={18} /><b>{latest?.stage ? stageNames[latest.stage] || latest.stage : 'Waiting'}</b><span>latest active stage</span></div><div className="engine-counter"><Database size={18} /><b>Fixture → live</b><span>execution provenance</span></div></section><section className="engine-layout"><div className="engine-flow glass-card"><div className="engine-section-title"><GitBranch size={18} /><div><span>LIVE PIPELINE</span><h2>Actual execution stages</h2></div></div><div className="engine-stage-list">{stages.map(([id, title, source], index) => <div key={id}><StageCard stageId={id} title={title} source={source} events={events} index={index} running={running} />{index < stages.length - 1 && <ChevronRight className="engine-arrow" />}</div>)}</div></div><aside className="engine-log glass-card"><div className="engine-section-title"><span className="terminal-icon">›_</span><div><span>BACKEND STREAM</span><h2>Event log</h2></div></div><div className="engine-log-lines">{logLines.length ? logLines.map((line, index) => <div key={`${line}-${index}`}>{line}</div>) : <span>Waiting for backend telemetry…</span>}</div></aside></section><UrgencyBreakdown events={events} /><RAGPanel events={events} /></>}
    {completed && result && <><section className="simulation-summary"><div className="simulation-metric"><span>Event</span><strong>{result.simulation_event_id}</strong></div><div className="simulation-metric"><span>Households checked</span><strong>{result.households_checked}</strong></div><div className="simulation-metric"><span>Nearby households</span><strong>{result.households_with_nearby_earthquakes}</strong></div></section><section className="household-list">{result.households?.map((item) => <HouseholdResult key={item.household_id} item={item} onConfirm={handleConfirm} />)}</section></>}
  </main>
}
