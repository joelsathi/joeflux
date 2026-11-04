import Link from '@docusaurus/Link';
import useBaseUrl from '@docusaurus/useBaseUrl';

export function Screenshot({ src, alt, caption }) {
  return (
    <figure className="vm-shot">
      <div className="vm-shot__bar" aria-hidden="true"><span /><span /><span /></div>
      <img src={useBaseUrl(src)} alt={alt} loading="lazy" />
      {caption && <figcaption>{caption}</figcaption>}
    </figure>
  );
}

export function Cards({ items }) {
  return (
    <div className="vm-cards">
      {items.map((item) => (
        <Link key={item.to} className="vm-card" to={item.to}>
          <strong>{item.title}</strong>
          <span>{item.text}</span>
        </Link>
      ))}
    </div>
  );
}

export function Stats({ items }) {
  return (
    <div className="vm-stats">
      {items.map((item) => <div key={item.label} className="vm-stat"><b>{item.value}</b><span>{item.label}</span></div>)}
    </div>
  );
}

export function Bars({ items, unit = '' }) {
  const max = Math.max(...items.map((item) => item.value));
  return (
    <div className="vm-bars" role="list">
      {items.map((item) => (
        <div key={item.label} className="vm-bar" role="listitem">
          <span>{item.label}</span>
          <div className="vm-bar__track"><div className="vm-bar__fill" style={{ width: `${Math.max(2, (item.value / max) * 100)}%` }} /></div>
          <span className="vm-bar__value">{item.value.toLocaleString()}{unit}</span>
        </div>
      ))}
    </div>
  );
}
