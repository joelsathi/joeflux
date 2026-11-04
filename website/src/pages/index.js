import Link from '@docusaurus/Link';
import useBaseUrl from '@docusaurus/useBaseUrl';
import CodeBlock from '@theme/CodeBlock';
import Layout from '@theme/Layout';
import styles from './index.module.css';

const FEATURES = [
  { title: 'Editable scenes', text: 'Every shot is a JSON file evaluated by frame. Copy, media, layout and timing stay editable until export.', icon: 'M4 5h16v14H4z M4 9h16 M9 9v10' },
  { title: 'AI director, your tools', text: 'Claude Code, Codex or Copilot edit through the same validated, undoable tools as the Studio.', icon: 'M12 3l2.5 5.5L20 11l-5.5 2.5L12 19l-2.5-5.5L4 11l5.5-2.5z' },
  { title: 'Drop-in brand kits', text: 'Add logos, fonts, themes, backgrounds and intro/outro clips as a folder. Every project can use them.', icon: 'M4 7l8-4 8 4-8 4z M4 12l8 4 8-4 M4 17l8 4 8-4' },
  { title: 'After Effects friendly', text: 'Play Bodymovin (Lottie) exports frame-accurately, or bring rendered clips in as shots and bookends.', icon: 'M5 19L12 5l7 14 M8 14h8' },
  { title: 'Same frames, preview and export', text: 'One browser renderer serves the live stage and the H.264 encoder, so what you review is what you ship.', icon: 'M3 12h18 M12 3v18 M5 5l14 14' },
  { title: 'Silent by design', text: 'Projects require audio off, exports omit audio streams and review verifies the result.', icon: 'M5 9v6h4l5 4V5L9 9z M17 9l4 6 M21 9l-4 6' },
];

const STEPS = [
  ['Brief', 'Save the audience, message, proof and format. The director resumes these decisions.'],
  ['Build', 'Add templates, recordings and graphic scenes. Apply your brand kit.'],
  ['Refine', 'Frame focus areas, camera moves, source trims, transitions and reading holds.'],
  ['Review and render', 'Preview shots and boundaries, record timecoded findings, then export.'],
];

const KIT = `brand-kits/acme/
├── brand.json          # themes, logo placement, backgrounds, bookends
├── guidelines.md       # rules the AI director reads on demand
├── logos/
│   ├── logo-on-dark.svg
│   └── logo-on-light.svg
├── fonts/AcmeSans.woff2
├── backgrounds/hero.webp
└── bookends/intro.mp4`;

function Icon({ path }) {
  return <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d={path} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

export default function Home() {
  return (
    <Layout title="Silent product videos from editable scenes" description="JoeFlux is a local studio for product demos and explainers, with an AI director, drop-in brand kits and deterministic rendering.">
      <header className={styles.hero}>
        <div className={styles.glow} aria-hidden="true" />
        <div className="container">
          <p className={styles.eyebrow}>Local studio · AI director · Silent MP4</p>
          <h1 className={styles.title}>Product videos you can <span>edit, review and rebrand</span></h1>
          <p className={styles.subtitle}>Turn screen recordings and product stories into polished silent videos. Direct them with an AI agent, refine them in the Studio and render from plain project files.</p>
          <div className={styles.actions}>
            <Link className="button button--primary button--lg" to="/docs/getting-started/installation">Get started</Link>
            <Link className="button button--secondary button--outline button--lg" to="/docs/architecture/overview">How it works</Link>
          </div>
          <div className={styles.shot}>
            <img src={useBaseUrl('/img/screens/studio.png')} alt="The Studio with director chat, live stage, shot strip and inspector" />
          </div>
        </div>
      </header>
      <main>
        <section className={styles.section}>
          <div className="container">
            <h2 className={styles.sectionTitle}>Everything a product video needs</h2>
            <div className={styles.features}>
              {FEATURES.map((item) => (
                <div key={item.title} className={styles.feature}>
                  <div className={styles.icon}><Icon path={item.icon} /></div>
                  <h3>{item.title}</h3>
                  <p>{item.text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
        <section className={styles.section}>
          <div className="container">
            <h2 className={styles.sectionTitle}>From brief to final cut</h2>
            <ol className={styles.steps}>
              {STEPS.map(([title, text], index) => <li key={title}><b>{String(index + 1).padStart(2, '0')}</b><h3>{title}</h3><p>{text}</p></li>)}
            </ol>
          </div>
        </section>
        <section className={styles.section}>
          <div className={`container ${styles.split}`}>
            <div>
              <h2 className={styles.sectionTitle}>Plug in any brand</h2>
              <p className={styles.lead}>A brand kit is a folder. Drop it into <code>brand-kits/</code>, run one sync command and its themes, backgrounds, logo overlay, fonts and bookends appear in the Studio, the CLI and the AI director.</p>
              <CodeBlock language="bash">{'cp -R ~/acme-brand brand-kits/acme\npnpm run brand -- sync'}</CodeBlock>
              <Link className="button button--primary" to="/docs/brand-kits/overview">Create a brand kit</Link>
            </div>
            <CodeBlock language="text">{KIT}</CodeBlock>
          </div>
        </section>
        <section className={`${styles.section} ${styles.cta}`}>
          <div className="container">
            <h2>Built to be cheap for agents to drive</h2>
            <p className={styles.lead}>A strict tool set, a short system prompt, merge-patch edits and on-demand images keep each director turn small.</p>
            <Link className="button button--secondary button--lg" to="/docs/architecture/token-efficiency">See the token budget</Link>
          </div>
        </section>
      </main>
    </Layout>
  );
}
