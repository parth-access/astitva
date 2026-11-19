/** Names for the brand's profiles elsewhere, from the links saved in settings. */
const SITES: Record<string, string> = {
  "instagram.com": "Instagram",
  "pinterest.com": "Pinterest",
  "in.pinterest.com": "Pinterest",
  "facebook.com": "Facebook",
  "youtube.com": "YouTube",
  "x.com": "X",
  "twitter.com": "X",
  "threads.net": "Threads",
  "linkedin.com": "LinkedIn",
};

/**
 * "Instagram @shop.astitva" for https://www.instagram.com/shop.astitva/.
 * An unknown site reads as its host; a link that isn't a URL as itself.
 */
export function profileLabel(href: string): string {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return href;
  }
  const host = url.hostname.replace(/^(www|m)\./, "");
  const site = SITES[host];
  if (!site) return host;
  const handle = url.pathname.split("/").filter(Boolean)[0];
  return handle && site !== "LinkedIn" ? `${site} @${handle.replace(/^@/, "")}` : site;
}

/** The link without tracking: what was shared from the app often carries ?utm_source=… */
export function cleanProfileLink(href: string): string {
  try {
    const url = new URL(href);
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return href;
  }
}
