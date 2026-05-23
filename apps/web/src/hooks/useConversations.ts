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
  deleteConversation as deleteConversationApi,
  listConversations,
  updateConversation,
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
  renameConversation: (id: string, title: string) => Promise<void>;
  archiveConversation: (id: string) => Promise<void>;
  deleteConversation: (id: string) => Promise<void>;
  refetch: () => void;
};

function toApiError(err: unknown): ConversationsApiError {
  if (err instanceof ConversationsApiError) return err;
  return new ConversationsApiError(
    "unknown_error",
    err instanceof Error ? err.message : "Unknown error",
  );
}

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
        setError(toApiError(err));
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
      // Prepend so the new conversation lands at the top of the list.
      setConversations((prev) => [created, ...prev]);
      setCurrentId(created._id);
      return created;
    },
    [],
  );

  const renameConversation = useCallback(
    async (id: string, title: string): Promise<void> => {
      setConversations((prev) => prev.map((c) => (c._id === id ? { ...c, title } : c)));
      try {
        await updateConversation(id, { title });
        refetch();
      } catch (err) {
        refetch();
        setError(toApiError(err));
        throw err;
      }
    },
    [refetch],
  );

  const archiveConversation = useCallback(
    async (id: string): Promise<void> => {
      setConversations((prev) => prev.filter((c) => c._id !== id));
      try {
        await updateConversation(id, { status: "archived" });
        refetch();
      } catch (err) {
        refetch();
        setError(toApiError(err));
        throw err;
      }
    },
    [refetch],
  );

  const deleteConversation = useCallback(
    async (id: string): Promise<void> => {
      setConversations((prev) => prev.filter((c) => c._id !== id));
      try {
        await deleteConversationApi(id);
        refetch();
      } catch (err) {
        refetch();
        setError(toApiError(err));
        throw err;
      }
    },
    [refetch],
  );

  const currentConversation =
    currentId === null ? null : (conversations.find((c) => c._id === currentId) ?? null);

  return {
    conversations,
    currentConversation,
    currentId,
    isLoading,
    error,
    selectConversation,
    createConversation,
    renameConversation,
    archiveConversation,
    deleteConversation,
    refetch,
  };
}
