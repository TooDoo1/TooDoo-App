import { Router } from 'express';

import { listSearchTips } from '../controllers/search.controller';
import { validate } from '../middleware/validate.middleware';
import { searchTipsQuerySchema } from '../schemas/search.schema';

const router = Router();

router.get('/tips', validate({ query: searchTipsQuerySchema }), listSearchTips);

export default router;
