import { MockTelephonyProvider } from "./mock-provider";
import { ExotelTelephonyProvider } from "./exotel-provider";
import type { TelephonyProvider } from "./provider";

let cached: TelephonyProvider | null = null;

/** Resolve the active telephony provider from env (defaults to mock). */
export function getProvider(): TelephonyProvider {
  if (cached) return cached;
  const choice = (process.env.TELEPHONY_PROVIDER || "mock").toLowerCase();
  cached = choice === "exotel" ? new ExotelTelephonyProvider() : new MockTelephonyProvider();
  return cached;
}

export * from "./provider";
