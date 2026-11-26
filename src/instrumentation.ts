// Runs once when the Next.js server starts, before it serves requests.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { warmUp } = await import("@/lib/flagsmith");
    await warmUp();
  }
}
