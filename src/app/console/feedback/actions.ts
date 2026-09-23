"use server";

import { markFromForm } from "@/lib/feedback/route";
import { consoleRoute } from "../context";

export async function markFeedbackAction(formData: FormData): Promise<void> {
  await markFromForm(consoleRoute(), formData);
}
