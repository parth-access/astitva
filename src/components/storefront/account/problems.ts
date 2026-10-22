/** Better Auth's answers to customers, in the shop's words. */

export type Problem = { code?: string; message?: string; status?: number } | null | undefined;

export function codeProblem(error: Problem): string {
  if (!error) return "Something went wrong. Please try again.";
  if (error.code === "ADMIN_ACCOUNT") return "This email is for the Astitva admin. To shop, use another email.";
  if (error.status === 429) return error.message && !/too many requests/i.test(error.message) ? error.message : "That's a few tries in a short time. Please wait a few minutes.";
  switch (error.code) {
    case "INVALID_OTP":
      return "That code isn't right. Check the latest email from us and try again.";
    case "OTP_EXPIRED":
      return "That code has expired. Ask for a new one.";
    case "TOO_MANY_ATTEMPTS":
      return "Too many wrong codes. Ask for a new one.";
    case "INVALID_EMAIL":
      return "That doesn't look like an email address.";
    case "INVALID_EMAIL_OR_PASSWORD":
      return "That email and password don't match. Try again, or sign in with a code instead.";
    case "PASSWORD_TOO_SHORT":
      return "Use at least 8 characters.";
    case "PASSWORD_TOO_LONG":
      return "That password is too long.";
    default:
      return "Something went wrong. Please try again.";
  }
}
