import React, { useEffect, useState } from 'react';
import { teamDef, type LeagueTeam } from './LeagueDashboard';

interface FeedItem {
  id: string;
  kind: string;
  text: string;
  season: number;
  gpIndex: number;
  createdAt: string;
  replyToId: string | null;
  teamId: string | null;
}

export interface PaddockState {
  feed: FeedItem[];
  pendingInterview: { season: number; gpIndex: number; gp: string; question: string; tones: Record<string, string> } | null;
  pendingReplies: { postId: string; text: string; from: string }[];
  replyTones: Record<string, string>;
  isAdmin: boolean;
  myTeamId: string | null;
}

const FILTERS: [string, string, string[]][] = [
  ['tudo', 'Tudo', []],
  ['corridas', 'Corridas', ['corrida', 'quali', 'temporada']],
  ['mercado', 'Mercado', ['mercado']],
  ['pd', 'P&D e rumores', ['pd', 'rumor']],
  ['entrevistas', 'Entrevistas', ['entrevista', 'resposta']],
  ['mensagens', 'Mensagens', ['mensagem', 'admin']]
];

const when = (iso: string) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

export default function PaddockPanel({ leagueCode, teams, onChanged }: { leagueCode: string; teams: LeagueTeam[]; onChanged: () => void }) {
  const [state, setState] = useState<PaddockState | null>(null);
  const [filter, setFilter] = useState('tudo');
  const [tone, setTone] = useState<string | null>(null);
  const [target, setTarget] = useState('');
  const [text, setText] = useState('');
  const [announce, setAnnounce] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    const res = await fetch(`/api/leagues/${leagueCode}/paddock`);
    if (res.ok) setState(await res.json());
  }
  useEffect(() => {
    load();
    const id = setInterval(load, 8000);
    return () => clearInterval(id);
  }, [leagueCode]);

  async function post(action: string, body: object) {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/leagues/${leagueCode}/paddock/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      setMsg(res.ok ? data.message ?? null : `⚠️ ${data.error}`);
      if (res.ok) {
        setTone(null);
        setTarget('');
        setText('');
      }
      await load();
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  if (!state) return <div className="card"><p className="muted">Carregando o paddock...</p></div>;

  const kinds = FILTERS.find(([k]) => k === filter)![2];
  const roots = state.feed.filter((f) => !f.replyToId && (!kinds.length || kinds.includes(f.kind)));
  const repliesOf = (id: string) => state.feed.filter((f) => f.replyToId === id).reverse();
  const rivals = teams.filter((t) => t.id !== state.myTeamId);
  const iv = state.pendingInterview;

  return (
    <div className="stack">
      {iv && (
        <div className="card" style={{ borderColor: 'var(--accent)' }}>
          <div className="eyebrow">Entrevista pós-GP · {iv.gp}</div>
          <h3>{iv.question}</h3>
          <div className="seg" style={{ flexWrap: 'wrap' }}>
            {Object.entries(iv.tones).map(([k, label]) => (
              <button key={k} className={tone === k ? 'on' : ''} onClick={() => setTone(k)}>
                {label}
              </button>
            ))}
          </div>
          {tone === 'criticar' && (
            <label className="field" style={{ marginTop: '8px' }}>
              <span>Qual rival?</span>
              <select value={target} onChange={(e) => setTarget(e.target.value)}>
                <option value="">Escolha uma equipe…</option>
                {rivals.map((t) => (
                  <option key={t.id} value={t.id}>
                    {teamDef(t.teamId)?.name} {t.isAI ? '(IA)' : `(${t.user?.name || t.user?.username})`}
                  </option>
                ))}
              </select>
            </label>
          )}
          <p className="muted small">A resposta vira manchete no mural. Quem for criticado é avisado e pode responder até o próximo GP.</p>
          <button
            className="primary"
            disabled={busy || !tone || (tone === 'criticar' && !target)}
            onClick={() => post('interview', { tone, targetTeamId: target || undefined })}
          >
            Responder à imprensa
          </button>
        </div>
      )}

      {state.pendingReplies.length > 0 && (
        <div className="card" style={{ borderColor: 'var(--warn)' }}>
          <h3>Críticas à sua equipe</h3>
          {state.pendingReplies.map((r) => (
            <div key={r.postId} style={{ marginBottom: '10px' }}>
              <p className="small" style={{ margin: '0 0 6px' }}>{r.text}</p>
              <div className="row" style={{ gap: '6px', flexWrap: 'wrap' }}>
                {Object.entries(state.replyTones).map(([k, label]) => (
                  <button key={k} className="small-btn" disabled={busy} onClick={() => post('reply', { postId: r.postId, tone: k })}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="card">
        <div className="lap-head">
          <h2>Paddock</h2>
          <span className="muted small">Tudo o que acontece na liga, em tempo real</span>
        </div>
        {msg && <p className="tip small">{msg}</p>}

        <div style={{ display: 'grid', gap: '6px', marginBottom: '12px' }}>
          <label style={{ display: 'grid', gap: '6px' }}>
            <span className="small">{announce ? 'Comunicado do administrador' : 'Mensagem no mural'}</span>
            <textarea
              rows={2}
              maxLength={280}
              value={text}
              placeholder={announce ? 'Aviso para toda a liga…' : 'Provoque, comemore, combine…'}
              onChange={(e) => setText(e.target.value)}
              style={{ width: '100%', resize: 'vertical' }}
            />
          </label>
          <div className="row" style={{ gap: '10px', alignItems: 'center', justifyContent: 'space-between' }}>
            <span className="muted small">{text.length}/280</span>
            <span className="row" style={{ gap: '10px', alignItems: 'center' }}>
              {state.isAdmin && (
                <label className="small" style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                  <input type="checkbox" checked={announce} onChange={(e) => setAnnounce(e.target.checked)} style={{ width: 'auto' }} /> Comunicado
                </label>
              )}
              <button className="primary" disabled={busy || !text.trim()} onClick={() => post(announce ? 'announce' : 'message', { text })}>
                Publicar
              </button>
            </span>
          </div>
        </div>

        <div className="mkx-chips" style={{ marginBottom: '10px' }}>
          {FILTERS.map(([k, label, ks]) => (
            <button key={k} className={`mkx-chip ${filter === k ? 'on' : ''}`} onClick={() => setFilter(k)}>
              {label}
              <span>{ks.length ? state.feed.filter((f) => ks.includes(f.kind)).length : state.feed.length}</span>
            </button>
          ))}
        </div>

        {roots.length === 0 && <p className="muted small">Nada por aqui ainda.</p>}
        <ul className="news">
          {roots.map((f) => (
            <li key={f.id} style={f.kind === 'admin' ? { borderLeft: '3px solid var(--warn)', paddingLeft: '8px' } : undefined}>
              <span className="muted small" title={`Temporada ${f.season} · ${when(f.createdAt)}`}>
                GP {f.gpIndex + 1}
              </span>
              <div>
                {f.teamId && <i className="team-chip" style={{ background: teamDef(f.teamId)?.color, marginRight: '6px' }} />}
                {f.text}
                {repliesOf(f.id).map((r) => (
                  <div key={r.id} className="small" style={{ marginTop: '6px', paddingLeft: '10px', borderLeft: '2px solid var(--line)' }}>
                    {r.text}
                  </div>
                ))}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
