// Auth controller — thin layer that validates request shape then delegates to service.

import { registerUser, loginUser } from './auth.service.js';
import { ApiError } from '../../errors/ApiError.js';

export async function register(req, res, next) {
  try {
    const { username, email, password } = req.body ?? {};

    if (!username || !email || !password) {
      throw new ApiError(400, 'username, email and password are required');
    }
    if (password.length < 6) {
      throw new ApiError(400, 'Password must be at least 6 characters');
    }

    const result = await registerUser({ username, email, password });
    res.status(201).json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
}

export async function login(req, res, next) {
  try {
    const { email, password } = req.body ?? {};

    if (!email || !password) {
      throw new ApiError(400, 'email and password are required');
    }

    const result = await loginUser({ email, password });
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
}
