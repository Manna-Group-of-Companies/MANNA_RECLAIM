import { Router } from 'express';
import * as auth from '../controllers/auth.controller.js';
import { authenticate } from '../middlewares/auth.middleware.js';
import { adminOnly } from '../middlewares/role.middleware.js';
import { validate } from '../middlewares/validate.middleware.js';
import { authLimiter } from '../middlewares/rateLimiter.middleware.js';
import { loginSchema, registerSchema } from '../validations/auth.validation.js';

const router = Router();

router.post('/login', authLimiter, validate({ body: loginSchema }), auth.login);
router.post('/refresh', auth.refresh);
router.post('/logout', auth.logout);
router.get('/me', authenticate, auth.me);
router.post('/register', authenticate, adminOnly, validate({ body: registerSchema }), auth.register);

export default router;
