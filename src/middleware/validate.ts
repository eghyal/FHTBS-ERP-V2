import { type Request, type Response, type NextFunction } from "express";
import { type ZodSchema, ZodError } from "zod";

/**
 * Middleware factory to validate Express request bodies using Zod schemas.
 * Rejects invalid payloads before any database operations occur.
 */
export const validateBody = (schema: ZodSchema) => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      req.body = schema.parse(req.body);
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        const issues = err.issues.map((issue) => ({
          field: issue.path.join("."),
          message: issue.message,
        }));
        return res.status(400).json({
          error: "Payload validation failed",
          details: issues,
          message: issues.map((i) => `${i.field ? i.field + ": " : ""}${i.message}`).join("; "),
        });
      }
      return res.status(400).json({ error: "Invalid request payload format" });
    }
  };
};

/**
 * Middleware factory to validate request query parameters
 */
export const validateQuery = (schema: ZodSchema) => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      req.query = schema.parse(req.query) as any;
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        return res.status(400).json({
          error: "Query parameter validation failed",
          details: err.issues.map((i) => ({ field: i.path.join("."), message: i.message })),
        });
      }
      return res.status(400).json({ error: "Invalid query parameters" });
    }
  };
};
