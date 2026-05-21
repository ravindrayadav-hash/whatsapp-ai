// Auth service — handles user registration, login, and token generation.
// Passwords are hashed with bcrypt (salt rounds = 10) before storage.
// JWTs are signed with JWT_SECRET and expire after 7 days.

import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { AppDataSource } from "../../config/database.js";
import { User } from "../../entities/User.js";
import { ApiError } from "../../errors/ApiError.js";

const SALT_ROUNDS = 10;
const JWT_EXPIRES_IN = "7d";

function getRepo() {
  return AppDataSource.getRepository(User);
}

function signToken(payload) {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET env var is not set");
  return jwt.sign(payload, secret, { expiresIn: JWT_EXPIRES_IN });
}

export async function registerUser({ username, email, password }) {
  const repo = getRepo();

  // Reject duplicate username or email before bcrypt so we fail fast
  const existing = await repo.findOne({
    where: [{ username }, { email }],
  });
  if (existing) {
    const field = existing.username === username ? "username" : "email";
    throw new ApiError(409, `This ${field} is already taken`);
  }

  const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

  const user = repo.create({
    username: username.trim(),
    email: email.trim().toLowerCase(),
    password: hashedPassword,
    name: username.trim(),
  });

  const saved = await repo.save(user);

  const token = signToken({
    id: saved.id,
    username: saved.username,
    email: saved.email,
  });

  return {
    token,
    user: { id: saved.id, username: saved.username, email: saved.email },
  };
}

export async function loginUser({ email, password }) {
  const repo = getRepo();

  const user = await repo.findOne({
    where: { email: email.trim().toLowerCase() },
  });

  if (!user) throw new ApiError(401, "Invalid email or password");

  const match = await bcrypt.compare(password, user.password);
  if (!match) throw new ApiError(401, "Invalid email or password");

  const token = signToken({
    id: user.id,
    username: user.username,
    email: user.email,
  });

  return {
    token,
    user: { id: user.id, username: user.username, email: user.email },
  };
}
