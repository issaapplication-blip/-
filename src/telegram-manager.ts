export type ManagerCommandInput = { chatId: string | number; chatType?: string; text?: string | null };
export type ManagerDeps = {
  managerChatIds: string[];
  send: (chatId: string | number, text: string) => Promise<unknown>;
  // Legacy dependencies are accepted for compatibility but are intentionally never invoked.
  rpc?: (fn: string, args: Record<string, unknown>) => Promise<{ data: any; error: { message?: string } | null }>;
  photoUrl?: (storagePath: string) => Promise<string | null>;
  sendPhoto?: (chatId: string | number, url: string, caption?: string, replyMarkup?: Record<string, unknown>) => Promise<unknown>;
  broadcast?: (text: string, testOnly: boolean) => Promise<{sent:number;failed:number;blocked:number;targets:number}>;
};

export function parseManagerChatIds(value?: string | null): string[] {
  return Array.from(new Set((value || "").split(",").map(v => v.trim()).filter(v => /^\d+$/.test(v))));
}

export async function handleManagerCommand(input: ManagerCommandInput, deps: ManagerDeps): Promise<boolean> {
  const chatId = String(input.chatId);
  if (input.chatType !== "private" || !deps.managerChatIds.includes(chatId) || !input.text) return false;
  const match = input.text.trim().match(/^\/(\S+)(?:\s+([\s\S]*))?$/);
  if (!match) return false;
  const command = match[1].split("@")[0].toLowerCase();
  if (command === "manager" || command === "help") {
    await deps.send(input.chatId, [
      "🛡️ إدارة RAFIQ — Telegram",
      "",
      "تم إيقاف أوامر مراجعة طلبات الرعاية والانتساب والعضويات القديمة.",
      "لا ينفذ البوت نشرًا أو بثًا تلقائيًا إلى القنوات أو المجموعات.",
      "تُنشر المراكز والعروض يدويًا بعد موافقة الإدارة فقط.",
      "استخدم /services لعرض فئات الدليل و /areas لعرض المناطق.",
      "خدمة CV وCover Letter مستقلة عبر /cv."
    ].join("\n"));
    return true;
  }
  if (["broadcast","broadcast_test","publish_ads","publish_specialty_ads","folders","folder","member","assign"].includes(command)) {
    await deps.send(input.chatId, "تم إيقاف هذا الأمر القديم. لا توجد عمليات تقديم أو بث تلقائي عبر أوامر المدير.");
    return true;
  }
  return false;
}
