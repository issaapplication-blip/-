import { answerFromKnowledge } from "../supabase/functions/_shared/rafiq-knowledge";

export const rafiqFallback = (message: string, _conversationContext?: string): string => {
  return answerFromKnowledge(String(message || "")).reply;
};
