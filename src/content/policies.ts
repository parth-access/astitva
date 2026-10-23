/**
 * Policy pages. These are DRAFTS: the wording must be confirmed by Krishna
 * (and her CA where tax or refunds are involved) before launch, and must match
 * what the software actually does. The site must never promise a policy the
 * business has not decided. See PRD open questions 3, 4 and 5.
 */
export type PolicyPage = { slug: string; title: string; summary: string; body: string[]; status: "draft" | "final" };

export const POLICY_PAGES: PolicyPage[] = [
  {
    slug: "shipping",
    title: "Shipping",
    summary: "Where we ship, how long it takes and what it costs.",
    status: "draft",
    body: [
      "Delivery areas, dispatch time and shipping charges will be published here once they are confirmed.",
      "Every order gets a tracking link by email as soon as it is handed to the courier.",
    ],
  },
  {
    slug: "returns",
    title: "Returns and exchanges",
    summary: "Whether a piece can be returned or exchanged, and how.",
    status: "draft",
    body: [
      "Our return and exchange policy is being finalised. Exchanges depend on what is in stock in your size and colour.",
      "Until this page is final, please contact us before placing an order if you have questions about returns.",
    ],
  },
  {
    slug: "cancellation",
    title: "Cancellation",
    summary: "Cancelling an order before it ships.",
    status: "draft",
    body: [
      "You can ask us to cancel an order until it has been packed for dispatch. Once it has shipped it can no longer be cancelled.",
      "Refunds for cancelled prepaid orders go back to the original payment method. Timelines will be confirmed here.",
    ],
  },
  {
    slug: "privacy",
    title: "Privacy",
    summary: "What we collect and why.",
    status: "draft",
    body: [
      "We collect your name, phone number, email and delivery address to deliver your order and keep you updated about it.",
      "Payments are handled by Razorpay. We never see or store your card details.",
      "Only if you say yes, we use Google Analytics to count visits and see which pieces are looked at and bought. It sets cookies in your browser and never receives your name, phone number, email or address. Until you answer, and after a no, nothing is sent. You can change your answer any time from \"Analytics choice\" at the foot of every page.",
      "The full privacy policy will be published before launch.",
    ],
  },
  {
    slug: "terms",
    title: "Terms",
    summary: "The terms of buying from Astitva.",
    status: "draft",
    body: ["The terms of sale will be published before launch."],
  },
];

export function getPolicy(slug: string) {
  return POLICY_PAGES.find((p) => p.slug === slug) ?? null;
}
