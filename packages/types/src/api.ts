import { z } from "zod";

export const ApiErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  details: z.unknown().optional(),
});

export type ApiError = z.infer<typeof ApiErrorSchema>;

export type ApiResponse<T> =
  | { success: true; data: T }
  | { success: false; error: ApiError };

export const PaginationSchema = z.object({
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(100).default(20),
  total: z.number().int().min(0),
});

export type Pagination = z.infer<typeof PaginationSchema>;

export type PaginatedResponse<T> = {
  items: T[];
  pagination: Pagination;
};
