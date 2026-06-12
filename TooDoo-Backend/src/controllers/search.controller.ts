import type { Request, Response } from 'express';

import { getSearchTips } from '../services/search-tips.service';
import { logSafe } from '../services/logging.service';

export async function listSearchTips(req: Request, res: Response) {
  try {
    const takeRaw = req.query.take;
    const take =
      takeRaw == null
        ? undefined
        : typeof takeRaw === 'string'
          ? Number(takeRaw)
          : Number(takeRaw);

    const city = typeof req.query.city === 'string' ? req.query.city : undefined;
    const q = typeof req.query.q === 'string' ? req.query.q : undefined;

    const result = await getSearchTips({
      take: Number.isFinite(take) ? take : undefined,
      city,
      q,
    });

    res.status(200).json(result);
  } catch (error) {
    logSafe({
      status: 'ERROR',
      message: 'Failed to list search tips',
      context: { path: req.path, method: req.method },
      error,
    });
    res.status(500).json({ error: 'Internal Server Error' });
  }
}
