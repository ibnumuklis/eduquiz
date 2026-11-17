import "server-only";
import { createClient } from "@/lib/supabase/server";
import { signImages } from "@/features/quizzes/queries";
import type { ReviewPayload } from "@/types";

export async function getAttemptReview(attemptId: string): Promise<ReviewPayload | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_attempt_review", { p_attempt: attemptId });
  if (error || !data) return null;
  const review = data as ReviewPayload;
  if (review.items?.length) {
    const urls = await signImages(supabase, review.items.map((i) => i.image_path));
    review.items = review.items.map((i) => ({ ...i, image_url: i.image_path ? urls.get(i.image_path) ?? null : null }));
  }
  return review;
}
