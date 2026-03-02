import { Router, Request, Response } from 'express';
import { setCache } from '../db';
import { getSetInfo } from '../services/rebrickable';

const router = Router();

// GET /api/sets/:setNum — lightweight lookup: returns set name + image without fetching parts.
// Used by the frontend to preview a set before creating a session.
router.get('/:setNum', async (req: Request, res: Response) => {
  const raw = (req.params.setNum as string).trim();
  const setNum = /^[\w-]+-\d+$/.test(raw) ? raw : `${raw}-1`;

  try {
    // Return cached info if already loaded (parts cache includes name + image)
    const cached = setCache.get(setNum);
    if (cached) {
      res.json({ setNum, setName: cached.setName, setImgUrl: cached.setImgUrl });
      return;
    }

    // Lightweight fetch — just set metadata, no parts list
    const { name: setName, setImgUrl } = await getSetInfo(setNum);
    res.json({ setNum, setName, setImgUrl });
  } catch (err: unknown) {
    const status =
      err && typeof err === 'object' && 'response' in err
        ? (err as { response?: { status?: number } }).response?.status
        : undefined;

    if (status === 404) {
      res.status(404).json({ error: `Set "${setNum}" not found on Rebrickable.` });
    } else {
      res.status(500).json({ error: 'Failed to look up set.' });
    }
  }
});

export default router;
