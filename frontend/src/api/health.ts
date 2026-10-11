import { z } from "zod";
import { apiRequest } from "./client.ts";

const healthResponseSchema = z.object({
  status: z.literal("ok"),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;

export function fetchHealth(): Promise<HealthResponse> {
  return apiRequest("/health", healthResponseSchema);
}
