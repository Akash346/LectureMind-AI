"use client";

import * as React from "react";
import {
  Group as PanelGroup,
  Panel,
  Separator as PanelResizeHandle,
  useDefaultLayout
} from "react-resizable-panels";
import { AnimatePresence, motion } from "motion/react";

import { ArtifactDock } from "./ArtifactDock";
import { ChatRail } from "./ChatRail";
import { VideoPanel } from "./VideoPanel";
import { WorkspaceHeader } from "./WorkspaceHeader";

type WorkspaceChat = {
  id: string;
  title: string;
  videoUrl?: string;
  thumbnailUrl?: string;
  createdAt?: string;
};

type WorkspaceShellProps = {
  activeChat: WorkspaceChat;
  chats: WorkspaceChat[];
  isDemo?: boolean;
};

export function WorkspaceShell({
  activeChat,
  chats,
  isDemo = false
}: WorkspaceShellProps) {
  const [rightOpen] = React.useState(true);
  const workspaceLayout = useDefaultLayout({
    id: "workspace-layout",
    panelIds: ["left", "center", "right"]
  });

  return (
    <main className="flex h-screen flex-col overflow-hidden bg-lm-paper text-lm-ink dark:bg-lm-ink dark:text-lm-paper">
      <WorkspaceHeader title={activeChat.title} isDemo={isDemo} />
      <PanelGroup
        id="workspace-layout"
        data-auto-save-id="workspace-layout"
        defaultLayout={workspaceLayout.defaultLayout}
        onLayoutChanged={workspaceLayout.onLayoutChanged}
        orientation="horizontal"
      >
        <Panel id="left" defaultSize="18%" minSize="5%" maxSize="28%">
          <ChatRail
            activeChatId={activeChat.id}
            chats={chats}
            collapsed={false}
            isDemo={isDemo}
          />
        </Panel>
        <ResizeHandle />
        <Panel id="center" minSize="40%">
          <PanelGroup orientation="vertical">
            <Panel id="video" defaultSize="48%" minSize="28%">
              <section className="h-full overflow-y-auto p-4">
                <VideoPanel videoUrl={activeChat.videoUrl} />
              </section>
            </Panel>
            <ResizeHandle direction="vertical" />
            <Panel id="chat" minSize="24%">
              <section className="flex h-full items-center justify-center overflow-y-auto border-t border-black/10 p-6 text-sm text-black/55 dark:border-white/10 dark:text-white/55">
                Chat coming next phase
              </section>
            </Panel>
          </PanelGroup>
        </Panel>
        <ResizeHandle />
        <Panel
          id="right"
          collapsible
          collapsedSize="0%"
          defaultSize="18%"
          minSize="4%"
          maxSize="28%"
        >
          <aside className="flex h-full min-h-0">
            <AnimatePresence initial={false}>
              {rightOpen ? (
                <motion.section
                  key="artifact-panel"
                  className="flex min-w-0 flex-1 items-center justify-center overflow-y-auto p-4 text-center text-sm text-black/55 dark:text-white/55"
                  initial={{ opacity: 0, x: 12 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 12 }}
                  transition={{
                    type: "spring",
                    stiffness: 300,
                    damping: 30
                  }}
                >
                  Artifact panel coming next phase
                </motion.section>
              ) : null}
            </AnimatePresence>
            <ArtifactDock />
          </aside>
        </Panel>
      </PanelGroup>
    </main>
  );
}

function ResizeHandle({ direction = "horizontal" }: { direction?: "horizontal" | "vertical" }) {
  if (direction === "vertical") {
    return (
      <PanelResizeHandle className="h-1 bg-black/10 transition hover:bg-lm-indigo/40 dark:bg-white/10" />
    );
  }

  return (
    <PanelResizeHandle className="w-1 bg-black/10 transition hover:bg-lm-indigo/40 dark:bg-white/10" />
  );
}
