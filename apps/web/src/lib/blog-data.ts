// apps/web/src/lib/blog-data.ts

export type BlogBlock =
  | { type: "paragraph"; text: string }
  | { type: "heading"; level: 2 | 3; text: string }
  | { type: "list"; ordered?: boolean; items: string[] }
  | { type: "quote"; text: string; cite?: string }
  | { type: "image"; src: string; alt: string; caption?: string }
  | { type: "callout"; tone: "info" | "warning"; text: string };

export type BlogAuthor = {
  name: string;
  role: string;
  avatar?: string;
};

export type BlogPost = {
  category: "Product" | "Engineering" | "Security" | "Company";
  slug: string;
  title: string;
  excerpt: string;
  date: string; // ISO YYYY-MM-DD
  readTime: string;
  coverImage: string;
  body: BlogBlock[];
  author: BlogAuthor;
};

export const categories = ["All", "Product", "Engineering", "Security", "Company"] as const;

export type Category = (typeof categories)[number];

export const featuredPost: BlogPost = {
  category: "Product",
  slug: "meet-claimit",
  title:
    "Meet ClaimIt: the AI agent that watches every purchase and files price-protection claims for you",
  excerpt:
    "Most major retailers and airlines refund you when prices drop after purchase, but only if you ask. ClaimIt does the asking, automatically, across 26 platforms.",
  date: "2026-06-01",
  readTime: "4 min read",
  coverImage: "/blog/meet-claimit.jpg",
  author: {
    name: "Erdun",
    role: "Co-founder",
    avatar: "/team/erdun.png",
  },
  body: [
    {
      type: "paragraph",
      text: "When you buy a TV at Best Buy on a Tuesday and the price drops $80 on Friday, you can ask Best Buy to refund the difference. This is called price protection, and it's been a standing policy at most major US retailers, hotel chains, and airlines for years.",
    },
    {
      type: "paragraph",
      text: "Almost nobody uses it. The friction is the policy: you have to know the policy exists, remember what you paid, notice the price change inside the protection window, then write to customer service. By the time you'd be done with one claim, you'd have spent more in time than you'd recover.",
    },
    {
      type: "paragraph",
      text: "ClaimIt is an AI agent that does all of that for you.",
    },
    { type: "heading", level: 2, text: "How it works" },
    {
      type: "paragraph",
      text: "You connect your Gmail once with read-only OAuth. ClaimIt watches for purchase confirmations from 26 supported platforms across major retailers (Best Buy, Amazon, Target, Walmart, Costco, Home Depot, Lowe's, and more), hotel chains (Marriott, Hilton, Hyatt, IHG, Wyndham), and airlines (Delta, United, American, Southwest, JetBlue, Alaska). When a price drops inside the protection window, the agent drafts a claim and surfaces it for your approval.",
    },
    {
      type: "list",
      ordered: true,
      items: [
        "Connect Gmail (read-only). ClaimIt sees purchase confirmations and nothing else.",
        "The agent identifies eligible purchases and starts tracking prices in the background.",
        "When a refund is available, you get a one-tap approve flow. ClaimIt files via email, chat, or in-store guide depending on what the retailer requires.",
      ],
    },
    { type: "heading", level: 2, text: "Why an agent, not a chatbot" },
    {
      type: "paragraph",
      text: "Price protection isn't a conversation. It's a workflow with a clear goal (file a valid claim that gets approved) and a long tail of inputs: receipt formats, retailer-specific forms, time windows, eligibility rules. A chatbot would ask you to do that work. An agent does the work and reports back.",
    },
    {
      type: "paragraph",
      text: "Behind the scenes, four sub-agents on Google Cloud's Agent Engine handle different stages: purchase identification, price monitoring, claim drafting, and outcome handling. We wrote about [the architecture](/blog/four-agent-architecture) separately if you're curious.",
    },
    {
      type: "callout",
      tone: "info",
      text: "Today ClaimIt covers 26 platforms across retail, hotels, and airlines. If your most-shopped retailer isn't on the list, tell us. We add platforms based on user demand.",
    },
    { type: "heading", level: 2, text: "What it's not" },
    {
      type: "paragraph",
      text: "ClaimIt doesn't store your passwords. It doesn't sell your purchase data. It doesn't browse the web in your name. And when a claim is unlikely to succeed, the agent tells you that instead of filing it.",
    },
    {
      type: "paragraph",
      text: "We built ClaimIt because the existing services ([Paribus](/blog/what-happened-to-paribus), Earny, Capital One Shopping) either shut down or quietly stopped doing the hard part of automated claim filing. Price protection still exists as a consumer right; the tooling to actually use it just doesn't, anymore. We're rebuilding it.",
    },
  ],
};

export const blogPosts: BlogPost[] = [
  {
    category: "Company",
    slug: "price-protection-billions-left-on-table",
    title:
      "The hundreds of millions in price-protection refunds Americans leave on the table every year",
    excerpt:
      "Most major retailers will refund you when prices drop after you buy. Almost nobody collects. Here's why, and why we think that's about to change.",
    date: "2026-05-26",
    readTime: "4 min read",
    coverImage: "/blog/price-protection-billions.jpg",
    author: { name: "Erdun", role: "Co-founder", avatar: "/team/erdun.png" },
    body: [
      {
        type: "paragraph",
        text: "If you bought a refrigerator at Lowe's last month and the price has dropped since, Lowe's owes you the difference. So does Best Buy, Target, Walmart, Costco, Home Depot, Staples, JCPenney, Macy's, and roughly every other retailer of meaningful size in the United States. Most hotel chains have a Best Rate Guarantee that works similarly. So do every major airline.",
      },
      { type: "paragraph", text: "Almost nobody collects." },
      { type: "heading", level: 2, text: "How the policy actually works" },
      {
        type: "paragraph",
        text: "Price-protection policies have been around for decades. The terms vary: windows range from 7 days to 90 days, eligibility differs by category, some require in-store proof and some accept email forwards. But the structure is the same. You buy something, the price drops inside a window, you file with customer service, and the retailer refunds the difference.",
      },
      {
        type: "paragraph",
        text: "By most estimates, well under 5% of eligible price drops result in actual refund claims. The reasons are unremarkable: people don't know the policy exists, they don't track their own purchases, they don't notice price changes after the fact, and even if they do, filing a single claim takes 20-40 minutes of work for a refund that's often $20-60. The math discourages anyone from bothering once, let alone systematically.",
      },
      {
        type: "callout",
        tone: "info",
        text: "Rough back-of-the-envelope: if the average American household makes ~12 large purchases a year subject to price protection, and average eligible-but-unclaimed refunds run $15-40, the aggregate sits in the hundreds of millions of dollars annually. We're being conservative.",
      },
      { type: "heading", level: 2, text: "Why services like Paribus disappeared" },
      {
        type: "paragraph",
        text: "Paribus was the first widely-known service to automate this. They were acquired by Capital One in 2016 and rolled into Capital One Shopping, but the original automated-claim-filing capability quietly receded over time. Earny and a handful of others have come and gone. The space has been littered with services that automate the easy half (detecting price drops) without automating the hard half (actually filing claims that get approved).",
      },
      {
        type: "paragraph",
        text: "Filing claims is hard because every retailer is different. Best Buy uses an in-store guide flow. Marriott responds to a specific phrasing in an email. Some airlines refund automatically if you ask; others require a portal. Building a system that does all of this reliably, at scale, with high approval rates, is most of the work. It's exactly where price-protection services have historically failed.",
      },
      { type: "heading", level: 2, text: "What we're trying to do" },
      {
        type: "paragraph",
        text: "ClaimIt's bet is that LLM-based agents are now good enough at handling heterogeneous customer-service workflows that the hard half can finally be automated. Not perfectly. But well enough that you can connect your Gmail once and get refunds you would never have collected manually.",
      },
      {
        type: "paragraph",
        text: "We don't think the money was unclaimed because consumers didn't care. We think it was unclaimed because the cost of caring exceeded the reward. ClaimIt drops the cost.",
      },
    ],
  },
  {
    category: "Engineering",
    slug: "four-agent-architecture",
    title: "Behind the agent: how four sub-agents on GCP handle 26 retailer integrations",
    excerpt:
      "A monolithic agent looked great in demos and failed in production. Here's how we got to a four-agent pipeline that actually ships claims.",
    date: "2026-05-21",
    readTime: "5 min read",
    coverImage: "/blog/four-agent-architecture.jpg",
    author: {
      name: "The ClaimIt engineering team",
      role: "Engineering",
    },
    body: [
      {
        type: "paragraph",
        text: "Our first prototype was a single LLM agent with access to a Gmail tool, a price-fetch tool, and a draft-claim tool. It worked beautifully on the demo path (Best Buy purchase, price drop, draft an email, done), and started failing in subtle, expensive ways as soon as we added a second retailer.",
      },
      {
        type: "paragraph",
        text: "The failures had a pattern. The agent would correctly identify a purchase, then over-eagerly file a claim before checking whether the protection window had even opened. Or it would file an email when the retailer required a chat script. Or it would re-file an already-filed claim because state from the previous run hadn't been threaded through cleanly. Single-agent designs that look fine on the happy path crumble on edge cases because every responsibility is tangled with every other responsibility in a single prompt.",
      },
      { type: "heading", level: 2, text: "The four agents" },
      {
        type: "paragraph",
        text: "We split the work into four specialized sub-agents, each with its own prompt, its own tools, and its own success criteria.",
      },
      { type: "heading", level: 3, text: "1. Purchase agent" },
      {
        type: "paragraph",
        text: "Reads Gmail purchase confirmations and extracts structured purchase data: retailer, product, price, date, order ID, return-window estimate. It does one thing (turn email into structured records) and never decides whether a claim should be filed.",
      },
      { type: "heading", level: 3, text: "2. Price agent" },
      {
        type: "paragraph",
        text: 'Given a structured purchase, monitors the price across the relevant platform. It owns the question "has the price dropped enough to be worth filing?" and nothing else. Crucially, it doesn\'t know how to file. Only how to detect.',
      },
      { type: "heading", level: 3, text: "3. Claim agent" },
      {
        type: "paragraph",
        text: "Given a confirmed eligible drop, drafts the appropriate claim artifact: email body, chat script, in-store talking points, or a self-service portal walkthrough. Retailer-specific knowledge lives here. The claim agent never sends. It drafts.",
      },
      { type: "heading", level: 3, text: "4. Outcome agent" },
      {
        type: "paragraph",
        text: "Handles approved/denied/no-response outcomes after a claim has been filed. Routes denials to retry strategies (different framing, different channel) and aggregates outcomes back into the user's dashboard.",
      },
      { type: "heading", level: 2, text: "Why the separation matters" },
      {
        type: "paragraph",
        text: "Each agent has a smaller, sharper prompt. Each agent has clearer success criteria, which means we can evaluate them independently: purchase extraction accuracy, drop detection precision/recall, claim approval rate, outcome routing correctness. When the system fails, we can almost always isolate which agent failed, instead of staring at a 200-line monolithic prompt and guessing.",
      },
      {
        type: "paragraph",
        text: "We run all four on Google Cloud's Agent Engine. Inter-agent state is passed as structured JSON through a shared state graph, not through chained natural-language outputs. That was another lesson: LLM agents are terrible at reliably consuming free-form text from other LLM agents. Make them consume structured records.",
      },
      {
        type: "callout",
        tone: "info",
        text: "If you're building a multi-step agent system: separate detection from execution. Single-agent designs that conflate the two will look great in demos and break the moment you add a second platform.",
      },
      { type: "heading", level: 2, text: "What we got wrong" },
      {
        type: "paragraph",
        text: 'We initially had five agents. The fifth was a "planner" that decided which other agents to invoke. It added zero accuracy, doubled latency, and made debugging twice as hard. We deleted it. Routing logic ended up being deterministic state-machine code, not an LLM call, which is unfashionable to say but correct.',
      },
      {
        type: "paragraph",
        text: "If you're working on something similar, talk to us. We don't think anyone has the right answer here yet, but we'd love to compare notes.",
      },
    ],
  },
  {
    category: "Security",
    slug: "privacy-by-design",
    title: "Privacy by design: why ClaimIt never stores your credentials",
    excerpt:
      "Connecting an AI agent to your inbox should not require giving up everything that's in your inbox. Here's how we built it so you don't have to.",
    date: "2026-05-17",
    readTime: "4 min read",
    coverImage: "/blog/privacy-by-design.jpg",
    author: { name: "Erdun", role: "Co-founder", avatar: "/team/erdun.png" },
    body: [
      {
        type: "paragraph",
        text: "Every consumer-facing agent product runs into the same trust question on day one: are you safe to give my data to? In ClaimIt's case the data is especially sensitive (your inbox), and the most honest answer we can give is that we designed the system to need as little of it as possible.",
      },
      { type: "heading", level: 2, text: "What ClaimIt actually has access to" },
      {
        type: "paragraph",
        text: "When you connect ClaimIt, you grant Google OAuth scopes that are read-only and specifically scoped to email content. ClaimIt cannot send email from your account by default. It cannot delete, label, or modify messages. It cannot read your contacts, calendar, drive, or any other Google service.",
      },
      {
        type: "paragraph",
        text: "We do not store your Gmail password. We never see it. Google handles authentication, and we receive a short-lived access token that we use to query your inbox. The token can be revoked at any time from your Google Account settings, independently of anything you do on our end.",
      },
      { type: "heading", level: 2, text: "What we keep, and for how long" },
      {
        type: "paragraph",
        text: "We extract structured records from purchase-related emails: retailer, product, price, date, order ID. We keep those records, because they're what the agent needs to do its job. We do not keep the raw emails. We do not index or train on your inbox. We do not look at anything outside the purchase-confirmation pattern.",
      },
      {
        type: "paragraph",
        text: "If you delete your ClaimIt account, your purchase records and any drafted claims are deleted within 24 hours. Re-syncing the same Gmail account re-extracts from scratch.",
      },
      {
        type: "callout",
        tone: "info",
        text: "Independently verifiable: revoke ClaimIt's access at [myaccount.google.com/permissions](https://myaccount.google.com/permissions) at any time. We can't stop you, hide it from you, or restore access without you re-granting it.",
      },
      { type: "heading", level: 2, text: "Outbound: what we send on your behalf" },
      {
        type: "paragraph",
        text: "ClaimIt drafts claims and shows them to you before anything goes out. For email claims, you approve the draft and we send via a Gmail send scope you opt into (also revocable). For chat-script claims and in-store guides, ClaimIt produces text for you to copy or follow; we never act on your behalf without your tap.",
      },
      {
        type: "paragraph",
        text: "There's a setting to enable fully autonomous filing once you trust the agent. It's off by default. We think that's the right default forever. Your data, your call.",
      },
      {
        type: "heading",
        level: 2,
        text: "Why this matters more than the marketing copy",
      },
      {
        type: "paragraph",
        text: "A lot of agent products talk about privacy. Fewer architect the system so the privacy story is the only story they could possibly tell. We don't have a database of your passwords because the system was built without one. We don't sell your purchase history because there's no buyer pipeline to sell it through. We don't read your email because the agent doesn't need to. It needs the 0.1% that's purchase confirmations.",
      },
      {
        type: "paragraph",
        text: "Privacy is easiest to maintain when the architecture wouldn't let you violate it even if you wanted to. That's what we built.",
      },
    ],
  },
  {
    category: "Product",
    slug: "two-hours-to-thirty-seconds",
    title:
      "From two hours of email-writing to thirty seconds: what automating a price claim actually looks like",
    excerpt:
      "We walked through what a single price-protection claim actually requires of a human. Then we replaced each step with an agent decision. Here's the result.",
    date: "2026-05-13",
    readTime: "3 min read",
    coverImage: "/blog/two-hours-to-thirty-seconds.jpg",
    author: { name: "Erdun", role: "Co-founder", avatar: "/team/erdun.png" },
    body: [
      {
        type: "paragraph",
        text: "Here's an actual price-protection claim, the manual way. You bought a Sony WH-1000XM5 from Best Buy four days ago for $399. You notice today it's $349. You're owed $50. Here's what you have to do.",
      },
      {
        type: "list",
        ordered: true,
        items: [
          "Find your original purchase confirmation email. Scroll through inbox, search by retailer, find the right order.",
          "Check Best Buy's price-protection policy. Verify it's still inside the 15-day window for your product category.",
          "Take a screenshot of the current lower price, with the date visible.",
          "Find Best Buy's price-match form. (It's buried.) Fill it out with order number, original price, current price, and screenshot.",
          "Wait. Submit. Wait again. Eventually get the refund issued to your original payment method.",
        ],
      },
      {
        type: "paragraph",
        text: "Most people who track their time would put this at 30-60 minutes of attention spread over 2-3 days. We've timed enthusiastic friends doing it carefully and they take closer to two hours. The refund is $50.",
      },
      { type: "heading", level: 2, text: "Now the ClaimIt way" },
      {
        type: "paragraph",
        text: "You buy the headphones on Tuesday. The agent reads the purchase confirmation, extracts that you paid $399, and starts monitoring the price. On Saturday at 6:17 PM, the price drops to $349 on Best Buy's site. The agent confirms it's a real drop (not a regional anomaly), confirms the policy window is still open, and drafts a claim using Best Buy's in-store guide format.",
      },
      {
        type: "paragraph",
        text: 'You get one notification: "Best Buy price drop on Sony WH-1000XM5. Refund estimate: $50. Approve to file." You tap approve. The agent submits the claim. You see the outcome in the dashboard a day or two later. Total time you spent: 30 seconds.',
      },
      {
        type: "callout",
        tone: "info",
        text: "The 30 seconds is approval time. The actual claim filing, monitoring, and outcome handling happens in the background. You don't have to be paying attention.",
      },
      { type: "heading", level: 2, text: "What it adds up to" },
      {
        type: "paragraph",
        text: "Manually claiming refunds doesn't scale. Even motivated people give up after their second or third claim. The math is bad. But automation reverses it. If ClaimIt files four claims a year for you at $40 average, that's $160 you weren't going to collect. Spread across the eligible purchases an active household actually makes, it compounds quickly.",
      },
      {
        type: "paragraph",
        text: "The point of the agent isn't that any single claim is impossible without it. The point is that the workflow is annoying enough that no one ever does it, and that the agent makes it cost zero attention, so suddenly everyone can.",
      },
    ],
  },
  {
    category: "Company",
    slug: "what-happened-to-paribus",
    title: "What happened to Paribus, and why we built ClaimIt from scratch",
    excerpt:
      "Paribus was the original automated price-protection service. Capital One bought it, and the magic quietly disappeared. Here's what we learned from studying the predecessors.",
    date: "2026-05-09",
    readTime: "4 min read",
    coverImage: "/blog/what-happened-to-paribus.jpg",
    author: { name: "Erdun", role: "Co-founder", avatar: "/team/erdun.png" },
    body: [
      {
        type: "paragraph",
        text: "We get asked at least once a week why ClaimIt exists when Paribus already did this. The short answer is that Paribus doesn't, anymore. But the longer answer is interesting, because what happened to the early services in this space is exactly the problem we're trying to solve.",
      },
      {
        type: "heading",
        level: 2,
        text: "A short history of automated price-protection services",
      },
      {
        type: "paragraph",
        text: "Paribus launched in 2014, in the early consumer-fintech wave. The pitch was simple: connect your Gmail, and when prices drop on your purchases at supported retailers, we'll file the claim for you. The product worked well enough to be acquired by Capital One in 2016.",
      },
      {
        type: "paragraph",
        text: "After the acquisition, Paribus was folded into what became Capital One Shopping. Over the following years, the automated-claim-filing capability quietly receded. Capital One Shopping still exists as a browser extension and price-comparison tool, but the original Paribus magic (connect Gmail, refunds appear) is no longer the product.",
      },
      {
        type: "paragraph",
        text: "Earny launched around the same time, with similar mechanics, and went through similar transitions. Other smaller services have come and gone. The pattern is consistent: launch with a strong demo, get traction, run into the long tail of retailer-specific integration work, and either pivot away from the hardest half or quietly stop fulfilling the promise.",
      },
      { type: "heading", level: 2, text: "Why this kept happening" },
      {
        type: "paragraph",
        text: "Filing a claim that gets approved at Best Buy is a different problem than filing one at Marriott, which is a different problem than filing one at Delta. Each retailer has its own form, its own preferred channel, its own quirks, its own response patterns. There are no clean APIs. The work scales linearly with the number of retailers, and most of the work is unglamorous infrastructure that nobody writes blog posts about.",
      },
      {
        type: "paragraph",
        text: "Pre-LLM, the only way to handle this was to maintain hand-coded integrations per retailer. As a business that gets pressure on margins, you eventually start cutting the most expensive retailers, then the next most expensive, then you find yourself shipping a service that does price comparison and not the original claim filing at all. That's roughly what happened across the space.",
      },
      {
        type: "callout",
        tone: "info",
        text: "The retailer-specific knowledge isn't actually proprietary or hard to acquire. The hard part is keeping it current, recovering from form changes, and handling the long tail of edge cases without a 50-person ops team. LLM-based agents change the unit economics of doing that.",
      },
      { type: "heading", level: 2, text: "What we're trying differently" },
      {
        type: "paragraph",
        text: "We're betting that [an LLM-based agent](/blog/four-agent-architecture) can do the retailer-specific work that previously required hand-coded integrations and human operations. Not perfectly. We're early. But well enough that the marginal cost of adding a retailer drops by an order of magnitude. That's the bet under all of ClaimIt.",
      },
      {
        type: "paragraph",
        text: "We're not building a faster Paribus. We're building what becomes possible because the cheapest way to handle 26 retailers is no longer a 26-person ops team. If we're right, this category has another decade of growth in it. If we're wrong, at least we'll have shipped something that worked for a while, which is more than the alternatives have lately.",
      },
    ],
  },
  {
    category: "Engineering",
    slug: "autonomous-shopping-agents",
    title: "From passive monitoring to autonomous shopping agents: where ClaimIt is going next",
    excerpt:
      "Notification → assisted action → autonomous execution. Most agent products are stuck on step one. Here's where we think the line should sit, and why.",
    date: "2026-05-05",
    readTime: "4 min read",
    coverImage: "/blog/autonomous-shopping-agents.jpg",
    author: {
      name: "The ClaimIt engineering team",
      role: "Engineering",
    },
    body: [
      {
        type: "paragraph",
        text: "There's a maturity curve for agent products that's worth drawing out. Most of what we've seen in the consumer agent space sits at the very early end of it, and most of the interesting opportunities are at the later end. ClaimIt is mid-curve and moving forward deliberately.",
      },
      { type: "heading", level: 2, text: "The four stages" },
      { type: "heading", level: 3, text: "Stage 1: Notification" },
      {
        type: "paragraph",
        text: 'The agent tells you something is happening. "Price dropped on the laptop you bought." That\'s it. You decide what to do, you do it, the agent moves on. Most price-tracker browser extensions live here. This is useful but not exciting.',
      },
      { type: "heading", level: 3, text: "Stage 2: Assisted action" },
      {
        type: "paragraph",
        text: 'The agent does most of the work and you approve. "Price dropped, here\'s the draft claim, tap approve to file." The agent handles the long tail of retailer-specific knowledge and you keep editorial control. This is roughly where ClaimIt is today.',
      },
      { type: "heading", level: 3, text: "Stage 3: Bounded autonomy" },
      {
        type: "paragraph",
        text: "The agent acts on your behalf inside bounds you've defined. \"Auto-file any claim under $100 at retailers I've approved. Surface anything bigger or weirder.\" Approvals happen in advance, on classes of decisions, not on individual events. You can opt in to this in ClaimIt today; the dial is moving in the autonomous direction.",
      },
      { type: "heading", level: 3, text: "Stage 4: Goal-directed autonomy" },
      {
        type: "paragraph",
        text: "The agent has a goal (for example, \"maximize cashback on purchases I make\") and figures out which actions to take across services to accomplish it. This is where price-protection becomes one tool in a broader set: cashback portals, credit-card category bonuses, retroactive deals. We don't think any consumer agent product is here yet. We think this is where the space is going, and it's where the durable consumer surplus is.",
      },
      {
        type: "callout",
        tone: "info",
        text: "Stages 1 and 2 are interesting. Stages 3 and 4 are why we built [the four-agent architecture](/blog/four-agent-architecture). Splitting detection from execution wasn't only a debugging benefit. It's what makes graduating across the curve a configuration change, not a rewrite.",
      },
      { type: "heading", level: 2, text: "Why the line matters" },
      {
        type: "paragraph",
        text: "Every additional stage requires more user trust and more agent reliability. Most products in our space have skipped trust-building and tried to skip directly to autonomous, which is why they often fail in embarrassing ways. We're deliberately moving one step at a time: ship assisted-action first, prove the claim-approval rate is high, then move the dial toward bounded autonomy with the users who want it. The infrastructure to support all four stages exists today; what changes is how much we ask the user to trust.",
      },
      { type: "heading", level: 2, text: "What we're working on" },
      {
        type: "paragraph",
        text: "Near-term: more retailers, better handling of denied claims, smarter retry strategies. Medium-term: a true Stage 3 mode where ClaimIt files routine claims without per-claim approval. Long-term: Stage 4 across the broader money-back ecosystem, with price-protection as one capability among several.",
      },
      {
        type: "paragraph",
        text: "If any of this is interesting to you and you're a hands-on engineer interested in agent systems, we're hiring (see our [careers page](/careers)). If you just want to use the product, the beta is open.",
      },
    ],
  },
];

export function getAllPosts(): BlogPost[] {
  return [featuredPost, ...blogPosts];
}

export function getPostBySlug(slug: string): BlogPost | undefined {
  return getAllPosts().find((post) => post.slug === slug);
}

export function getRelatedPosts(currentSlug: string, count = 3): BlogPost[] {
  return getAllPosts()
    .filter((p) => p.slug !== currentSlug)
    .slice(0, count);
}
