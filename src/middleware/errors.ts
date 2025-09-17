import { ZodError } from 'zod';
import type { Request, Response, NextFunction } from 'express';

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: 'ValidationError',
      // either dump issues or map to messages
      details: err.issues, // <-- not err.errors
    });
  }
  console.error(err);
  res.status(500).json({ error: 'ServerError' });
}
