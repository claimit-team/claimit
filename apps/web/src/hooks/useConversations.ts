/**
 * useConversations — list / create / select for the Assistant feature.
 *
 * Mirrors useNotifications:
 * - Wait for AuthInit (useAuthStore.isLoading === false).
 * - mounted-flag guards against state updates after unmount.
 * - Errors surfaced as ConversationsApiError; callers render them.
 *
 * Returns a `currentConversation` derived from `currentId` so consumers
 * (AssistantContent, FloatingAssistant) don't each re-implement lookup.
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  ConversationsApiError,
  createConversation as createApi,
  listConversations,
} from "@/lib/api/conversations";
import { useAuthStore } from "@/store";
import type { Conversation, ConversationMode } from "@/types/assistant";

type UseConversationsArgs = {
  /** Optional filter — only list conversations in this mode. */
  mode?: ConversationMode;
};

type UseConversationsResult = {
  conversations: Conversation[];
  currentConversation: Conversation | null;
  currentId: string | null;
  isLoading: boolean;
  error: ConversationsApiError | null;
  selectConversation: (id: string | null) => void;
  createConversation: (mode: ConversationMode, claimId?: string) => Promise<Conversation>;
  refetch: () => void;
};

export function useConversations({ mode }: UseConversationsArgs = {}): UseConversationsResult {
  const userId = useAuthStore((state) => state.user?._id ?? null);
  const isAuthLoading = useAuthStore((state) => state.isLoading);

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<ConversationsApiError | null>(null);
  const [reloadTick, setReloadTick] = useState(0);

  const refetch = useCallback(() => setReloadTick((t) => t + 1), []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: reloadTick triggers the refetch by design
  useEffect(() => {
    if (isAuthLoading) {
      setIsLoading(true);
      return;
    }
    if (!userId) {
      setConversations([]);
      setError(new ConversationsApiError("unauthenticated", "User must be signed in."));
      setIsLoading(false);
      return;
    }

    let mounted = true;
    setIsLoading(true);
    setError(null);

    listConversations({ mode })
      .then((page) => {
        if (!mounted) return;
        setConversations(page.conversations);
        setError(null);
      })
      .catch((err: unknown) => {
        if (!mounted) return;
        if (err instanceof ConversationsApiError) {
          setError(err);
        } else {
          setError(
            new ConversationsApiError(
              "unknown_error",
              err instanceof Error ? err.message : "Unknown error",
            ),
          );
        }
      })
      .finally(() => {
        if (!mounted) return;
        setIsLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [userId, isAuthLoading, mode, reloadTick]);

  // Source-of-truth ref for the latest list — used by selectConversation
  // so we don't trip useCallback's dependency invariants on every change.
  const conversationsRef = useRef(conversations);
  useEffect(() => {
    conversationsRef.current = conversations;
  }, [conversations]);

  const selectConversation = useCallback((id: string | null) => {
    setCurrentId(id);
  }, []);

  const createConversation = useCallback(
    async (modeArg: ConversationMode, claimId?: string): Promise<Conversation> => {
      const created = await createApi({ mode: modeArg, claim_id: claimId });
      // Note: Conversation.id (not _id) — see the comment on the type
      // definition in types/assistant.ts for the rationale.
      // Prepend so the new conversation lands at the top of the list.
      setConversations((prev) => [created, ...prev]);
      setCurrentId(created.id);
      return created;
    },
    [],
  );

  const currentConversation =
    currentId === null ? null : (conversations.find((c) => c.id === currentId) ?? null);

  return {
    conversations,
    currentConversation,
    currentId,
    isLoading,
    error,
    selectConversation,
    createConversation,
    refetch,
  };
}
