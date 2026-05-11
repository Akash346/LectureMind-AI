"use client";

import Image from "next/image";
import Link from "next/link";
import { Plus } from "lucide-react";

import { formatRelativeTime } from "@/lib/utils/time";

export type RailChat = {
  id: string;
  title: string;
  thumbnailUrl?: string;
  createdAt?: string;
};

type ChatRailProps = {
  chats: RailChat[];
  activeChatId: string;
  collapsed?: boolean;
  isDemo?: boolean;
};

export function ChatRail({
  chats,
  activeChatId,
  collapsed = false,
  isDemo = false
}: ChatRailProps) {
  return (
    <aside className="flex h-full min-h-0 flex-col border-r border-black/10 bg-black/[0.02] dark:border-white/10 dark:bg-white/[0.03]">
      <div className="flex h-14 shrink-0 items-center justify-between px-3">
        {!collapsed ? (
          <h2 className="font-space-grotesk text-sm font-semibold">
            Your chats
          </h2>
        ) : null}
        <button
          aria-label="New Chat"
          className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-black/10 bg-lm-paper text-lm-ink transition hover:border-lm-indigo dark:border-white/10 dark:bg-lm-ink dark:text-lm-paper"
          type="button"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        <div className="space-y-2">
          {chats.map((chat) => {
            const active = chat.id === activeChatId;

            return (
              <Link
                key={chat.id}
                href={`/chats/${chat.id}${isDemo ? "?demo=1" : ""}`}
                className={
                  active
                    ? "flex items-center gap-3 rounded-md border border-lm-indigo bg-lm-indigo/10 p-2"
                    : "flex items-center gap-3 rounded-md border border-transparent p-2 hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"
                }
              >
                <Thumbnail chat={chat} collapsed={collapsed} />
                {!collapsed ? (
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">
                      {chat.title || "Untitled Chat"}
                    </span>
                    <span className="mt-1 block text-xs text-black/50 dark:text-white/50">
                      {formatRelativeTime(chat.createdAt)}
                    </span>
                  </span>
                ) : null}
              </Link>
            );
          })}
        </div>
      </div>
    </aside>
  );
}

function Thumbnail({
  chat,
  collapsed
}: {
  chat: RailChat;
  collapsed: boolean;
}) {
  const sizeClass = collapsed ? "h-10 w-10" : "h-12 w-16";

  if (!chat.thumbnailUrl) {
    return (
      <span
        className={`${sizeClass} shrink-0 rounded-md bg-[linear-gradient(135deg,rgba(61,59,217,0.2),rgba(245,181,68,0.2))]`}
      />
    );
  }

  return (
    <span className={`${sizeClass} relative shrink-0 overflow-hidden rounded-md`}>
      <Image
        alt={chat.title || "Chat thumbnail"}
        className="object-cover"
        fill
        sizes="64px"
        src={chat.thumbnailUrl}
      />
    </span>
  );
}
