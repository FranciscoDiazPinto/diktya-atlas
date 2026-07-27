import { Bot, User } from "lucide-react";
import { cn } from "../../lib/cn.js";
import { Badge } from "../ui/Badge.js";
import type { ChatToolResult } from "../../types/api.js";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  toolResults?: ChatToolResult[];
}

export function ChatMessageCard({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";

  return (
    <div className={cn("flex gap-2", isUser && "flex-row-reverse")}>
      <span
        className={cn(
          "flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
          isUser
            ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
            : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
        )}
      >
        {isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
      </span>
      <div
        className={cn(
          "max-w-[80%] rounded-lg px-3 py-2 text-sm",
          isUser
            ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
            : "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200"
        )}
      >
        <p className="whitespace-pre-wrap">{message.content}</p>
        {message.toolResults && message.toolResults.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {message.toolResults.map((tr, i) => (
              <Badge key={i} variant={tr.ok ? "success" : "danger"} title={tr.error}>
                {tr.tool}
              </Badge>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
