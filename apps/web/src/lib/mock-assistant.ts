export type AssistantMessageRole = "user" | "assistant";

export interface AssistantMessage {
  id: string;
  role: AssistantMessageRole;
  content: string;
  toolSummary?: string;
}

export type ConversationGroupBucket = "Today" | "Yesterday" | "Last 7 days" | "Older";

export interface AssistantConversation {
  id: string;
  group: ConversationGroupBucket;
  title: string;
  preview: string;
  timestamp: string;
  messages: AssistantMessage[];
}

export const mockConversations: AssistantConversation[] = [
  {
    id: "conv_001",
    group: "Today",
    title: "Best Buy price match window",
    preview: "What evidence do I need for the XM5?",
    timestamp: "9:58 AM",
    messages: [
      {
        id: "conv_001_m1",
        role: "user",
        content:
          "I bought XM5 headphones last week — what evidence should I attach for a Best Buy price match?",
      },
      {
        id: "conv_001_m2",
        role: "assistant",
        toolSummary: "Referenced internal policy excerpts for Electronics price match",
        content:
          "Upload the competitor listing URL, a screenshot with date visible, your original receipt SKU, and the lower price SKU if it differs. Best Buy accepts chat scripts we draft once those four line up.",
      },
      {
        id: "conv_001_m3",
        role: "user",
        content: "Can they deny if the SKU is technically different?",
      },
      {
        id: "conv_001_m4",
        role: "assistant",
        content:
          "They can deny if SKUs materially differ — same model family matters. Highlight if it is the identical color + model code to reduce disputes.",
      },
    ],
  },
  {
    id: "conv_002",
    group: "Today",
    title: "Hilton BRG nuances",
    preview: "What counts as comparable rate?",
    timestamp: "Yesterday · 4:41 PM",
    messages: [
      {
        id: "conv_002_m1",
        role: "user",
        content: "Hilton Waikiki stay — BRG wording confuses me. What qualifies as comparable?",
      },
      {
        id: "conv_002_m2",
        role: "assistant",
        toolSummary: "Compared BRG FAQs + region-specific exclusions",
        content:
          "The rate must be public, prepaid, identical room type, refundable terms matching, **and** denominated correctly. Taxes included must match Hilton's nightly breakdown.",
      },
    ],
  },
  {
    id: "conv_003",
    group: "Yesterday",
    title: "Delta schedule change playbook",
    preview: "We got bumped to a later flight.",
    timestamp: "Tue · 6:07 PM",
    messages: [
      {
        id: "conv_003_m1",
        role: "user",
        content: "Our Delta flight slid 90 minutes late — automated email says waiver possible?",
      },
      {
        id: "conv_003_m2",
        role: "assistant",
        toolSummary: "Interpreted waiver notice + ticketing rules excerpt",
        content:
          "If the change exceeds 120 minutes scheduled vs original, DOT-style courtesy credits often unlock. Mention the waiver code from the itinerary email and cite the original confirmation number.",
      },
    ],
  },
  {
    id: "conv_004",
    group: "Last 7 days",
    title: "Amazon chat tone check",
    preview: "Can you soften opener paragraph two?",
    timestamp: "May 12",
    messages: [
      {
        id: "conv_004_m1",
        role: "assistant",
        content:
          "Here is a tightened opener stressing policy compliance without sounding adversarial:",
      },
      {
        id: "conv_004_m2",
        role: "user",
        content: "Please soften paragraph two.",
      },
      {
        id: "conv_004_m3",
        role: "assistant",
        content:
          'Swapped punitive phrasing like "violates advertised policy" for "looks inconsistent with advertised coverage — can you escalate to a supervisor for review?"',
      },
    ],
  },
];

export const mockExamplePrompts: string[] = [
  "Summarize Hilton best-rate rules for Waikiki prepaid stays.",
  "What screenshots should I upload for Southwest refund chat?",
  "Rewrite Delta schedule-change email politely but firmly.",
];

export const ASSISTANT_GROUP_ORDER: ConversationGroupBucket[] = [
  "Today",
  "Yesterday",
  "Last 7 days",
  "Older",
];
