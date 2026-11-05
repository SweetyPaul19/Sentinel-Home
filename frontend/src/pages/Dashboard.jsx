import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { confirmSafe, getHousehold, getHouseholdStatus, getLatestMonitoring, getMyHousehold, logoutAccount } from '../api/client'

function formatDate(value, empty = 'Not recorded') {
  if (!value) return empty
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? empty : date.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
}

function timeAgo(value) {
  if (!value) return 'No check recorded yet'
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000))
  if (seconds < 60) return `${seconds}s ago`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  return `${Math.floor(seconds / 86400)}d ago`
}

function countdown(nextRunAt, now) {
  if (!nextRunAt) return 'Not scheduled'
  const remaining = Math.max(0, Math.floor((new Date(nextRunAt).getTime() - now) / 1000))
  const minutes = Math.floor(remaining / 60)
  const seconds = remaining % 60
  return minutes > 0 ? `${minutes}m ${String(seconds).padStart(2, '0')}s` : `${seconds}s`
}

function MetricCard({ eyebrow, value, detail, tone = 'blue' }) {
  return <article className={`bright-metric metric-${tone}`}><span className="bright-eyebrow">{eyebrow}</span><strong>{value}</strong><small>{detail}</small></article>
}

function StatusDot({ status }) { return <span className={`check-dot check-${status}`} aria-hidden="true" /> }

function CheckRow({ check }) {
  const hasEvent = check.nearby_earthquake_count > 0
  return <details className="check-row"><summary><StatusDot status={check.status} /><span className="check-row-main"><strong>{hasEvent ? 'Nearby hazard evaluated' : 'All clear scan'}</strong><small>{formatDate(check.checked_at)} · {timeAgo(check.checked_at)}</small></span><span className={`check-result result-${check.status}`}>{check.status}</span><span className="check-arrow">⌄</span></summary><div className="check-details"><span><b>{check.nearby_earthquake_count || 0}</b> nearby event{check.nearby_earthquake_count === 1 ? '' : 's'}</span><span><b>{check.risk_level || 'unknown'}</b> risk</span>{check.risk_score != null && <span><b>{Number(check.risk_score).toFixed(3)}</b> urgency</span>}{check.latest_earthquake?.place && <span className="check-place">{check.latest_earthquake.place}</span>}{check.workflow_errors?.length > 0 && <p className="bright-warning">{check.workflow_errors.join(' · ')}</p>}</div></details>
}

function JsonPanel({ label, value }) {
  if (value === undefined || value === null) return null
  return <details className="trace-json"><summary>{label}</summary><pre>{JSON.stringify(value, null, 2)}</pre></details>
}

function TraceEvent({ event }) {
  const status = event.status || 'unknown'
  return <article className={`trace-event trace-${status}`}>
    <div className="trace-event-head"><span className={`trace-state trace-state-${status}`}>{status}</span><div><strong>{event.title || event.stage}</strong><small>{event.stage} · {formatDate(event.completed_at || event.timestamp)}{event.duration_ms != null ? ` · ${event.duration_ms}ms` : ''}</small></div><span className="trace-source">{event.provider || event.source || 'backend'}</span></div>
    {event.detail && <p className="trace-detail">{event.detail}</p>}
    {event.error && <p className="bright-warning">{event.error}</p>}
    <div className="trace-meta"><span>Input: <b>{event.execution_mode || 'live'}</b></span>{event.upstream && <span>After: <b>{event.upstream}</b></span>}<span>Retries: <b>{event.retry_count ?? 0}</b></span></div>
    <div className="trace-json-grid"><JsonPanel label="Request" value={event.request} /><JsonPanel label="Response" value={event.response} /></div>
  </article>
}

function ExecutionTrace({ run }) {
  const trace = run?.trace || []
  return <article className="bright-card execution-card">
    <div className="card-heading"><div><span className="bright-eyebrow">LIVE EXECUTION TRACE</span><h2>What SentinelHome actually did</h2></div><span className={`history-caption trace-run-status status-${run?.status || 'waiting'}`}>{run ? run.status : 'awaiting cycle'}</span></div>
    {!run ? <div className="empty-checks"><p>No live cycle has been recorded yet. The trace will appear after the scheduler performs a check.</p></div> : <><div className="trace-run-summary"><span><b>{run.cycle_id}</b> cycle</span><span>{run.duration_ms != null ? `${run.duration_ms}ms` : 'running'}</span><span>{run.nearby_earthquake_count == null ? 'hazard scan running' : run.nearby_earthquake_count === 0 ? '0 nearby events · all clear' : `${run.nearby_earthquake_count} nearby events`}</span></div><div className="trace-timeline">{trace.map((event, index) => <TraceEvent key={event.event_id || `${event.stage}-${index}`} event={event} />)}</div></>}
  </article>
}

function AlertCard({ alert, onConfirm, confirming }) {
  const confirmed = alert.status === 'confirmed'
  return <article className={`bright-alert ${confirmed ? 'alert-is-confirmed' : ''}`}><div className="bright-alert-title"><div><span className="bright-eyebrow">{alert.hazard || 'HAZARD'} · {alert.risk_level || 'ACTIVE'}</span><h2>{confirmed ? 'Household marked safe' : 'Action needed now'}</h2></div><span className="alert-status-chip">{alert.status}</span></div><p>{alert.message}</p><div className="alert-meta"><span>Delivery <b>{alert.delivery_status || 'pending'}</b></span><span>Channel <b>{alert.delivery_channel || 'not sent'}</b></span><span>{formatDate(alert.created_at)}</span></div>{alert.delivery_error && <p className="bright-warning">Provider response: {alert.delivery_error}</p>}{alert.sources?.length > 0 && <details className="source-details"><summary>View guidance sources</summary><ul>{alert.sources.map((source, index) => <li key={index}>{source.source || source.title || 'Guidance source'}{source.page ? ` · page ${source.page}` : ''}</li>)}</ul></details>}{!confirmed && <button className="safe-action" onClick={onConfirm} disabled={confirming}>{confirming ? 'Updating safety status…' : '✓ I’m safe — stop escalation'}</button>}</article>
}

export default function Dashboard() {
  const { householdId: routeHouseholdId } = useParams()
  const [household, setHousehold] = useState(null)
  const [status, setStatus] = useState(null)
  const [latestRun, setLatestRun] = useState(null)
  const [error, setError] = useState(null)
  const [refreshing, setRefreshing] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [now, setNow] = useState(0)
  const householdId = routeHouseholdId || household?.id

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setRefreshing(true)
    try {
      const details = routeHouseholdId ? await getHousehold(routeHouseholdId) : await getMyHousehold()
      setHousehold(details.household)
      const [nextStatus, latest] = await Promise.all([getHouseholdStatus(details.household.id), getLatestMonitoring(details.household.id)])
      setStatus(nextStatus)
      setLatestRun(latest.run)
      setError(null)
    } catch (err) { setError(err.message) } finally { setRefreshing(false) }
  }, [routeHouseholdId])

  useEffect(() => {
    const initial = window.setTimeout(() => { setNow(Date.now()); load() }, 0)
    const poll = window.setInterval(() => load(true), status?.current_cycle_state === 'running' ? 2500 : 8000)
    const clock = window.setInterval(() => setNow(Date.now()), 1000)
    return () => { window.clearTimeout(initial); window.clearInterval(poll); window.clearInterval(clock) }
  }, [load, status?.current_cycle_state])

  async function handleConfirm() { setConfirming(true); try { await confirmSafe(householdId); await load(true) } catch (err) { setError(err.message) } finally { setConfirming(false) } }
  async function handleLogout() { await logoutAccount(); window.location.href = '/login' }

  if (error) return <main className="bright-dashboard"><div className="bright-error"><span>Connection issue</span><h1>We couldn’t load your safety desk.</h1><p>{error}</p><button className="bright-button" onClick={() => load()}>Try again</button></div></main>
  if (!status || !household) return <main className="bright-dashboard bright-loading"><div className="loading-orbit"><span className="live-dot" /></div><h1>Preparing your safety desk</h1><p>Connecting to household monitoring…</p></main>

  const score = Number(status?.risk_score)
  const hasScore = Number.isFinite(score)
  const riskPercent = hasScore ? Math.round(Math.max(0, Math.min(1, score)) * 100) : 0
  const nextRunAt = status?.scheduler?.next_run_at
  const recentChecks = status?.recent_checks || []
  const activeAlerts = status?.active_alerts || []
  const latestCheck = status?.last_check
  const protectionLabel = activeAlerts.length ? 'Action required' : status?.scheduler?.running ? 'Protected and monitoring' : 'Monitoring paused'
  const locationLabel = household ? `${Number(household.latitude).toFixed(3)}°, ${Number(household.longitude).toFixed(3)}°` : 'Household location'
  const vulnerabilityCount = household?.vulnerable_members?.length || 0
  const lastCheckStatus = latestCheck?.status === 'degraded' ? 'Needs attention' : latestCheck ? 'Healthy check' : 'Awaiting first check'
  const isSafeNow = hasScore && score <= 0 && activeAlerts.length === 0 && status.safe && Boolean(status.hazard_response)
  const nextCheckLabel = status.scheduler.running
    ? (nextRunAt && new Date(nextRunAt).getTime() > now ? countdown(nextRunAt, now) : 'Waiting for schedule')
    : 'Scheduler paused'
  const nextCheckDetail = nextRunAt
    ? formatDate(nextRunAt)
    : status.scheduler.running
      ? 'Backend is online; next timestamp is not published yet'
      : (status.scheduler.stale_reason || 'Automatic checks are not running')

  if (error) return <main className="bright-dashboard"><div className="bright-error"><span>Connection issue</span><h1>We couldn’t load your safety desk.</h1><p>{error}</p><button className="bright-button" onClick={() => load()}>Try again</button></div></main>
  if (!status || !household) return <main className="bright-dashboard bright-loading"><div className="loading-orbit"><span className="live-dot" /></div><h1>Preparing your safety desk</h1><p>Connecting to household monitoring…</p></main>

  return <main className="bright-dashboard">
    <header className="bright-topbar"><Link className="bright-brand" to="/">Sentinel<span>Home</span></Link><nav className="dashboard-nav" aria-label="Main navigation"><Link to="/">Home</Link><Link to="/how-it-works">How it works</Link><Link to="/features">Features</Link><Link to="/disasters">Disasters</Link><Link to="/about">About</Link><Link to="/blog">Blog</Link></nav><div className="bright-top-actions"><span className="sync-label"><span className="sync-dot" />{refreshing ? 'Syncing live data' : `Updated ${timeAgo(status.last_check?.checked_at)}`}</span><button className="round-action" onClick={() => load()} aria-label="Refresh dashboard">↻</button><button className="bright-signout" onClick={handleLogout}>Sign out</button></div></header>
    <section className="bright-hero"><img src="/assets/dashboard-neighborhood.png" alt="Sunlit neighborhood protected by SentinelHome" /><div className="bright-hero-wash" /><div className="bright-hero-copy"><span className="bright-eyebrow">HOUSEHOLD COMMAND CENTER</span><h1>Your home, watched with care.</h1><p>Real-time hazard checks and thoughtful guidance for the people who matter most.</p><div className={`protection-pill ${activeAlerts.length ? 'pill-alert' : 'pill-safe'}`}><span className="pulse-dot" />{protectionLabel}</div></div><div className="hero-scan" aria-hidden="true"><div className="scan-grid" /><div className="scan-radar"><span className="radar-sweep" /><span className="radar-ring radar-ring-one" /><span className="radar-ring radar-ring-two" /><span className="home-marker">⌂</span><span className="radar-point point-one" /><span className="radar-point point-two" /></div><div className="scan-caption"><span className="scan-live-dot" /><div><small>LOCAL HAZARD RADAR</small><b>{status.hazard_response ? 'Feed connected' : 'Awaiting first scan'}</b></div></div></div><div className="hero-location"><span>⌖</span><div><small>Monitoring location</small><b>{locationLabel}</b></div></div></section>
    <section className="bright-metrics" aria-label="Monitoring overview"><MetricCard eyebrow="Last check" value={latestCheck ? timeAgo(latestCheck.checked_at) : '—'} detail={formatDate(latestCheck?.checked_at)} tone="blue" /><MetricCard eyebrow="Next check" value={nextCheckLabel} detail={nextCheckDetail} tone="mint" /><MetricCard eyebrow="Check cadence" value={status.scheduler.interval_minutes ? `${status.scheduler.interval_minutes} min` : '—'} detail={status.scheduler.running ? 'Automatic monitoring' : 'Automatic checks paused'} tone="violet" /><MetricCard eyebrow="Nearby events" value={latestCheck?.nearby_earthquake_count == null ? '—' : latestCheck.nearby_earthquake_count} detail={status.hazard_response ? (latestCheck?.nearby_earthquake_count === 0 ? 'USGS response received · all clear' : 'From the latest USGS hazard scan') : 'No hazard response yet'} tone="sun" /></section>
    <section className="bright-layout"><div className="bright-main-column">
      {isSafeNow && <div className="risk-safe-banner"><span className="risk-shield" aria-hidden="true">✓</span><div><strong>All clear — your household is safe</strong><small>The latest real check returned a zero urgency score.</small></div></div>}
      {hasScore && score > 0 && <div className="risk-signal-banner"><span className="risk-alert-symbol" aria-hidden="true">!</span><div><strong>{status.risk_level || 'Active'} risk signal detected</strong><small>Urgency score {score.toFixed(3)} · review the guidance and active alert below.</small></div></div>}
      <article className="bright-card risk-card"><div className="card-heading"><div><span className="bright-eyebrow">LIVE RISK PICTURE</span><h2>How your household is doing</h2></div><span className={`state-badge state-${status.risk_level || 'unknown'}`}>{status.risk_level || 'not assessed'}</span></div><div className="risk-content"><div className="risk-ring" style={{ '--risk': `${riskPercent}%` }}><div><strong>{hasScore ? score.toFixed(3) : '—'}</strong><small>{hasScore ? 'urgency score' : 'awaiting assessment'}</small></div></div><div className="risk-explanation"><h3>{lastCheckStatus}</h3><p>{status.safe ? 'No active alert is waiting for your response. SentinelHome will keep checking the surrounding hazard feed.' : 'An alert is active. Review the guidance below and confirm your household is safe when everyone has been accounted for.'}</p><div className="risk-facts"><span><b>{status.last_assessment?.damage_grade ?? '—'}</b> damage grade</span><span><b>{status.last_assessment?.vulnerability_score ?? '—'}</b> vulnerability</span></div></div></div></article>
      {activeAlerts.length > 0 ? <section className="alert-stack"><div className="section-label"><span className="bright-eyebrow">RESPONSE CENTER</span><h2>Guidance for your household</h2></div>{activeAlerts.map(alert => <AlertCard key={alert.id} alert={alert} onConfirm={handleConfirm} confirming={confirming} />)}</section> : <article className="bright-card all-clear"><span className="clear-burst">✓</span><div><span className="bright-eyebrow">ALL CLEAR FOR NOW</span><h2>Your household is ready</h2><p>The monitoring service is active. If a nearby event changes your risk, your alert and safety guidance will appear here.</p></div></article>}
      <article className="bright-card history-card"><div className="card-heading"><div><span className="bright-eyebrow">MONITORING JOURNAL</span><h2>Recent five checks</h2></div><span className="history-caption">Real scheduler runs</span></div>{recentChecks.length ? <div className="check-list">{recentChecks.map(check => <CheckRow key={check.id} check={check} />)}</div> : <div className="empty-checks"><span>◌</span><p>Your first monitoring check will appear here once the scheduler runs.</p></div>}</article>
      <ExecutionTrace run={status.current_cycle || latestRun} />
    </div><aside className="bright-side-column">
      <article className="bright-card scheduler-card"><div className="scheduler-orb"><span className="pulse-dot" /></div><span className="bright-eyebrow">SCHEDULER STATUS</span><h2>{status.scheduler.running ? 'Watching continuously' : 'Waiting for scheduler'}</h2><p>{status.scheduler.running ? 'One live cycle checks every registered household.' : 'Automatic checks are not currently running on the backend.'}</p><div className="scheduler-line"><span>Next server run</span><b>{nextRunAt ? formatDate(nextRunAt) : 'Not scheduled'}</b></div><div className="scheduler-line"><span>Last completed</span><b>{latestCheck ? formatDate(latestCheck.checked_at) : 'Not recorded'}</b></div><div className={`server-state ${status.scheduler.running ? 'server-online' : 'server-offline'}`}><span />{status.scheduler.running ? 'Backend monitoring online' : 'Backend monitoring offline'}</div></article>
      <article className="bright-card household-card"><div className="card-heading"><div><span className="bright-eyebrow">YOUR HOUSEHOLD</span><h2>People & care</h2></div><span className="home-glyph">⌂</span></div><div className="household-number"><strong>{household.household_size}</strong><span>people registered</span></div><div className="care-row"><span className="care-icon">♥</span><div><b>{vulnerabilityCount ? `${vulnerabilityCount} care needs noted` : 'No care needs noted'}</b><small>Used to personalize urgency</small></div></div><div className="care-row"><span className="care-icon">☎</span><div><b>{household.primary_contact?.phone || household.emergency_contact?.phone || 'Contact not configured'}</b><small>Primary response contact</small></div></div></article>
      <article className="bright-card activity-card"><span className="bright-eyebrow">LATEST SYSTEM NOTE</span><h2>{latestCheck?.nearby_earthquake_count ? 'Hazard data evaluated' : 'Area scan complete'}</h2><p>{latestCheck ? `The last cycle completed ${timeAgo(latestCheck.checked_at)} and returned ${latestCheck.nearby_earthquake_count || 0} nearby earthquake events.` : 'No live monitoring cycle has been recorded yet.'}</p><span className={`activity-tag tag-${latestCheck?.status || 'waiting'}`}>{latestCheck?.status || 'waiting'}</span></article>
    </aside></section>
    <footer className="bright-footer"><span>SentinelHome · personal safety intelligence</span><span>Last data sync: {formatDate(status.last_check?.checked_at)}</span><span>Hero image generated for SentinelHome</span></footer>
  </main>
}
