import { Router, Request, Response } from 'express';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import { sessionStore, setCache } from '../db';
import { getSetName, getSetParts } from '../services/rebrickable';
import { identifyParts } from '../services/vision';
import { Part, FoundPart, Session } from '../types';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

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
    // Use cached parts if available
    let cached = setCache.get(setNum);
    if (!cached) {
      const [setName, parts] = await Promise.all([getSetName(setNum), getSetParts(setNum)]);
      cached = { setName, parts };
      setCache.set(setNum, cached);
    }

    const session: Session = {
      id: uuidv4(),
      setNum,
      setName: cached.setName,
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

// POST /api/sessions/:id/scan — upload photo and identify parts
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

  const mimeType = req.file.mimetype as 'image/jpeg' | 'image/png' | 'image/webp';
  const imageBase64 = req.file.buffer.toString('base64');

  try {
    const identified = await identifyParts(imageBase64, mimeType, session.missingParts);

    // Merge newly identified parts into foundParts (additive)
    const foundMap = new Map<string, FoundPart>(
      session.foundParts.map((p) => [`${p.partNum}-${p.colorId}`, p])
    );

    for (const { partNum, quantity } of identified) {
      const required = session.setParts.find((p) => p.partNum === partNum);
      if (!required) continue;

      const key = `${partNum}-${required.colorId}`;
      const existing = foundMap.get(key);
      if (existing) {
        // Don't exceed required quantity
        existing.foundQuantity = Math.min(
          existing.foundQuantity + quantity,
          required.quantity
        );
      } else {
        foundMap.set(key, {
          ...required,
          foundQuantity: Math.min(quantity, required.quantity),
        });
      }
    }

    session.foundParts = Array.from(foundMap.values());

    // Rebuild missing parts
    const foundNums = new Set(session.foundParts.map((p) => p.partNum));
    session.missingParts = session.setParts.filter((p) => {
      const found = session.foundParts.find((f) => f.partNum === p.partNum);
      if (!found) return true;
      return found.foundQuantity < p.quantity;
    });

    session.lastScannedAt = new Date();
    sessionStore.set(session);

    res.json({
      session,
      newlyFound: identified.length,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: `Vision scan failed: ${message}` });
  }
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
