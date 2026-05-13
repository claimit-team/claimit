/** Activity feed mocked from v0 batch-5 notifications. */

export type NotificationEventType = "claim" | "purchase" | "system" | "assistant";

export interface NotificationEvent {
  id: string;
  eventType: NotificationEventType;
  title: string;
  description: string;
  timeLabel: string;
}

export interface NotificationGroup {
  label: string;
  events: NotificationEvent[];
}

export const mockNotifications: {
  groups: NotificationGroup[];
} = {
  groups: [
    {
      label: "Today",
      events: [
        {
          id: "evt_today_1",
          eventType: "claim",
          title: "Draft ready — Best Buy",
          description: "Sony WH-1000XM5 price protection script is awaiting your review.",
          timeLabel: "9:14 AM",
        },
        {
          id: "evt_today_2",
          eventType: "purchase",
          title: "Window ending soon — Delta Air Lines",
          description: "NYC → LAX fare drop eligibility closes in three days.",
          timeLabel: "8:06 AM",
        },
        {
          id: "evt_today_3",
          eventType: "assistant",
          title: "Assistant summarized Hilton policy",
          description: '"Best rate guarantee" window and required evidence were explained.',
          timeLabel: "Yesterday · 11:42 PM",
        },
      ],
    },
    {
      label: "Yesterday",
      events: [
        {
          id: "evt_yest_1",
          eventType: "purchase",
          title: "Receipt ingested via Gmail",
          description: "Target kitchen mixer added to monitored purchases.",
          timeLabel: "4:51 PM",
        },
        {
          id: "evt_yest_2",
          eventType: "system",
          title: "Weekly digest sent",
          description: "3 claims in motion, 1 purchase needs confirmation.",
          timeLabel: "8:02 AM",
        },
      ],
    },
    {
      label: "Earlier",
      events: [
        {
          id: "evt_old_1",
          eventType: "claim",
          title: "Claim approved — United Airlines",
          description: "$42 travel credit acknowledged on itinerary change dispute.",
          timeLabel: "May 3",
        },
        {
          id: "evt_old_2",
          eventType: "purchase",
          title: "New monitor detected — Marriott",
          description: "San Diego Waterfront stay added; claim window tracked automatically.",
          timeLabel: "Apr 29",
        },
      ],
    },
  ],
};
