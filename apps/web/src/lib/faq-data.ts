import { CheckCircle, CreditCard, FileText, Globe, Lock, Mail, Rocket } from "lucide-react";

export const faqTopics = [
  {
    id: "getting-started",
    title: "Getting started",
    description: "Learn the basics of ClaimIt",
    icon: Rocket,
  },
  {
    id: "gmail-connection",
    title: "Gmail connection",
    description: "How Gmail integration works",
    icon: Mail,
  },
  {
    id: "claim-workflow",
    title: "How claims work",
    description: "Understand claim types and materials",
    icon: FileText,
  },
  {
    id: "claim-outcomes",
    title: "Claim outcomes",
    description: "Track and report your results",
    icon: CheckCircle,
  },
  {
    id: "billing",
    title: "Billing",
    description: "Plans, pricing, and trials",
    icon: CreditCard,
  },
  {
    id: "privacy-security",
    title: "Privacy and security",
    description: "How we protect your data",
    icon: Lock,
  },
  {
    id: "supported-platforms",
    title: "Supported platforms",
    description: "Retailers and currencies",
    icon: Globe,
  },
];

export interface FaqQuestion {
  question: string;
  answer: string;
}

export interface FaqCategory {
  id: string;
  title: string;
  questions: FaqQuestion[];
}

export const faqData: FaqCategory[] = [
  {
    id: "getting-started",
    title: "Getting started",
    questions: [
      {
        question: "What does ClaimIt do?",
        answer:
          "ClaimIt monitors supported post-purchase price protection windows and prepares claim materials when an eligible price drop is detected. We help you identify opportunities to request refunds based on retailer policies, but we do not guarantee that claims will be approved.",
      },
      {
        question: "Do I need to connect Gmail?",
        answer:
          "No, connecting Gmail is optional. You can upload receipts manually as PDF or image files. However, connecting Gmail helps automate purchase ingestion by detecting order confirmation emails automatically.",
      },
      {
        question: "Can I upload receipts manually?",
        answer:
          "Yes. ClaimIt supports uploading receipts as PDF or image files. Simply navigate to your dashboard and use the upload feature to add purchase documentation.",
      },
      {
        question: "What happens after I add a purchase?",
        answer:
          "After you add a purchase, ClaimIt extracts key details like the purchase date, price, and retailer. If the extraction confidence is low, you may be asked to confirm or correct certain fields. ClaimIt then monitors the item for eligible price drops during the protection window.",
      },
    ],
  },
  {
    id: "gmail-connection",
    title: "Gmail connection",
    questions: [
      {
        question: "Why does ClaimIt ask for Gmail access?",
        answer:
          "Gmail access helps ClaimIt automatically detect purchase confirmations from your inbox, making it easier to track eligible purchases. If you authorize it, ClaimIt can also send email-based claims on your behalf.",
      },
      {
        question: "What Gmail scopes are used?",
        answer:
          "ClaimIt uses Gmail readonly access to scan for order confirmations and Gmail send access (if you opt in) to submit email-based claims. For detailed technical information, visit our Security page.",
      },
      {
        question: "Can ClaimIt send claims from my Gmail?",
        answer:
          "Only if you explicitly opt in. By default, ClaimIt operates in approval-gated mode, meaning you review and approve each claim before any action is taken. Auto-send for eligible email claims is an optional feature you can enable.",
      },
      {
        question: "Can I disconnect Gmail?",
        answer:
          "Yes. You can manage your Gmail connection at any time by visiting Settings > Gmail after logging in. Disconnecting will stop automatic purchase detection and email claim submission.",
      },
    ],
  },
  {
    id: "claim-workflow",
    title: "How claims work",
    questions: [
      {
        question: "What claim material can ClaimIt generate?",
        answer:
          "ClaimIt can generate several types of claim materials: email drafts for retailers with email-based claim processes, chat scripts for live chat support, in-store guides for physical returns, and self-service walkthroughs for retailer portals.",
      },
      {
        question: "Can ClaimIt submit claims automatically?",
        answer:
          "Auto-send applies only to eligible email claims when you explicitly opt in. Chat scripts, in-store guides, and self-service walkthroughs require you to take action manually using the materials ClaimIt provides.",
      },
      {
        question: "Why are there different claim types?",
        answer:
          "Different retailers have different claim processes. Some accept claims via email, others require live chat, phone calls, or visits to a physical store. ClaimIt prepares the appropriate materials based on each retailer's policies.",
      },
      {
        question: 'What does "approval-gated" mean?',
        answer:
          "Approval-gated is the default mode in ClaimIt. It means you must review and approve each claim before ClaimIt takes any action. This gives you full control over what communications are sent on your behalf.",
      },
    ],
  },
  {
    id: "claim-outcomes",
    title: "Claim outcomes",
    questions: [
      {
        question: "How does ClaimIt know if a claim was approved?",
        answer:
          "Most claim outcomes are user-reported because many claims resolve through external channels like email replies, store visits, phone calls, or retailer chat. ClaimIt does not automatically verify whether a claim was approved or denied.",
      },
      {
        question: "Why do I need to mark an outcome?",
        answer:
          "Marking outcomes helps you track your reclaimed savings and provides a complete history of your claims. Your total reclaimed money is calculated based on the outcomes you report as approved.",
      },
      {
        question: "What outcomes can I mark?",
        answer:
          "You can mark a claim as Approved (you received a refund), Denied (the retailer rejected the claim), or Still waiting/No response (the claim is pending or you haven't heard back).",
      },
    ],
  },
  {
    id: "billing",
    title: "Billing",
    questions: [
      {
        question: "Is there a free plan?",
        answer:
          "Yes. The Free plan is permanent and includes up to 3 active monitors with price drop alerts. Free users receive alerts but don't get full claim preparation features.",
      },
      {
        question: "What does Pro include?",
        answer:
          "Pro costs $4.99/month or $49/year and includes unlimited monitors, full claim material generation, Gmail integration, auto-send for email claims (optional), and priority support.",
      },
      {
        question: "How does the 30-day trial work?",
        answer:
          "New users can try Pro or Family features free for 30 days. During the trial, you have access to all paid features. You can cancel anytime before the trial ends without being charged.",
      },
      {
        question: "What is the Family plan?",
        answer:
          "The Family plan costs $9.99/month or $99/year and includes everything in Pro for up to 5 users. Each user gets their own account with separate purchase tracking and claim management.",
      },
    ],
  },
  {
    id: "privacy-security",
    title: "Privacy and security",
    questions: [
      {
        question: "Does ClaimIt sell my data?",
        answer:
          "No. ClaimIt does not sell your personal data or purchase history to third parties. Your data is used solely to provide ClaimIt services. For full details, please review our Privacy Policy.",
      },
    ],
  },
  {
    id: "supported-platforms",
    title: "Supported platforms",
    questions: [
      {
        question: "What platforms are supported?",
        answer:
          "ClaimIt supports price protection policies from major retailers, airlines, and hotels. The specific retailers and policies supported are detailed in your dashboard once you sign up.",
      },
      {
        question: "What currencies does ClaimIt support?",
        answer:
          "ClaimIt currently supports purchases priced in USD (United States Dollars). International currency support may be added in future updates.",
      },
      {
        question: "Does ClaimIt handle tax or coupons?",
        answer:
          "No. ClaimIt focuses on price protection claims and does not handle tax refunds, coupon stacking, cashback programs, or loyalty rewards.",
      },
    ],
  },
];
