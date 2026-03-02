import { Router, Request, Response } from 'express';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import { sessionStore, setCache } from '../db';
import { getSetInfo, getSetParts } from '../services/rebrickable';
import { identifyParts } from '../services/vision';
import { Part, FoundPart, Session, ScanDetection } from '../types';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

// Normalize part IDs: strip trailing letter suffix so "3069" matches "3069b"
function normId(id: string) {
  return id.replace(/[a-z]+$/i, '').toLowerCase();
}
function findByPartNum<T extends { partNum: string }>(list: T[], id: string): T | undefined {
  return list.find((p) => p.partNum === id || normId(p.partNum) === normId(id));
}

// POST /api/sessions — create a new session for a set
router.post('/', async (req: Request, res: Response) => {
  const raw = (req.body as { setNum?: string }).setNum?.trim();
  if (!raw) {
    res.status(400).json({ error: 'setNum is required' });
    return;
  }

  // Auto-append "-1" variant suffix if missing (e.g. "75192" → "75192-1")
  const setNum = /^[\w-]+-\d+$/.test(raw) ? raw : `${raw}-1`;

  try {
    let cached = setCache.get(setNum);
    if (!cached) {
      const [{ name: setName, setImgUrl }, parts] = await Promise.all([getSetInfo(setNum), getSetParts(setNum)]);
      cached = { setName, setImgUrl, parts };
      setCache.set(setNum, cached);
    }

    const session: Session = {
      id: uuidv4(),
      setNum,
      setName: cached.setName,
      setImgUrl: cached.setImgUrl,
      setParts: cached.parts,
      foundParts: [],
      missingParts: cached.parts,
      createdAt: new Date(),
      lastScannedAt: null,
    };

    sessionStore.set(session);
    res.status(201).json(session);
  } catch (err: unknown) {
    const status =
      err && typeof err === 'object' && 'response' in err
        ? (err as { response?: { status?: number } }).response?.status
        : undefined;

    if (status === 404) {
      res.status(404).json({
        error: `Set "${setNum}" not found on Rebrickable. Double-check the set number (e.g. 75192-1).`,
      });
    } else if (status === 401) {
      res.status(500).json({ error: 'Rebrickable API key is invalid.' });
    } else {
      const message = err instanceof Error ? err.message : 'Unknown error';
      res.status(500).json({ error: `Failed to load set: ${message}` });
    }
  }
});

// GET /api/sessions — list all sessions
router.get('/', (_req: Request, res: Response) => {
  res.json(sessionStore.list());
});

// GET /api/sessions/:id — get session state
router.get('/:id', (req: Request, res: Response) => {
  const session = sessionStore.get(req.params.id as string);
  if (!session) {
    res.status(404).json({ error: 'Session not found' });
    return;
  }
  res.json(session);
});

// POST /api/sessions/:id/scan — detect only, does NOT update session
router.post('/:id/scan', upload.single('image'), async (req: Request, res: Response) => {
  const session = sessionStore.get(req.params.id as string);
  if (!session) {
    res.status(404).json({ error: 'Session not found' });
    return;
  }
  if (!req.file) {
    res.status(400).json({ error: 'image file is required' });
    return;
  }

  try {
    const detection = await identifyParts(req.file.buffer, req.file.mimetype);

    let scanDetection: ScanDetection | null = null;
    if (detection) {
      const partInfo = findByPartNum(session.setParts, detection.partNum);
      const inMissingList = !!findByPartNum(session.missingParts, detection.partNum);
      const canonicalPartNum = partInfo?.partNum ?? detection.partNum;
      console.log(`[scan] detection=${detection.partNum} → canonical=${canonicalPartNum} inMissingList=${inMissingList} bbox=${JSON.stringify(detection.boundingBox)}`);

      scanDetection = {
        partNum: canonicalPartNum,
        partName: partInfo?.name ?? detection.partNum,
        score: detection.score,
        inMissingList,
        boundingBox: detection.boundingBox,
      };
    }

    res.json({ detection: scanDetection });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: `Scan failed: ${message}` });
  }
});

// POST /api/sessions/:id/mark-found — confirm a detected part as found
router.post('/:id/mark-found', async (req: Request, res: Response) => {
  const session = sessionStore.get(req.params.id as string);
  if (!session) {
    res.status(404).json({ error: 'Session not found' });
    return;
  }

  const { partNum } = req.body as { partNum?: string };
  if (!partNum) {
    res.status(400).json({ error: 'partNum is required' });
    return;
  }

  const part = findByPartNum(session.setParts, partNum);
  console.log(`[mark-found] partNum=${partNum} → ${part?.partNum ?? 'NOT FOUND'} in set ${session.setNum}`);
  if (!part) {
    res.status(404).json({ error: `Part ${partNum} not in set` });
    return;
  }

  const foundMap = new Map<string, FoundPart>(
    session.foundParts.map((p) => [`${p.partNum}-${p.colorId}`, p])
  );
  const key = `${part.partNum}-${part.colorId}`;
  const existing = foundMap.get(key);
  let newlyFound = 0;

  if (existing) {
    existing.foundQuantity = Math.min(existing.foundQuantity + 1, part.quantity);
  } else {
    foundMap.set(key, { ...part, foundQuantity: 1 });
    newlyFound = 1;
  }

  session.foundParts = Array.from(foundMap.values());
  session.missingParts = session.setParts.filter((p) => {
    const found = session.foundParts.find((f) => f.partNum === p.partNum);
    return !found || found.foundQuantity < p.quantity;
  });
  session.lastScannedAt = new Date();
  sessionStore.set(session);

  console.log(`[mark-found] saved — foundParts: ${session.foundParts.length}, missingParts: ${session.missingParts.length}`);
  res.json({ session, newlyFound });
});

// DELETE /api/sessions/:id/found/:partNum — remove a wrongly marked part
router.delete('/:id/found/:partNum', (req: Request, res: Response) => {
  const session = sessionStore.get(req.params.id as string);
  if (!session) {
    res.status(404).json({ error: 'Session not found' });
    return;
  }

  const { partNum } = req.params as { partNum: string };
  session.foundParts = session.foundParts.filter((p) => p.partNum !== partNum);
  session.missingParts = session.setParts.filter((p) => {
    const found = session.foundParts.find((f) => f.partNum === p.partNum);
    return !found || found.foundQuantity < p.quantity;
  });
  sessionStore.set(session);

  res.json(session);
});

// DELETE /api/sessions/:id — clear session
router.delete('/:id', (req: Request, res: Response) => {
  const existed = sessionStore.delete(req.params.id as string);
  if (!existed) {
    res.status(404).json({ error: 'Session not found' });
    return;
  }
  res.status(204).send();
});

export default router;
