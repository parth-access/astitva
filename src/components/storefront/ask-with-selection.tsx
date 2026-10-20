"use client";

import { whatsappLink } from "@/lib/format";
import { useSelection } from "./piece-selection";

/** The WhatsApp link on a piece page: the message names the colour and size being looked at. */
export function AskWithSelection({ phone, who, label, name, className = "" }: { phone: string; who: string; label: string; name: string; className?: string }) {
  const { colour, size } = useSelection();
  const choice = [colour, size].filter(Boolean).join(", ");
  const message = `Hello, I'm looking at ${label} (${name})${choice ? ` in ${choice}` : ""}. Could you tell me how it fits?`;
  return (
    <a href={whatsappLink(phone, message)} target="_blank" rel="noopener noreferrer" className={`link ${className}`}>
      Ask {who} about the fit on WhatsApp
    </a>
  );
}
