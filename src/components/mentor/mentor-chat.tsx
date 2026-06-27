"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useTranslations, useLocale } from "next-intl";
import { api } from "@/lib/trpc/react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Send,
  Plus,
  Trash2,
  MessageSquare,
  Bot,
  User,
  Settings,
  Loader2,
  ChevronRight,
  ChevronLeft,
} from "lucide-react";
import { toast } from "sonner";
import { Link } from "@/i18n/navigation";
import Markdown from "react-markdown";

// -------------------------------------------------------------------
// Types
// -------------------------------------------------------------------

interface Message {
  role: "user" | "assistant";
  content: string;
  timestamp?: string;
}

// -------------------------------------------------------------------
// Component
// -------------------------------------------------------------------

export function MentorChat() {
  const t = useTranslations("mentor");
  const locale = useLocale();
  const isRTL = locale === "he";

  // State
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Open the sessions sidebar by default on desktop only — on a phone it would
  // cover the conversation, so it stays collapsed until the user opens it.
  useEffect(() => {
    if (typeof window !== "undefined" && window.matchMedia("(min-width: 768px)").matches) {
      setSidebarOpen(true);
    }
  }, []);

  // Refs
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // tRPC queries
  const apiKeyQuery = api.ai.hasApiKey.useQuery();
  const sessionsQuery = api.ai.getChatSessions.useQuery();
  const sessionQuery = api.ai.getChatSession.useQuery(
    { sessionId: activeSessionId! },
    { enabled: !!activeSessionId }
  );
  const deleteSession = api.ai.deleteChatSession.useMutation({
    onSuccess: () => {
      toast.success(t("chatDeleted"));
      sessionsQuery.refetch();
      if (activeSessionId) {
        setActiveSessionId(null);
        setMessages([]);
      }
    },
    onError: () => {
      toast.error(t("deleteChatError"));
    },
  });

  // Load session messages when a session is selected
  useEffect(() => {
    if (sessionQuery.data) {
      setMessages(
        sessionQuery.data.messages.map((m) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
          timestamp: m.timestamp,
        }))
      );
    }
  }, [sessionQuery.data]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // -------------------------------------------------------------------
  // Streaming handler
  // -------------------------------------------------------------------

  const sendMessage = useCallback(
    async (messageText: string) => {
      if (!messageText.trim() || isStreaming) return;

      const userMessage: Message = {
        role: "user",
        content: messageText.trim(),
      };
      setMessages((prev) => [...prev, userMessage]);
      setInput("");
      setIsStreaming(true);

      // Start with an empty assistant message for streaming
      const assistantMessage: Message = { role: "assistant", content: "" };
      setMessages((prev) => [...prev, assistantMessage]);

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const response = await fetch("/api/chat/stream", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId: activeSessionId ?? undefined,
            message: messageText.trim(),
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(
            (errorData as { error?: string }).error || `HTTP ${response.status}`
          );
        }

        const reader = response.body?.getReader();
        if (!reader) throw new Error("No response body");

        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const jsonStr = line.slice(6);

            try {
              const event = JSON.parse(jsonStr) as {
                type: string;
                text?: string;
                sessionId?: string;
                title?: string;
                error?: string;
              };

              switch (event.type) {
                case "meta":
                  if (event.sessionId && !activeSessionId) {
                    setActiveSessionId(event.sessionId);
                  }
                  break;

                case "delta":
                  if (event.text) {
                    setMessages((prev) => {
                      const updated = [...prev];
                      const last = updated[updated.length - 1];
                      if (last?.role === "assistant") {
                        updated[updated.length - 1] = {
                          ...last,
                          content: last.content + event.text,
                        };
                      }
                      return updated;
                    });
                  }
                  break;

                case "done":
                  break;

                case "error":
                  toast.error(event.error ?? t("errorSending"));
                  // Remove empty assistant message
                  setMessages((prev) => {
                    const last = prev[prev.length - 1];
                    if (last?.role === "assistant" && !last.content) {
                      return prev.slice(0, -1);
                    }
                    return prev;
                  });
                  break;
              }
            } catch {
              // Skip malformed JSON
            }
          }
        }

        // Refresh sessions list after successful chat
        sessionsQuery.refetch();
      } catch (err: unknown) {
        if ((err as Error).name === "AbortError") return;
        toast.error(t("errorSending"));
        // Remove empty assistant message on error
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (last?.role === "assistant" && !last.content) {
            return prev.slice(0, -1);
          }
          return prev;
        });
      } finally {
        setIsStreaming(false);
        abortRef.current = null;
        inputRef.current?.focus();
      }
    },
    [activeSessionId, isStreaming, t, sessionsQuery]
  );

  // -------------------------------------------------------------------
  // Handlers
  // -------------------------------------------------------------------

  const handleNewChat = () => {
    setActiveSessionId(null);
    setMessages([]);
    inputRef.current?.focus();
  };

  const handleSelectSession = (sessionId: string) => {
    setActiveSessionId(sessionId);
  };

  const handleDeleteSession = (
    e: React.MouseEvent,
    sessionId: string
  ) => {
    e.stopPropagation();
    deleteSession.mutate({ sessionId });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const handleSuggestedPrompt = (prompt: string) => {
    sendMessage(prompt);
  };

  // -------------------------------------------------------------------
  // Loading state
  // -------------------------------------------------------------------

  if (apiKeyQuery.isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // -------------------------------------------------------------------
  // No API key state
  // -------------------------------------------------------------------

  if (apiKeyQuery.data && !apiKeyQuery.data.hasKey) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="mx-auto max-w-md text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
            <Bot className="h-8 w-8 text-muted-foreground" />
          </div>
          <h2 className="mb-2 text-xl font-bold">{t("title")}</h2>
          <p className="mb-6 text-sm text-muted-foreground">
            {t("byokExplain")}
          </p>
          <Link href="/settings">
            <Button>
              <Settings className="me-2 h-4 w-4" />
              {t("goToSettings")}
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  const nextSemesterPrompt = t("promptNextSemester");

  // -------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------

  const SidebarToggleIcon = isRTL
    ? sidebarOpen
      ? ChevronRight
      : ChevronLeft
    : sidebarOpen
      ? ChevronLeft
      : ChevronRight;

  return (
    <div className="flex h-[calc(100dvh-8rem)] overflow-hidden md:h-[calc(100vh-4rem)]">
      {/* Sessions sidebar */}
      <div
        className={cn(
          "flex flex-col border-e border-border bg-muted/30 transition-all duration-300",
          sidebarOpen ? "w-72" : "w-0 overflow-hidden"
        )}
      >
        {/* Sidebar header */}
        <div className="flex items-center justify-between border-b border-border p-3">
          <h3 className="text-sm font-semibold text-foreground/70">
            {t("chatHistory")}
          </h3>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleNewChat}
            className="h-8 gap-1.5"
          >
            <Plus className="h-4 w-4" />
            <span className="text-xs">{t("newChat")}</span>
          </Button>
        </div>

        {/* Sessions list */}
        <ScrollArea className="flex-1">
          <div className="space-y-1 p-2">
            {sessionsQuery.data?.length === 0 && (
              <p className="px-3 py-8 text-center text-xs text-muted-foreground">
                {t("noChatHistory")}
              </p>
            )}
            {sessionsQuery.data?.map((session) => (
              <div key={session.id} className="group relative">
                <button
                  type="button"
                  onClick={() => handleSelectSession(session.id)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-start text-sm transition-colors",
                    activeSessionId === session.id
                      ? "bg-foreground/10 text-foreground"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                >
                  <MessageSquare className="h-4 w-4 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm">
                      {session.title ?? t("newChat")}
                    </p>
                    <p className="text-xs text-muted-foreground/70">
                      {t("messageCount", { count: session.messageCount })}
                    </p>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={(e) => handleDeleteSession(e, session.id)}
                  aria-label={t("deleteChat")}
                  title={t("deleteChat")}
                  className="absolute end-2 top-1/2 -translate-y-1/2 shrink-0 rounded p-1 opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        </ScrollArea>
      </div>

      {/* Main chat area */}
      <div className="flex flex-1 flex-col">
        {/* Top bar with sidebar toggle */}
        <div className="flex items-center gap-2 border-b border-border px-4 py-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="h-8 w-8"
          >
            <SidebarToggleIcon className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-2">
            <Bot className="h-5 w-5 text-muted-foreground" />
            <h2 className="font-display text-sm font-semibold">{t("title")}</h2>
          </div>
        </div>

        {/* Messages area */}
        <ScrollArea className="flex-1">
          <div
            className="mx-auto max-w-3xl px-4 py-6"
            aria-live="polite"
            aria-atomic="false"
          >
            {messages.length === 0 ? (
              /* Empty state — clean welcome */
              <div className="flex flex-col items-center justify-center py-20">
                <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-muted">
                  <Bot className="h-7 w-7 text-foreground/50" />
                </div>
                <h3 className="mb-1.5 font-display text-lg font-bold">{t("title")}</h3>
                <p className="mb-6 max-w-sm text-center text-sm text-muted-foreground leading-relaxed">
                  {t("welcomeDescription")}
                </p>
                <button
                  onClick={() => handleSuggestedPrompt(nextSemesterPrompt)}
                  className="rounded-lg border border-border bg-card px-5 py-2.5 text-sm text-muted-foreground transition-colors hover:border-foreground/20 hover:text-foreground"
                >
                  {nextSemesterPrompt}
                </button>
              </div>
            ) : (
              /* Message bubbles */
              <div className="space-y-6">
                {messages.map((msg, i) => (
                  <div
                    key={i}
                    className={cn(
                      "flex gap-3",
                      msg.role === "user" ? "justify-end" : "justify-start"
                    )}
                  >
                    {msg.role === "assistant" && (
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted">
                        <Bot className="h-4 w-4 text-foreground/60" />
                      </div>
                    )}
                    <div
                      className={cn(
                        "max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed",
                        msg.role === "user"
                          ? "bg-foreground text-background"
                          : "bg-muted"
                      )}
                    >
                      {msg.role === "assistant" ? (
                        <div className="prose prose-sm dark:prose-invert max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
                          {msg.content ? (
                            <Markdown>{msg.content}</Markdown>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              {t("thinking")}
                            </span>
                          )}
                        </div>
                      ) : (
                        <p className="whitespace-pre-wrap">{msg.content}</p>
                      )}
                    </div>
                    {msg.role === "user" && (
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-foreground/10">
                        <User className="h-4 w-4" />
                      </div>
                    )}
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>
        </ScrollArea>

        {/* Input area */}
        <div className="border-t border-border bg-background p-4">
          <div className="mx-auto flex max-w-3xl items-end gap-2">
            <div className="relative flex-1">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={t("placeholder")}
                aria-label={t("placeholder")}
                disabled={isStreaming || !apiKeyQuery.data?.hasKey}
                rows={1}
                className={cn(
                  "w-full resize-none rounded-xl border border-border bg-muted/50 px-4 py-3 text-sm outline-none transition-colors",
                  "placeholder:text-muted-foreground/50",
                  "focus:border-foreground/20 focus:bg-background",
                  "disabled:opacity-50"
                )}
                style={{ maxHeight: "120px" }}
                onInput={(e) => {
                  const target = e.target as HTMLTextAreaElement;
                  target.style.height = "auto";
                  target.style.height = `${Math.min(target.scrollHeight, 120)}px`;
                }}
              />
            </div>
            <Button
              onClick={() => sendMessage(input)}
              disabled={!input.trim() || isStreaming}
              size="icon"
              aria-label={t("send")}
              className="h-11 w-11 shrink-0 rounded-xl"
            >
              {isStreaming ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
