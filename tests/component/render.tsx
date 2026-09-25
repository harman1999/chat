import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, type RenderOptions } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useMessageStore } from "@/store";
import type { Message, User } from "@/types";

/**
 * Renders a component with the providers it expects, and seeds the query cache
 * directly so tests state who the viewer is instead of mocking the network.
 */
export function renderWithProviders(
  ui: ReactElement,
  options: RenderOptions & { currentUser?: User; users?: User[] } = {},
) {
  const { currentUser, users, ...renderOptions } = options;

  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });

  if (currentUser) queryClient.setQueryData(["current-user"], currentUser);
  if (users) queryClient.setQueryData(["users"], users);

  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>{children}</TooltipProvider>
      </QueryClientProvider>
    );
  }

  return { queryClient, ...render(ui, { wrapper: Wrapper, ...renderOptions }) };
}

let counter = 0;

export function makeUser(overrides: Partial<User> = {}): User {
  counter += 1;
  return {
    id: `u_test_${counter}`,
    username: `user${counter}`,
    displayName: `Test User ${counter}`,
    fullName: `Test User ${counter}`,
    email: `user${counter}@example.com`,
    title: "Engineer",
    department: "Platform",
    timezone: "UTC",
    avatarUrl: null,
    avatarColor: 0,
    presence: "online",
    customStatus: null,
    role: "member",
    isBot: false,
    lastActiveAt: new Date().toISOString(),
    ...overrides,
  };
}

export function makeMessage(overrides: Partial<Message> = {}): Message {
  counter += 1;
  return {
    id: `m_test_${counter}`,
    channelId: "ch_test",
    authorId: "u_test_1",
    kind: "text",
    body: "Hello from a test",
    createdAt: new Date().toISOString(),
    editedAt: null,
    deletedAt: null,
    reactions: [],
    attachments: [],
    mentionedUserIds: [],
    threadRootId: null,
    replyCount: 0,
    replyParticipantIds: [],
    lastReplyAt: null,
    isPinned: false,
    isSaved: false,
    deliveryState: "sent",
    ...overrides,
  };
}

/** The message store is module-level; tests must not leak state into each other. */
export function resetMessageStore() {
  useMessageStore.setState({
    byId: {},
    idsByChannel: {},
    cursorByChannel: {},
    hasMoreByChannel: {},
    draftByChannel: {},
    typingByChannel: {},
    idsByThread: {},
    threadMetaByRootId: {},
  });
}
