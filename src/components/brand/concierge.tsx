import Link from "next/link";
import { formatPieceNumber, whatsappLink } from "@/lib/format";
import { getConcierge } from "@/modules/catalog/queries";

type PieceRef = { pieceNumber: number | null; pieceName: string | null; name: string };

function messageFor(piece?: PieceRef) {
  if (!piece) return "Hello Astitva, I have a question about one of your pieces.";
  const label = [piece.pieceNumber ? formatPieceNumber(piece.pieceNumber) : null, piece.pieceName ?? piece.name]
    .filter(Boolean)
    .join(" ");
  return `Hello, I'm looking at ${label} (${piece.name}). Could you tell me how it fits?`;
}

/** "Ask Krishna" when a name is set in store settings, otherwise "Ask us". */
export async function askLabel() {
  const c = await getConcierge();
  return c.name ? `Ask ${c.name}` : "Ask us";
}

/** A quiet text link that opens WhatsApp with the piece already named. Falls back to the contact page. */
export async function AskAboutPiece({ piece, className = "" }: { piece: PieceRef; className?: string }) {
  const c = await getConcierge();
  const who = c.name ?? "us";
  if (!c.whatsapp) {
    return (
      <Link href="/contact" className={`link ${className}`}>
        Ask {who} about the fit
      </Link>
    );
  }
  return (
    <a href={whatsappLink(c.whatsapp, messageFor(piece))} target="_blank" rel="noopener noreferrer" className={`link ${className}`}>
      Ask {who} about the fit on WhatsApp
    </a>
  );
}

/** The concierge band at the end of the home page lookbook. */
export async function ConciergeBand() {
  const c = await getConcierge();
  const who = c.name ?? "us";
  return (
    <section aria-labelledby="concierge" className="bg-champagne">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-20 sm:px-8 md:grid-cols-12 md:py-28">
        <h2 id="concierge" className="text-4xl md:col-span-5 md:text-5xl">
          Not sure how it will sit on you?
        </h2>
        <div className="md:col-span-5 md:col-start-8">
          <p className="text-lg leading-relaxed">
            Message {who} with the number of the piece. You will hear back from a person, not a bot: how it falls, what the
            fabric feels like, and what it pairs well with.
          </p>
          {c.whatsapp ? (
            <a
              href={whatsappLink(c.whatsapp, messageFor())}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-outline mt-8"
            >
              Message on WhatsApp
            </a>
          ) : (
            <Link href="/contact" className="btn-outline mt-8">
              Write to {who}
            </Link>
          )}
        </div>
      </div>
    </section>
  );
}
