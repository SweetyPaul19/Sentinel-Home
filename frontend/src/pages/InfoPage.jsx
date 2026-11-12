import { ArrowDownRight, ArrowRight, ArrowUpRight, Activity, BellRing, BookOpen, Check, Clock3, HeartHandshake, House, MapPin, Radio, ShieldCheck, Waves, Wind, Zap } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import '../styles/sentinel-ui.css'

const links = [
  ['Home', '/'], ['How it works', '/how-it-works'], ['Features', '/features'],
  ['Disasters', '/disasters'], ['About', '/about'], ['Blog', '/blog'],
]

function Eyebrow({ children }) { return <span className="info-eyebrow"><i />{children}</span> }

function InfoHeader({ pathname }) {
  return <header className="info-topbar">
    <Link className="info-brand" to="/">Sentinel<span>Home</span><small>HOUSEHOLD SAFETY</small></Link>
    <nav className="info-nav" aria-label="Main navigation">
      {links.map(([label, href]) => <Link key={href} className={href === pathname ? 'info-nav-active' : ''} aria-current={href === pathname ? 'page' : undefined} to={href}>{label}</Link>)}
    </nav>
    <div className="info-actions"><Link to="/login">Sign in</Link><Link className="info-cta" to="/register">Protect your home <ArrowUpRight size={15} /></Link></div>
  </header>
}

function PageFooter() {
  return <footer className="info-footer"><span>SentinelHome <i>·</i> personal safety intelligence</span><span>Stay informed. Stay prepared. Look after each other.</span></footer>
}

function HowItWorks() {
  const stages = [
    ['01', 'Watch the horizon', 'SentinelHome checks the USGS earthquake feed on a schedule and matches nearby events to registered household locations.'],
    ['02', 'Understand the impact', 'When an event is close, household context and event measurements inform an urgency assessment.'],
    ['03', 'Help you take action', 'Practical safety guidance is prepared, the household is alerted through the configured channel, and a check-in can be recorded.'],
  ]
  return <>
    <section className="how-hero info-wide-shell"><div className="how-copy"><Eyebrow>HOW SENTINELHOME WORKS</Eyebrow><h1>From a distant signal to a clear next step.</h1><p>Hazard information can be hard to interpret in a stressful moment. SentinelHome turns a monitored event into household-specific context and practical guidance.</p><Link className="info-hero-link" to="/register">Create your household <ArrowRight size={16} /></Link></div><div className="how-visual"><div className="how-orbit how-orbit-outer"/><div className="how-orbit how-orbit-inner"/><div className="how-center"><House size={25}/></div><span className="how-beacon beacon-one"/><span className="how-beacon beacon-two"/><div className="how-status"><span className="how-pulse"/><div><small>MONITORING LOOP</small><b>Signal · assess · guide</b></div></div></div><div className="how-hero-foot"><span>01 / 03</span><span>Every alert begins with a signal worth understanding.</span><ArrowDownRight size={19}/></div></section>
    <section className="how-steps info-wide-shell"><div className="info-section-heading"><Eyebrow>THE RESPONSE JOURNEY</Eyebrow><h2>Three connected steps. One calmer response.</h2></div><div className="how-step-list">{stages.map(([n,title,copy], i)=><article className="how-step" key={n}><span className="how-step-number">{n}</span><div className="how-step-mark">{i===0?<Radio/>:i===1?<Activity/>:<BellRing/>}</div><div className="how-step-copy"><h3>{title}</h3><p>{copy}</p></div><span className="how-step-tag">{['MONITOR','ASSESS','RESPOND'][i]}</span></article>)}</div><p className="info-footnote"><ShieldCheck size={15}/> Monitoring currently covers nearby earthquakes. Follow official local instructions during emergencies.</p></section>
  </>
}

function Features() {
  const features = [
    [MapPin,'Your household, in context','Keep location, household size, care needs, and trusted contacts together for more relevant preparedness.','HOUSEHOLD PROFILE','feature-cyan'],
    [Activity,'A live view of monitoring','See the last completed check, next scheduled run, nearby events, and recent execution history.','MONITORING JOURNAL','feature-blue'],
    [Zap,'Risk that is easier to read','An urgency assessment makes a complex signal easier to understand at a glance.','RISK PICTURE','feature-violet'],
    [HeartHandshake,'Guidance with a human focus','Safety advice and source references give the household practical steps to consider.','RESPONSE SUPPORT','feature-mint'],
  ]
  return <>
    <section className="feature-hero info-wide-shell"><div><Eyebrow>THE SENTINELHOME TOOLKIT</Eyebrow><h1>One safety desk. The details that matter.</h1><p>Monitoring, household context, guidance, and check-ins—brought together in a clear, calm dashboard.</p><Link className="info-hero-link" to="/register">Explore your safety desk <ArrowRight size={16}/></Link></div><div className="feature-preview"><div className="preview-top"><span className="preview-lights"><i/><i/><i/></span><span>SENTINEL / OVERVIEW</span><Activity size={15}/></div><div className="preview-title"><div><small>HOUSEHOLD STATUS</small><b>Protected & monitoring</b></div><span className="preview-check"><Check size={17}/></span></div><div className="preview-bars"><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/></div><div className="preview-footer"><span><b>30 min</b><small>check cadence</small></span><span><b>Live</b><small>event feed</small></span><span><b>Ready</b><small>response plan</small></span></div></div></section>
    <section className="feature-grid-section info-wide-shell"><div className="info-section-heading"><Eyebrow>MADE TO WORK TOGETHER</Eyebrow><h2>Useful at a glance. Detailed when you need it.</h2></div><div className="feature-grid">{features.map(([Icon,title,copy,tag,tone],i)=><article className={`feature-card ${tone}`} key={title}><div className="feature-card-head"><span className="feature-icon"><Icon size={21}/></span><span>0{i+1}</span></div><h3>{title}</h3><p>{copy}</p><small>{tag}</small></article>)}</div></section>
  </>
}

function Disasters() {
  const hazards = [
    {icon:Activity, tag:'LIVE MONITORING', title:'Earthquakes', copy:'SentinelHome currently checks the USGS earthquake feed and looks for events near registered homes.', note:'Drop · Cover · Hold On', tone:'hazard-quake'},
    {icon:Waves, tag:'PREPAREDNESS GUIDE', title:'Floods', copy:'Know your evacuation route and move to higher ground when local authorities advise. Never walk or drive through floodwater.', note:'Move to higher ground', tone:'hazard-flood'},
    {icon:Wind, tag:'PREPAREDNESS GUIDE', title:'Cyclones & storms', copy:'Track official forecasts, secure loose outdoor items, and keep essential medicines and documents ready.', note:'Shelter · Secure · Listen', tone:'hazard-storm'},
  ]
  return <>
    <section className="hazard-hero info-wide-shell"><div className="hazard-hero-copy"><Eyebrow>HAZARD READINESS</Eyebrow><h1>Preparedness starts before the forecast changes.</h1><p>Know the hazards around you, make a household plan, and use trusted local instructions when conditions become dangerous.</p></div><aside className="hazard-live-card"><span className="hazard-live-icon"><Radio size={19}/></span><small>ACTIVE AUTOMATED COVERAGE</small><b>Nearby earthquakes</b><span className="hazard-live-status"><i/>USGS feed monitoring</span><p>Flood and storm guidance is available here; automated alerts for those hazards are not currently enabled.</p></aside></section>
    <section className="hazard-library info-wide-shell"><div className="info-section-heading"><Eyebrow>KNOW YOUR RESPONSE</Eyebrow><h2>Three hazards. Different actions.</h2></div><div className="hazard-cards">{hazards.map(({icon:Icon,tag,title,copy,note,tone},i)=><article className={`hazard-card ${tone}`} key={title}><div className="hazard-card-art"><span className="hazard-icon"><Icon size={25}/></span><span className="hazard-index">0{i+1}</span><div className="hazard-art-lines"/></div><div className="hazard-card-copy"><small>{tag}</small><h3>{title}</h3><p>{copy}</p><b><ArrowRight size={14}/>{note}</b></div></article>)}</div><div className="hazard-source-note"><ShieldCheck size={18}/><p>Use these notes as a starting point. In an emergency, follow your local disaster-management authority and emergency services.</p></div></section>
  </>
}

function About() {
  return <>
    <section className="about-hero info-wide-shell"><div className="about-kicker"><Eyebrow>A LITTLE MORE HUMAN, BY DESIGN</Eyebrow><span className="about-spark">✳</span></div><h1>Safety information should help people feel <em>ready</em>, not overwhelmed.</h1><div className="about-hero-bottom"><p>SentinelHome brings hazard signals, household details, and practical preparedness guidance into one considered place.</p><span className="about-wordmark">S<span>/</span>H</span></div></section>
    <section className="about-values info-wide-shell"><div className="about-values-intro"><Eyebrow>OUR PRINCIPLES</Eyebrow><h2>Technology in service of care.</h2><p>Our approach starts with a simple idea: timely information is most useful when people can understand it and know what to do next.</p></div><div className="about-value-list"><article><span>01</span><div><h3>People before dashboards</h3><p>Households are more than coordinates. Care needs and trusted contacts deserve a place in preparedness.</p></div><HeartHandshake/></article><article><span>02</span><div><h3>Clarity under pressure</h3><p>Calm hierarchy and practical language help the next important detail stand out.</p></div><div className="about-value-icon">◌</div></article><article><span>03</span><div><h3>Guidance with humility</h3><p>Our tools support preparedness and local authorities; they do not replace professional emergency instructions.</p></div><ShieldCheck/></article></div><div className="about-note"><span>OUR COMMITMENT</span><p>Build thoughtfully. Communicate clearly. Keep the household at the center.</p></div></section>
  </>
}

function Blog() {
  const articles = [
    {label:'HOUSEHOLD PLANNING', time:'4 MIN READ', title:'Make a family check-in plan before you need one', intro:'A simple contact plan can help everyone reconnect when normal communication is disrupted.', body:'Choose one person outside your area as a check-in contact. Agree on a meeting place near home and a second place farther away. Write down important phone numbers in case devices run out of power, and make sure children and caregivers know the plan.'},
    {label:'READINESS KIT', time:'3 MIN READ', title:'A small kit that earns its place at home', intro:'Start with the essentials your household would reach for in the first hours.', body:'Keep drinking water, a flashlight, spare batteries, a power bank, basic first aid, needed medicines, and copies of important documents together. Review the kit every few months and adapt it for the people and pets in your household.'},
    {label:'EARTHQUAKE SAFETY', time:'3 MIN READ', title:'Practice the response, not just the plan', intro:'A short practice makes the right response easier to remember under stress.', body:'Identify sturdy cover in the rooms where your household spends time. Practice Drop, Cover, and Hold On, then talk through what to do after shaking stops and how you will check in with one another.'},
  ]
  return <>
    <section className="blog-hero info-wide-shell"><div><Eyebrow>THE PREPAREDNESS JOURNAL</Eyebrow><h1>Small things you can do today for a steadier tomorrow.</h1><p>Clear, short reads for building household readiness—one practical step at a time.</p></div><div className="blog-hero-stamp"><BookOpen size={27}/><span>FIELD<br/>NOTES</span><i>VOL. 01</i></div></section>
    <section className="blog-content info-wide-shell"><article className="blog-feature"><div className="blog-feature-art"><div className="blog-sun"/><div className="blog-horizon"/><div className="blog-house">⌂</div><span>BE READY, TOGETHER</span></div><div className="blog-feature-copy"><small>FEATURED NOTE <i/> HOUSEHOLD PLANNING</small><h2>{articles[0].title}</h2><p>{articles[0].intro}</p><details><summary>Read the note <ArrowRight size={15}/></summary><p>{articles[0].body}</p></details></div></article><div className="blog-list-heading"><Eyebrow>MORE FIELD NOTES</Eyebrow><span>Practical reads · No jargon</span></div><div className="blog-cards">{articles.slice(1).map((article,i)=><article className={`blog-card blog-card-${i+1}`} key={article.title}><div className="blog-card-meta"><span>{article.label}</span><span><Clock3 size={13}/>{article.time}</span></div><h3>{article.title}</h3><p>{article.intro}</p><details><summary>Read article <ArrowRight size={14}/></summary><p>{article.body}</p></details></article>)}</div></section>
  </>
}

const pageContent = {
  '/how-it-works': [HowItWorks, 'how'],
  '/features': [Features, 'features'],
  '/disasters': [Disasters, 'disasters'],
  '/about': [About, 'about'],
  '/blog': [Blog, 'blog'],
}

export default function InfoPage() {
  const { pathname } = useLocation()
  const [Page, theme] = pageContent[pathname] || pageContent['/how-it-works']
  return <main className={`info-page info-${theme}`}><InfoHeader pathname={pathname}/><Page/><PageFooter/></main>
}
