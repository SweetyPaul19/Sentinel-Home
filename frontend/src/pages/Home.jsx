// import { Link } from 'react-router-dom'
// import '../App.css'
// import { ArrowRight, Globe2, ShieldCheck } from 'lucide-react'

// const backgroundImage = '/assets/background-image.jpg'
// const earthImage = '/assets/earth-image.png'
// const mobileCard = '/assets/mobile-card.png'
// const radarCard = '/assets/radar-card.png'
// const technologyCards = '/assets/technology-card.png'
// const workflowCard = '/assets/workflow-image.png'

// export default function Home() {
//   return (
//     <main className="desktop">
//       <div className="desktop-canvas">
//         <img className="background-image" alt="Background image" src={backgroundImage} />
//         <img className="workflow-card" alt="Workflow card" src={workflowCard} />
//         <img className="radar-card" alt="Radar card" src={radarCard} />
//         <img className="mobile-card" alt="Mobile emergency alert interface" src={mobileCard} />
//         <img className="technology-cards" alt="Technology cards" src={technologyCards} />
//         <img className="earth-image" alt="Earth image" src={earthImage} />

//         <div className="text">{''}</div>

//         <header className="site-nav">
//           <Link className="brand" to="/" aria-label="SentinelHome home">
//             <span className="brand-mark" aria-hidden="true">
//               <ShieldCheck size={28} strokeWidth={1.8} />
//             </span>
//             <span className="brand-copy">
//               <strong>SentinelHome</strong>
//               <small>AI-powered disaster alerts</small>
//             </span>
//           </Link>

//           <nav className="primary-nav" aria-label="Primary navigation">
//             <a className="active" href="#home">Home</a>
//             <a href="#how-it-works">How it works</a>
//             <a href="#features">Features</a>
//             <a href="#disasters">Disasters</a>
//             <a href="#about">About</a>
//             <a href="#blog">Blog</a>
//           </nav>

//           <div className="nav-actions">
//             <button className="language-picker" type="button" aria-label="Select language">
//               <Globe2 size={17} strokeWidth={1.8} />
//               <span>EN</span>
//               <span className="chevron" aria-hidden="true">⌄</span>
//             </button>
//             <Link className="nav-cta" to="/signup">
//               Get started
//               <ArrowRight size={17} strokeWidth={2} />
//             </Link>
//           </div>
//         </header>

//         <section className="hero-copy" aria-labelledby="hero-title">
//           <div className="status-pill">
//             <span className="status-dot" aria-hidden="true" />
//             Real-time&nbsp;&nbsp;•&nbsp;&nbsp;AI-powered&nbsp;&nbsp;•&nbsp;&nbsp;Global coverage
//           </div>

//           <h1 id="hero-title">
//             Detect. Predict. Alert.
//             <br />
//             When nature strikes,
//             <br />
//             <span>you'll know.</span>
//           </h1>

//           <p>
//             SentinelHome combines real-time monitoring, advanced AI, and
//             trusted guidance to help you act before a disaster becomes a crisis.
//           </p>

//           <div className="hero-actions">
//             <Link className="hero-cta" to="/signup">
//               Get started free
//               <ArrowRight size={19} strokeWidth={2} />
//             </Link>
//             <a className="hero-secondary" href="#how-it-works">
//               Explore the system
//               <ArrowRight size={18} strokeWidth={1.8} />
//             </a>
//           </div>
//         </section>
//       </div>
//     </main>
//   )
// }


import { Link } from 'react-router-dom'
import '../App.css'
import { ArrowRight, Globe2, ShieldCheck } from 'lucide-react'
import '../styles/sentinel-ui.css'

const backgroundImage = '/assets/background-image.jpg'
const earthImage = '/assets/earth-image.png'
const mobileCard = '/assets/mobile-card.png'
const radarCard = '/assets/radar-card.png'
const technologyCards = '/assets/technology-card.png'
const workflowCard = '/assets/workflow-image.png'

export default function Home() {
  return (
    <main className="desktop">
      <div className="desktop-canvas">
        <img className="background-image" alt="Background image" src={backgroundImage} />
        <img className="workflow-card" alt="Workflow card" src={workflowCard} />
        <img className="radar-card" alt="Radar card" src={radarCard} />
        <img className="mobile-card" alt="Mobile emergency alert interface" src={mobileCard} />
        <img className="technology-cards" alt="Technology cards" src={technologyCards} />
        <img className="earth-image" alt="Earth image" src={earthImage} />

        <div className="text">{''}</div>

        <header className="site-nav">
          <Link className="brand" to="/" aria-label="SentinelHome home">
            <span className="brand-mark" aria-hidden="true">
              <ShieldCheck size={28} strokeWidth={1.8} />
            </span>
            <span className="brand-copy">
              <strong>SentinelHome</strong>
              <small>AI-powered disaster alerts</small>
            </span>
          </Link>

          <nav className="primary-nav" aria-label="Primary navigation">
            <a className="active" href="#home">Home</a>
            <a href="#how-it-works">How it works</a>
            <a href="#features">Features</a>
            <a href="#disasters">Disasters</a>
            <a href="#about">About</a>
            <a href="#blog">Blog</a>
          </nav>

          <div className="nav-actions">
            <button className="language-picker" type="button" aria-label="Select language">
              <Globe2 size={17} strokeWidth={1.8} />
              <span>EN</span>
              <span className="chevron" aria-hidden="true">⌄</span>
            </button>
            <Link className="nav-cta" to="/register">
              Get started
              <ArrowRight size={17} strokeWidth={2} />
            </Link>
          </div>
        </header>

        <section className="hero-copy" aria-labelledby="hero-title">
          <div className="status-pill">
            <span className="status-dot" aria-hidden="true" />
            Real-time&nbsp;&nbsp;•&nbsp;&nbsp;AI-powered&nbsp;&nbsp;•&nbsp;&nbsp;Global coverage
          </div>

          <h1 id="hero-title">
            Detect. Predict. Alert.
            <br />
            When nature strikes,
            <br />
            <span>you'll know.</span>
          </h1>

          <p>
            SentinelHome combines real-time monitoring, advanced AI, and
            trusted guidance to help you act before a disaster becomes a crisis.
          </p>

          <div className="hero-actions">
            <Link className="hero-cta" to="/register">
              Get started free
              <ArrowRight size={19} strokeWidth={2} />
            </Link>
            <a className="hero-secondary" href="#how-it-works">
              Explore the system
              <ArrowRight size={18} strokeWidth={1.8} />
            </a>
          </div>
        </section>
      </div>
    </main>
  )
}