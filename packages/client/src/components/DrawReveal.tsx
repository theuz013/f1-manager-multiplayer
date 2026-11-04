import React, { useEffect, useState } from 'react';

export interface DrawItem {
  label: string;
  sub?: string;
  color?: string;
}

const STEP_MS = 1100;
const SPIN_MS = 70;

export default function DrawReveal({ title, items, onClose }: { title: string; items: DrawItem[]; onClose: () => void }) {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const [revealed, setRevealed] = useState(reduceMotion ? items.length : 0);
  const [spinIndex, setSpinIndex] = useState(0);
  const done = revealed >= items.length;

  useEffect(() => {
    if (done) return;
    const step = setTimeout(() => setRevealed((r) => r + 1), STEP_MS);
    const spin = setInterval(() => setSpinIndex((i) => i + 1), SPIN_MS);
    return () => {
      clearTimeout(step);
      clearInterval(spin);
    };
  }, [revealed, done]);

  // O slot girando só mostra nomes ainda não sorteados
  const remaining = items.slice(revealed);
  const spinning = remaining[spinIndex % Math.max(remaining.length, 1)];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.78)',
        display: 'grid',
        placeItems: 'center',
        zIndex: 1000,
        padding: '24px'
      }}
    >
      <div className="card" style={{ width: '100%', maxWidth: '520px', display: 'grid', gap: '14px', maxHeight: '90vh', overflowY: 'auto' }}>
        <h2 style={{ margin: 0 }}>🎲 {title}</h2>

        <ol aria-live="polite" style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '6px' }}>
          {items.map((item, idx) => {
            const isRevealed = idx < revealed;
            const isSpinning = idx === revealed && !done;
            const shown = isRevealed ? item : isSpinning ? spinning : null;
            return (
              <li
                key={idx}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '10px 14px',
                  borderRadius: '8px',
                  background: 'var(--panel-2)',
                  border: `1px solid ${isRevealed ? 'var(--accent)' : 'var(--line)'}`,
                  opacity: isRevealed || isSpinning ? 1 : 0.35,
                  transition: 'border-color 0.3s, opacity 0.3s'
                }}
              >
                <b style={{ width: '28px', fontSize: '1.1rem', color: 'var(--accent)' }}>{idx + 1}º</b>
                {shown?.color && (
                  <span style={{ width: '12px', height: '12px', borderRadius: '50%', background: shown.color, flexShrink: 0 }} />
                )}
                <span style={{ flex: 1, color: isSpinning ? 'var(--muted)' : '#fff', fontWeight: isRevealed ? 700 : 400 }}>
                  {shown ? shown.label : '???'}
                  {isRevealed && item.sub && (
                    <span style={{ display: 'block', fontSize: '0.78rem', color: 'var(--muted)', fontWeight: 400 }}>{item.sub}</span>
                  )}
                </span>
              </li>
            );
          })}
        </ol>

        {done ? (
          <button className="primary" onClick={onClose} autoFocus>
            Continuar
          </button>
        ) : (
          <button onClick={() => setRevealed(items.length)}>Pular animação</button>
        )}
      </div>
    </div>
  );
}
