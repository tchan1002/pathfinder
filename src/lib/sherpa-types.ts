import { z } from "zod";

// Shared types per contract
export const PageSchema = z.object({
  url: z.string(),
  title: z.string().max(512),
  score: z.number().min(0).max(1),
  rank: z.number().int().min(1),
  reasons: z.array(z.string()).optional(),
  updated_at: z.string(), // ISO 8601
});

export type Page = z.infer<typeof PageSchema>;

// Request schemas
export const AnalyzeRequestSchema = z.object({
  start_url: z.string().url(),
  domain_limit: z.string().nullable().optional(),
  user_id: z.string().nullable().optional(),
  max_pages: z.number().int().positive().nullable().optional(),
});

export const AdvanceRequestSchema = z.object({
  job_id: z.string().uuid(),
  consumed_url: z.string(),
});

export const FeedbackRequestSchema = z.object({
  job_id: z.string().uuid(),
  landed_url: z.string(),
  was_correct: z.boolean(),
  chosen_rank: z.number().int().positive().nullable().optional(),
  user_id: z.string().nullable().optional(),
  timestamp: z.string(), // ISO 8601
});

// Response schemas
export const CachedResponseSchema = z.object({
  mode: z.literal("cached"),
  job_id: z.string().uuid(),
  top: PageSchema,
  next: PageSchema.nullable(),
  remaining: z.number().int().min(0),
});

export const StartedResponseSchema = z.object({
  mode: z.literal("started"),
  job_id: z.string().uuid(),
  eta_sec: z.number().int().min(0),
});

export const JobStatusResponseSchema = z.object({
  status: z.enum(["queued", "running", "done", "error"]),
  progress: z.object({
    pages_scanned: z.number().int().min(0),
    pages_total_est: z.number().int().min(0).optional(),
  }).optional(),
  error_code: z.string().optional(),
  error_message: z.string().optional(),
});

export const HeadResponseSchema = z.object({
  top: PageSchema,
  next: PageSchema.nullable(),
  remaining: z.number().int().min(0),
});

export const AdvanceResponseSchema = z.object({
  next: PageSchema.nullable(),
  remaining: z.number().int().min(0),
});

export const FeedbackResponseSchema = z.object({
  ok: z.literal(true),
});

// Error schemas
export const ErrorResponseSchema = z.object({
  error_code: z.string(),
  error_message: z.string(),
  request_id: z.string(),
});

export type AnalyzeRequest = z.infer<typeof AnalyzeRequestSchema>;
export type AdvanceRequest = z.infer<typeof AdvanceRequestSchema>;
export type FeedbackRequest = z.infer<typeof FeedbackRequestSchema>;
export type CachedResponse = z.infer<typeof CachedResponseSchema>;
export type StartedResponse = z.infer<typeof StartedResponseSchema>;
export type JobStatusResponse = z.infer<typeof JobStatusResponseSchema>;
export type HeadResponse = z.infer<typeof HeadResponseSchema>;
export type AdvanceResponse = z.infer<typeof AdvanceResponseSchema>;
export type FeedbackResponse = z.infer<typeof FeedbackResponseSchema>;
export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;

// Error codes per contract
export const ERROR_CODES = {
  INVALID_URL: "INVALID_URL",
  DISALLOWED_DOMAIN: "DISALLOWED_DOMAIN", 
  ROBOTS_BLOCKED: "ROBOTS_BLOCKED",
  RATE_LIMITED: "RATE_LIMITED",
  CRAWL_TIMEOUT: "CRAWL_TIMEOUT",
  CRAWL_FAILURE: "CRAWL_FAILURE",
  INTERNAL_ERROR: "INTERNAL_ERROR",
  INVALID_REQUEST: "INVALID_REQUEST",
  JOB_NOT_FOUND: "JOB_NOT_FOUND",
  SITE_NOT_FOUND: "SITE_NOT_FOUND",
} as const;

export type ErrorCode = keyof typeof ERROR_CODES;
