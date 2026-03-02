import { useState, useEffect, useRef, ChangeEvent } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getSession, scanImage } from '../services/api';
import { Session as SessionType, Part, FoundPart } from '../types';
import styles from './Session.module.css';

type Tab = 'missing' | 'found';

export default function Session() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [session, setSession] = useState<SessionType | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanMessage, setScanMessage] = useState('');
  const [tab, setTab] = useState<Tab>('missing');
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!id) return;
    getSession(id).then(setSession).catch(() => navigate('/'));
  }, [id]);

  async function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !id) return;

    // Reset input so the same file can be selected again
    e.target.value = '';

    setScanning(true);
    setScanMessage('');
    try {
      const { session: updated, newlyFound } = await scanImage(id, file);
      setSession(updated);
      setScanMessage(
        newlyFound > 0
          ? `✓ Found ${newlyFound} new piece type(s)!`
          : 'No new pieces identified. Try a different angle or closer photo.'
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Scan failed. Please try again.';
      setScanMessage(`⚠ ${msg}`);
    } finally {
      setScanning(false);
    }
  }

  if (!session) {
    return (
      <div className={styles.loading}>
        <div className={styles.spinner} />
      </div>
    );
  }

  const foundCount = session.foundParts.length;
  const totalCount = session.setParts.length;
  const progress = totalCount > 0 ? (foundCount / totalCount) * 100 : 0;

  return (
    <div className={styles.page}>
      {/* Header */}
      <header className={styles.header}>
        <button className={styles.back} onClick={() => navigate('/')}>←</button>
        <div className={styles.headerText}>
          <h1 className={styles.setName}>{session.setName}</h1>
          <span className={styles.setNum}>#{session.setNum}</span>
        </div>
      </header>

      {/* Progress */}
      <div className={styles.progressSection}>
        <div className={styles.progressBar}>
          <div className={styles.progressFill} style={{ width: `${progress}%` }} />
        </div>
        <span className={styles.progressText}>
          {foundCount} / {totalCount} part types found
        </span>
      </div>

      {/* Tabs */}
      <div className={styles.tabs}>
        <button
          className={`${styles.tab} ${tab === 'missing' ? styles.tabActive : ''}`}
          onClick={() => setTab('missing')}
        >
          Missing ({session.missingParts.length})
        </button>
        <button
          className={`${styles.tab} ${tab === 'found' ? styles.tabActive : ''}`}
          onClick={() => setTab('found')}
        >
          Found ({session.foundParts.length})
        </button>
      </div>

      {/* Parts list */}
      <div className={styles.list}>
        {tab === 'missing' ? (
          session.missingParts.length === 0 ? (
            <p className={styles.empty}>All parts found! 🎉</p>
          ) : (
            session.missingParts.map((part) => (
              <MissingPartRow key={`${part.partNum}-${part.colorId}`} part={part} />
            ))
          )
        ) : session.foundParts.length === 0 ? (
          <p className={styles.empty}>No parts found yet. Scan some photos!</p>
        ) : (
          session.foundParts.map((part) => (
            <FoundPartRow key={`${part.partNum}-${part.colorId}`} part={part} />
          ))
        )}
      </div>

      {/* Scan message */}
      {scanMessage && <p className={styles.scanMessage}>{scanMessage}</p>}

      {/* Action buttons */}
      <div className={styles.actions}>
        {/* Hidden file inputs */}
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          style={{ display: 'none' }}
          onChange={handleFileChange}
        />
        <input
          ref={galleryInputRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={handleFileChange}
        />

        <button
          className={styles.scanButton}
          onClick={() => cameraInputRef.current?.click()}
          disabled={scanning}
        >
          {scanning ? <span className={styles.spinnerSmall} /> : '📷'} Scan Pieces
        </button>
        <button
          className={styles.galleryButton}
          onClick={() => galleryInputRef.current?.click()}
          disabled={scanning}
        >
          🖼 Gallery
        </button>
      </div>
    </div>
  );
}

function MissingPartRow({ part }: { part: Part }) {
  return (
    <div className={styles.partRow}>
      <PartImage url={part.imageUrl} />
      <div className={styles.partInfo}>
        <span className={styles.partName}>{part.name}</span>
        <span className={styles.partMeta}>#{part.partNum} · {part.color}</span>
        <span className={styles.partQty}>Need: {part.quantity}</span>
      </div>
    </div>
  );
}

function FoundPartRow({ part }: { part: FoundPart }) {
  const complete = part.foundQuantity >= part.quantity;
  return (
    <div className={`${styles.partRow} ${complete ? styles.partRowFound : ''}`}>
      <PartImage url={part.imageUrl} />
      <div className={styles.partInfo}>
        <span className={styles.partName}>{part.name}</span>
        <span className={styles.partMeta}>#{part.partNum} · {part.color}</span>
        <span className={styles.partQty}>
          {part.foundQuantity} / {part.quantity} {complete ? '✓' : ''}
        </span>
      </div>
    </div>
  );
}

function PartImage({ url }: { url: string | null }) {
  if (!url) return <div className={`${styles.partImage} ${styles.partImageEmpty}`} />;
  return <img className={styles.partImage} src={url} alt="" loading="lazy" />;
}
