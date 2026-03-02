import { useState, useEffect, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { listSessions, createSession, deleteSession } from '../services/api';
import { Session } from '../types';
import styles from './Home.module.css';

export default function Home() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [setNum, setSetNum] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    listSessions().then(setSessions).catch(() => {});
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = setNum.trim();
    if (!trimmed) return;

    setLoading(true);
    setError('');
    try {
      const session = await createSession(trimmed);
      navigate(`/session/${session.id}`);
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : 'Could not load set. Check the number and try again.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm('Remove this set from your list?')) return;
    await deleteSession(id);
    setSessions((prev) => prev.filter((s) => s.id !== id));
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <span className={styles.logo}>🧱</span>
        <div>
          <h1 className={styles.title}>LegoFinder</h1>
          <p className={styles.subtitle}>Find the pieces you need</p>
        </div>
      </header>

      {/* New set form */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Start a new set</h2>
        <form className={styles.form} onSubmit={handleSubmit}>
          <input
            className={styles.input}
            type="text"
            placeholder="Set number, e.g. 75192"
            value={setNum}
            onChange={(e) => setSetNum(e.target.value)}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            disabled={loading}
          />
          {error && <p className={styles.error}>{error}</p>}
          <button className={styles.button} type="submit" disabled={!setNum.trim() || loading}>
            {loading ? 'Loading…' : 'Load Set'}
          </button>
        </form>
      </section>

      {/* Existing sessions */}
      {sessions.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>My sets</h2>
          <ul className={styles.sessionList}>
            {sessions.map((s) => (
              <SessionCard
                key={s.id}
                session={s}
                onOpen={() => navigate(`/session/${s.id}`)}
                onDelete={(e) => handleDelete(s.id, e)}
              />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function SessionCard({
  session,
  onOpen,
  onDelete,
}: {
  session: Session;
  onOpen: () => void;
  onDelete: (e: React.MouseEvent) => void;
}) {
  const found = session.foundParts.length;
  const total = session.setParts.length;
  const pct = total > 0 ? Math.round((found / total) * 100) : 0;
  const lastScanned = session.lastScannedAt
    ? new Date(session.lastScannedAt).toLocaleDateString()
    : 'Not scanned yet';

  return (
    <li className={styles.card} onClick={onOpen}>
      <div className={styles.cardBody}>
        <span className={styles.cardName}>{session.setName}</span>
        <span className={styles.cardMeta}>#{session.setNum} · {lastScanned}</span>
        <div className={styles.cardProgress}>
          <div className={styles.cardBar}>
            <div className={styles.cardFill} style={{ width: `${pct}%` }} />
          </div>
          <span className={styles.cardPct}>{found}/{total} parts</span>
        </div>
      </div>
      <button className={styles.deleteBtn} onClick={onDelete} title="Remove">✕</button>
    </li>
  );
}
