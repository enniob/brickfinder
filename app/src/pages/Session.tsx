import { useState, useEffect, useRef, ChangeEvent, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getSession, scanImage, markPartFound, unmarkPartFound } from '../services/api';
import { Session as SessionType, Part, FoundPart, ScanDetection, BoundingBox } from '../types';
import styles from './Session.module.css';

type Tab = 'missing' | 'found';

// ─── Image helpers ────────────────────────────────────────────────────────────

/** Draw through canvas to apply EXIF rotation and resize to max 1024px. */
function normalizeImage(file: File): Promise<{ dataUrl: string; uploadFile: File }> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        const MAX = 1024;
        let w = img.naturalWidth;
        let h = img.naturalHeight;
        if (w > MAX || h > MAX) {
          if (w >= h) { h = Math.round(h * MAX / w); w = MAX; }
          else { w = Math.round(w * MAX / h); h = MAX; }
        }
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        canvas.getContext('2d')!.drawImage(img, 0, 0, w, h);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
        canvas.toBlob((blob) => {
          resolve({
            dataUrl,
            uploadFile: blob ? new File([blob], 'image.jpg', { type: 'image/jpeg' }) : file,
          });
        }, 'image/jpeg', 0.92);
      };
      img.src = ev.target?.result as string;
    };
    reader.readAsDataURL(file);
  });
}

interface Tile {
  file: File;
  offsetX: number;
  offsetY: number;
  tileW: number;
  tileH: number;
}

/** Slice the image into a 2×2 grid. */
function tileImage(dataUrl: string): Promise<{ tiles: Tile[]; fullW: number; fullH: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const COLS = 2, ROWS = 2;
      const fullW = img.naturalWidth;
      const fullH = img.naturalHeight;
      const baseW = Math.floor(fullW / COLS);
      const baseH = Math.floor(fullH / ROWS);

      const promises: Promise<Tile>[] = [];
      for (let row = 0; row < ROWS; row++) {
        for (let col = 0; col < COLS; col++) {
          const ox = col * baseW;
          const oy = row * baseH;
          const tw = col === COLS - 1 ? fullW - ox : baseW;
          const th = row === ROWS - 1 ? fullH - oy : baseH;
          const canvas = document.createElement('canvas');
          canvas.width = tw;
          canvas.height = th;
          canvas.getContext('2d')!.drawImage(img, ox, oy, tw, th, 0, 0, tw, th);
          promises.push(
            new Promise<Tile>((res) =>
              canvas.toBlob(
                (blob) =>
                  res({
                    file: new File([blob!], 'tile.jpg', { type: 'image/jpeg' }),
                    offsetX: ox,
                    offsetY: oy,
                    tileW: tw,
                    tileH: th,
                  }),
                'image/jpeg',
                0.92
              )
            )
          );
        }
      }
      Promise.all(promises).then((tiles) => resolve({ tiles, fullW, fullH }));
    };
    img.src = dataUrl;
  });
}

/** Map a tile-space detection back to full-image coordinates. */
function adjustToFullImage(
  det: ScanDetection,
  offsetX: number,
  offsetY: number,
  tileW: number,
  tileH: number,
  fullW: number,
  fullH: number
): ScanDetection {
  const bb = det.boundingBox;
  const sx = bb.imageWidth > 0 ? tileW / bb.imageWidth : 1;
  const sy = bb.imageHeight > 0 ? tileH / bb.imageHeight : 1;
  return {
    ...det,
    boundingBox: {
      left: bb.left * sx + offsetX,
      upper: bb.upper * sy + offsetY,
      right: bb.right * sx + offsetX,
      lower: bb.lower * sy + offsetY,
      imageWidth: fullW,
      imageHeight: fullH,
    },
  };
}

/** IoU overlap between two bounding boxes in the same coordinate space. */
function boxIoU(a: BoundingBox, b: BoundingBox): number {
  const xOverlap = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
  const yOverlap = Math.max(0, Math.min(a.lower, b.lower) - Math.max(a.upper, b.upper));
  const inter = xOverlap * yOverlap;
  const union = (a.right - a.left) * (a.lower - a.upper) + (b.right - b.left) * (b.lower - b.upper) - inter;
  return union > 0 ? inter / union : 0;
}

// ─── Page component ───────────────────────────────────────────────────────────

export default function Session() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [session, setSession] = useState<SessionType | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanMessage, setScanMessage] = useState('');
  const [tab, setTab] = useState<Tab>('missing');
  const [scanImageUrl, setScanImageUrl] = useState<string | null>(null);
  const [scanDetections, setScanDetections] = useState<ScanDetection[]>([]);
  const [showScanPanel, setShowScanPanel] = useState(false);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!id) return;
    getSession(id).then(setSession).catch(() => navigate('/'));
  }, [id]);

  async function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !id) return;
    e.target.value = '';

    setScanning(true);
    setScanMessage('');
    setScanDetections([]);
    setShowScanPanel(true);

    const { dataUrl } = await normalizeImage(file);
    setScanImageUrl(dataUrl);

    try {
      const { tiles, fullW, fullH } = await tileImage(dataUrl);

      // Scan all tiles in parallel
      const settled = await Promise.allSettled(
        tiles.map(async ({ file: tileFile, offsetX, offsetY, tileW, tileH }) => {
          const { detection } = await scanImage(id, tileFile);
          if (!detection) return null;
          return adjustToFullImage(detection, offsetX, offsetY, tileW, tileH, fullW, fullH);
        })
      );

      // Collect successes, sort by score desc
      const raw: ScanDetection[] = settled
        .filter((r): r is PromiseFulfilledResult<ScanDetection> => r.status === 'fulfilled' && r.value !== null)
        .map((r) => r.value)
        .sort((a, b) => b.score - a.score);

      // Deduplicate: drop boxes that overlap >30% with a higher-scored box
      const kept: ScanDetection[] = [];
      for (const det of raw) {
        if (!kept.some((k) => boxIoU(det.boundingBox, k.boundingBox) > 0.3)) {
          kept.push(det);
        }
      }

      setScanDetections(kept);
      if (kept.length === 0) {
        setScanMessage('Nothing identified. Try a closer or clearer photo.');
      }
    } catch (err: unknown) {
      setScanMessage(`⚠ ${err instanceof Error ? err.message : 'Scan failed.'}`);
    } finally {
      setScanning(false);
    }
  }

  async function handleMarkFound(partNum: string): Promise<void> {
    if (!id) throw new Error('No session');
    const result = await markPartFound(id, partNum);
    setSession(result.session);
  }

  async function handleUnmarkFound(partNum: string) {
    if (!id) return;
    try {
      setSession(await unmarkPartFound(id, partNum));
    } catch (err: unknown) {
      setScanMessage(`⚠ ${err instanceof Error ? err.message : 'Failed to remove part.'}`);
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
      <header className={styles.header}>
        <button className={styles.back} onClick={() => navigate('/')}>←</button>
        {session.setImgUrl && (
          <img className={styles.headerSetImg} src={session.setImgUrl} alt={session.setName} />
        )}
        <div className={styles.headerText}>
          <h1 className={styles.setName}>{session.setName}</h1>
          <span className={styles.setNum}>#{session.setNum}</span>
        </div>
      </header>

      <div className={styles.progressSection}>
        <div className={styles.progressBar}>
          <div className={styles.progressFill} style={{ width: `${progress}%` }} />
        </div>
        <span className={styles.progressText}>{foundCount} / {totalCount} part types found</span>
      </div>

      {showScanPanel && scanImageUrl && (
        <ScanResultPanel
          imageUrl={scanImageUrl}
          detections={scanDetections}
          scanning={scanning}
          onDismiss={() => setShowScanPanel(false)}
          onMarkFound={handleMarkFound}
        />
      )}

      {scanMessage && <p className={styles.scanMessage}>{scanMessage}</p>}

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
            <FoundPartRow
              key={`${part.partNum}-${part.colorId}`}
              part={part}
              onUnmark={() => handleUnmarkFound(part.partNum)}
            />
          ))
        )}
      </div>

      <div className={styles.actions}>
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

// ─── Sub-components ───────────────────────────────────────────────────────────

function ScanResultPanel({
  imageUrl,
  detections,
  scanning,
  onDismiss,
  onMarkFound,
}: {
  imageUrl: string;
  detections: ScanDetection[];
  scanning: boolean;
  onDismiss: () => void;
  onMarkFound: (partNum: string) => Promise<void>;
}) {
  const [markedIndices, setMarkedIndices] = useState<Set<number>>(new Set());
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const matching = detections.filter((d) => d.inMissingList);
  const notInSet = detections.filter((d) => !d.inMissingList);

  // Reset marks when a new scan comes in
  useEffect(() => {
    setMarkedIndices(new Set());
  }, [detections]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !imageUrl) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img = new Image();
    img.onload = () => {
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      ctx.drawImage(img, 0, 0);

      const lw = Math.max(3, img.naturalWidth / 120);
      const fontSize = Math.max(11, img.naturalWidth / 70);
      ctx.font = `bold ${fontSize}px sans-serif`;

      matching.forEach((det, idx) => {
        const { left, upper, right, lower, imageWidth, imageHeight } = det.boundingBox;
        const sx = imageWidth > 0 ? img.naturalWidth / imageWidth : 1;
        const sy = imageHeight > 0 ? img.naturalHeight / imageHeight : 1;
        const x = left * sx, y = upper * sy;
        const w = (right - left) * sx, h = (lower - upper) * sy;

        if (markedIndices.has(idx)) {
          // Dimmed green + checkmark once marked
          ctx.globalAlpha = 0.45;
          ctx.strokeStyle = '#27ae60';
          ctx.lineWidth = lw;
          ctx.strokeRect(x, y, w, h);
          ctx.globalAlpha = 1;
          ctx.fillStyle = '#27ae60';
          ctx.fillText('✓', x + w / 2 - fontSize / 2, y + h / 2 + fontSize / 3);
        } else {
          // Bright green box + part number label
          ctx.strokeStyle = '#2ecc71';
          ctx.lineWidth = lw;
          ctx.strokeRect(x, y, w, h);

          // Label background
          const label = `#${det.partNum}`;
          const tw = ctx.measureText(label).width + 8;
          const th = fontSize + 6;
          const lx = x, ly = y > th + 4 ? y - th - 2 : y + 2;
          ctx.fillStyle = '#2ecc71';
          ctx.fillRect(lx, ly, tw, th);
          ctx.fillStyle = '#fff';
          ctx.fillText(label, lx + 4, ly + th - 4);
        }
      });
    };
    img.src = imageUrl;
  }, [imageUrl, detections, markedIndices]);

  useEffect(() => {
    if (!scanning) draw();
  }, [draw, scanning]);

  async function handleCanvasClick(e: React.MouseEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const px = (e.clientX - rect.left) * (canvas.width / rect.width);
    const py = (e.clientY - rect.top) * (canvas.height / rect.height);

    for (let idx = 0; idx < matching.length; idx++) {
      const det = matching[idx];
      if (markedIndices.has(idx)) continue;
      const { left, upper, right, lower, imageWidth, imageHeight } = det.boundingBox;
      const sx = imageWidth > 0 ? canvas.width / imageWidth : 1;
      const sy = imageHeight > 0 ? canvas.height / imageHeight : 1;
      const bx = left * sx, by = upper * sy;
      const bw = (right - left) * sx, bh = (lower - upper) * sy;

      // Generous tap tolerance for mobile
      const tol = Math.max(12, bw * 0.15);
      if (px >= bx - tol && px <= bx + bw + tol && py >= by - tol && py <= by + bh + tol) {
        // Optimistic mark — revert if API fails
        setMarkedIndices((prev) => new Set([...prev, idx]));
        try {
          await onMarkFound(det.partNum);
        } catch {
          setMarkedIndices((prev) => { const n = new Set(prev); n.delete(idx); return n; });
        }
        break;
      }
    }
  }

  return (
    <div className={styles.scanResult}>
      <div className={styles.scanCardHeader}>
        <span className={styles.scanCardCounter}>
          {scanning
            ? 'Scanning…'
            : matching.length > 0
            ? `${matching.length - markedIndices.size} of ${matching.length} piece(s) left to mark`
            : 'Scan result'}
        </span>
        <button className={styles.scanDismiss} onClick={onDismiss}>✕</button>
      </div>

      {scanning && (
        <div className={styles.scanCardSpinner}>
          <div className={styles.spinner} />
        </div>
      )}

      {!scanning && matching.length === 0 && (
        <p className={styles.scanResultLabel}>
          {detections.length > 0
            ? `Detected ${detections.length} piece(s) but none are in your missing list.`
            : 'Nothing identified. Try a closer photo.'}
        </p>
      )}

      {!scanning && (
        <canvas
          ref={canvasRef}
          className={styles.scanCanvas}
          onClick={handleCanvasClick}
          style={{ cursor: matching.length > 0 ? 'pointer' : 'default' }}
        />
      )}

      {!scanning && notInSet.length > 0 && (
        <p className={styles.detectionFootnote}>
          Also detected (not in set): {notInSet.map((d) => `#${d.partNum}`).join(', ')}
        </p>
      )}
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

function FoundPartRow({ part, onUnmark }: { part: FoundPart; onUnmark: () => void }) {
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
      <button className={styles.unmarkButton} onClick={onUnmark} title="Remove">✕</button>
    </div>
  );
}

function PartImage({ url }: { url: string | null }) {
  if (!url) return <div className={`${styles.partImage} ${styles.partImageEmpty}`} />;
  return <img className={styles.partImage} src={url} alt="" loading="lazy" />;
}
