import { Router } from "express";
import { register, login } from "./auth.controller.js";

const router = Router();

// POST /auth/register — create a new user account
router.post("/register", register);

// POST /auth/login — authenticate and receive a JWT
router.post("/login", login);

export default router;
