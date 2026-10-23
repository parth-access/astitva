/**
 * Policy pages. These are DRAFTS: the wording must be confirmed by Krishna
 * (and her CA where tax or refunds are involved) before launch, and must match
 * what the software actually does. The site must never promise a policy the
 * business has not decided. Mark a page "final" once confirmed: it then shows
 * without the review note and goes into search and the sitemap.
 *
 * Numbers to confirm (they appear below): dispatch in 2–4 working days,
 * returns within 7 days of delivery, faults reported within 48 hours, refunds
 * sent within 5–7 working days. Each page ends with the contact details from
 * the admin's settings (policies/[slug]/page.tsx).
 */

/** A paragraph, or a list (rendered as bullets). */
export type PolicyBlock = string | string[];
export type PolicySection = { heading: string; body: PolicyBlock[] };
export type PolicyPage = {
  slug: string;
  title: string;
  summary: string;
  status: "draft" | "final";
  intro: PolicyBlock[];
  sections: PolicySection[];
};

export const POLICY_PAGES: PolicyPage[] = [
  {
    slug: "shipping",
    title: "Shipping",
    summary: "Where we ship, how long it takes and what it costs.",
    status: "draft",
    intro: ["Every Astitva piece is checked, folded and packed by hand before it leaves us. Here is how it reaches you."],
    sections: [
      {
        heading: "Where we deliver",
        body: [
          "We deliver across India. If a courier can't reach your pincode yet, checkout will say so, or we'll tell you before sending and refund anything you paid.",
          "We don't ship outside India at the moment.",
        ],
      },
      {
        heading: "When it leaves us",
        body: [
          "Orders are packed and handed to the courier within 2–4 working days (Monday to Saturday, except public holidays).",
          "During a sale or a new launch it can take a little longer. If your order will be later than this, we'll message you.",
        ],
      },
      {
        heading: "How long delivery takes",
        body: [
          "Once shipped, most orders arrive in 3–7 working days. Smaller towns and remote areas can take up to 10.",
          "These are the courier's estimates, not promises: weather, strikes and festival rush can slow them down.",
        ],
      },
      {
        heading: "What it costs",
        body: [
          "The shipping charge, if any, is shown in your bag and at checkout before you pay. When an order is over our free-shipping amount, shipping is free; checkout shows this too.",
          "Cash on delivery may carry a small extra fee. It is shown at checkout when you choose it.",
          "All prices include GST. There is nothing more to pay at the door, apart from the amount shown for a cash-on-delivery order.",
        ],
      },
      {
        heading: "Tracking your parcel",
        body: [
          "As soon as your order is handed to the courier, we email you the courier's name and tracking number, with a link to follow it.",
          "You can also see it any time on your order's page, from the link in your order email, from \"Find your order\" in this browser, or under Orders in your account.",
        ],
      },
      {
        heading: "If delivery doesn't happen",
        body: [
          "Please make sure someone can receive the parcel and that your phone is on: the courier may call before delivering.",
          "If the courier can't deliver and the parcel comes back to us, we'll message you to send it again or, for a paid order, refund it. A second delivery may carry the shipping charge again.",
          "If a parcel arrives damaged or looks opened, please don't accept it, or take photos before opening it, and message us the same day.",
        ],
      },
    ],
  },
  {
    slug: "returns",
    title: "Returns and exchanges",
    summary: "Returning or exchanging a piece, and how refunds work.",
    status: "draft",
    intro: ["We want every piece to feel like it was made for you. If it doesn't, here is what we can do."],
    sections: [
      {
        heading: "What can be returned or exchanged",
        body: [
          "You can ask to return or exchange a piece within 7 days of delivery, as long as it is:",
          ["unworn, unwashed and unaltered", "with all its tags still attached", "in its original packaging, with anything that came with it"],
          "We check every piece when it comes back. If it has been worn, washed, damaged or perfumed, we can't accept it and will send it back to you.",
        ],
      },
      {
        heading: "Exchanges",
        body: [
          "We can exchange a piece for another size or colour of the same style, if we have it. If what you'd like is sold out, we'll refund you instead.",
          "Exchanges are sent free of charge once we receive the original piece.",
        ],
      },
      {
        heading: "How to start a return or exchange",
        body: [
          "Message us on WhatsApp or by email with your order number (it starts with AST-), the piece, and whether you'd like a different size, colour or a refund.",
          "Where our courier can collect from your pincode, we'll arrange a pickup. Where it can't, we'll ask you to send the piece to us and reimburse the shipping, up to the cost of a standard courier.",
        ],
      },
      {
        heading: "Faulty or wrong pieces",
        body: [
          "If a piece arrives with a fault, or isn't what you ordered, tell us within 48 hours of delivery, with photos (an unboxing video helps a lot).",
          "We'll replace it or refund it in full, including shipping and any cash-on-delivery fee, and arrange the return at our cost.",
        ],
      },
      {
        heading: "Refunds",
        body: [
          "Once the piece reaches us and passes its check, we send your refund within 5–7 working days.",
          [
            "Paid online: the refund goes back to the card, UPI or account you paid with. Your bank may take a few more days to show it.",
            "Cash on delivery: we refund by UPI or bank transfer to an account you give us.",
          ],
          "Shipping charges and the cash-on-delivery fee aren't refunded on a return for change of mind; they are on a faulty or wrong piece.",
        ],
      },
      {
        heading: "Pieces that can't be returned",
        body: ["Pieces altered or made to your measurements, and anything we told you at the time of ordering was final sale, can't be returned or exchanged unless they are faulty."],
      },
    ],
  },
  {
    slug: "cancellation",
    title: "Cancellation",
    summary: "Cancelling an order before it ships, and when we may cancel one.",
    status: "draft",
    intro: ["Changed your mind? We understand. Here is when an order can still be cancelled."],
    sections: [
      {
        heading: "Cancelling your order",
        body: [
          "You can cancel an order until it is packed for dispatch. Message us on WhatsApp or by email with your order number as soon as you can, and we'll confirm once it is cancelled.",
          "Once an order has been packed or handed to the courier, it can't be cancelled. You can return it after delivery instead (see Returns and exchanges).",
        ],
      },
      {
        heading: "Refunds for cancelled orders",
        body: [
          "If you paid online, the full amount, shipping included, goes back to the card, UPI or account you paid with, within 5–7 working days. Your bank may take a few more days to show it.",
          "A cash-on-delivery order has nothing to refund: nothing was charged.",
        ],
      },
      {
        heading: "Payments that don't finish",
        body: [
          "When you pay online, your pieces are held for you for a short while. If the payment doesn't complete, the order is cancelled automatically and nothing is charged.",
          "If money left your account but the order didn't go through, we'll refund it in full and let you know. If you haven't heard from us within 2 working days, message us.",
        ],
      },
      {
        heading: "When we may cancel an order",
        body: [
          "Very rarely, we may have to cancel an order, for example when:",
          [
            "a piece turns out to be damaged or no longer available",
            "a price or detail on the site was clearly wrong",
            "the courier can't deliver to the address",
            "we can't confirm a cash-on-delivery order with you, or a number has refused cash-on-delivery parcels before",
            "the order looks fraudulent",
          ],
          "If we do, we'll tell you why and refund anything you paid, in full.",
        ],
      },
      {
        heading: "Cash on delivery",
        body: [
          "Each mobile number can have a limited number of cash-on-delivery orders waiting to be packed at one time, and cash on delivery is available up to a set order value. Checkout tells you if either applies.",
          "Refused cash-on-delivery parcels cost us two shipments. If parcels to a number are refused, we may offer only online payment for its future orders.",
        ],
      },
    ],
  },
  {
    slug: "privacy",
    title: "Privacy",
    summary: "What we collect, why, who it is shared with, and your choices.",
    status: "draft",
    intro: [
      "Astitva is a small label, and we treat your details the way we'd want ours treated: we ask for what we need to send you your order, keep it safe, and never sell it.",
      "This policy explains what we collect, why, and the choices you have, in line with India's Digital Personal Data Protection Act, 2023.",
    ],
    sections: [
      {
        heading: "What we collect",
        body: [
          [
            "When you order: your name, mobile number, email (if you give one), delivery address and any note you add.",
            "When you make an account: your name, mobile number, email and password (stored only as a one-way scrambled hash), saved addresses, and the pieces you save.",
            "When you pay online: Razorpay handles the payment. We receive a payment reference and the method used (for example UPI or card), never your card number, UPI PIN or bank login.",
            "When you message us: what you send us on WhatsApp or by email.",
            "When you ask to be told about a restock: your email and the piece.",
          ],
        ],
      },
      {
        heading: "How we use it",
        body: [
          [
            "to take, pack, deliver and track your order, and to send you emails about it (confirmation, receipt, shipping)",
            "to arrange returns, exchanges and refunds",
            "to answer your messages",
            "to keep your account, saved addresses and saved pieces",
            "to prevent fraud and abuse, for example limits on sign-in attempts and on cash-on-delivery orders per number",
            "to keep the records tax law requires (invoices and receipts)",
          ],
          "We don't send marketing messages unless you've asked for them, and we never sell or rent your details.",
        ],
      },
      {
        heading: "Who we share it with",
        body: [
          "Only the services that help us run the shop, and only what each one needs:",
          [
            "Razorpay, to take online payments and refunds",
            "our courier partners, your name, phone and address, to deliver and collect parcels",
            "Resend, to send our emails",
            "Netlify and Supabase, which host the website and its database",
            "Cloudinary, which stores and serves the photographs of our pieces",
            "Google, if you sign in with Google, or if you allow Google Analytics (see below)",
            "WhatsApp (Meta), when you choose to message us there",
          ],
          "Some of these services store data outside India. We'll also share information if the law requires it.",
        ],
      },
      {
        heading: "Cookies and this browser",
        body: [
          "We use a few cookies the shop can't work without: one keeps your bag, others keep you signed in. They aren't used to follow you around the web.",
          "This browser also remembers, on your device only, the orders you've opened (so \"Find your order\" can open them again), whether you've seen the opening animation, and your analytics choice.",
          "Only if you say yes, we use Google Analytics to count visits and see which pieces are looked at and bought. It sets cookies in your browser and never receives your name, phone number, email or address. Until you answer, and after a no, nothing is sent. You can change your answer any time from \"Analytics choice\" at the foot of every page.",
        ],
      },
      {
        heading: "How long we keep it",
        body: [
          "We keep order records for as long as tax and accounting law requires, currently up to 8 years. Account details are kept until you delete your account. Restock requests end once we've emailed you.",
        ],
      },
      {
        heading: "Your choices and rights",
        body: [
          [
            "See and correct your details: from your account, or by asking us.",
            "Delete your account: from your account's details page, at any time. We keep your past orders only as long as the law requires.",
            "Withdraw consent: change your analytics choice from the foot of any page, or ask us to stop using your details for anything that needs your consent.",
            "Ask a question or complain: write to us using the details below.",
          ],
          "You can also complain to the Data Protection Board of India.",
        ],
      },
      {
        heading: "Keeping it safe",
        body: [
          "Your connection to the site is encrypted, passwords are never stored as written, the shop's staff sign in with two-step verification, and backups of our database are encrypted.",
        ],
      },
      {
        heading: "Children",
        body: ["Our shop is meant for adults. If you are under 18, please ask a parent or guardian to order for you."],
      },
      {
        heading: "Changes",
        body: ["If we change how we use your details, we'll update this page, and tell you by email first if the change matters for your account or orders."],
      },
    ],
  },
  {
    slug: "terms",
    title: "Terms",
    summary: "The terms of buying from Astitva.",
    status: "draft",
    intro: [
      "These terms apply when you use this website and buy from Astitva. By placing an order you agree to them, together with our Shipping, Returns and exchanges, Cancellation and Privacy policies.",
    ],
    sections: [
      {
        heading: "Who we are",
        body: ["This website is run by Astitva, a womenswear label based in India. Our contact details are at the end of this page."],
      },
      {
        heading: "The pieces",
        body: [
          "We show each piece as truly as we can: its colours, fabric, measurements and condition. Colours can look a little different on different screens, and handmade or hand-finished pieces can vary slightly from one to the next.",
          "Each piece's page states its condition. Measurements are taken from the garment itself; please compare them with a piece you own before ordering.",
        ],
      },
      {
        heading: "Prices and payment",
        body: [
          "Prices are in Indian rupees and include GST. The price you pay is the one shown at checkout when you place your order.",
          "You can pay online through Razorpay (UPI, cards, net banking and wallets) or, where offered, in cash on delivery.",
          "If a price on the site is clearly wrong, we'll tell you before sending the order and you can choose to cancel.",
        ],
      },
      {
        heading: "Your order",
        body: [
          "After you place an order, we email you a confirmation. Your order is accepted once we send it on its way; until then we may cancel it in the cases set out in our Cancellation policy, with a full refund of anything paid.",
          "Pieces in your bag aren't held for you. When you pay online, they're held for a short while to give you time to pay.",
        ],
      },
      {
        heading: "Your account",
        body: [
          "You don't need an account to order. If you make one, keep your password to yourself; you're responsible for orders placed from your account. You can delete it at any time.",
        ],
      },
      {
        heading: "Using this website",
        body: [
          "Please don't misuse the site: no attempts to break in, to scrape it in bulk, to place orders you don't intend to receive, or to use someone else's details.",
          "The words, photographs, drawings, the Astitva name and the woman in the hat are ours. Please don't copy them without asking.",
        ],
      },
      {
        heading: "Our responsibility",
        body: [
          "Nothing in these terms takes away your rights as a consumer under Indian law. Beyond those, our responsibility for any order is limited to the amount you paid for it.",
          "We're not responsible for delays caused by things outside our control, such as natural events, strikes or courier disruptions.",
        ],
      },
      {
        heading: "Law and disputes",
        body: [
          "These terms are governed by the laws of India. If something goes wrong, please write to us first: most things can be put right quickly. Otherwise, disputes are decided by the courts of the city where Astitva is registered.",
        ],
      },
      {
        heading: "Changes",
        body: ["We may update these terms from time to time. The terms in force when you place an order apply to that order."],
      },
    ],
  },
];

export function getPolicy(slug: string) {
  return POLICY_PAGES.find((p) => p.slug === slug) ?? null;
}
