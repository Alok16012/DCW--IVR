import { MockTelephonyProvider } from "./mock-provider";
import { ExotelTelephonyProvider } from "./exotel-provider";
import { BuzzdialTelephonyProvider } from "./buzzdial-provider";
import { MyOperatorTelephonyProvider } from "./myoperator-provider";
import type { TelephonyProvider } from "./provider";

const PROVIDERS: Record<string, () => TelephonyProvider> = {
  exotel: () => new ExotelTelephonyProvider(),
  buzzdial: () => new BuzzdialTelephonyProvider(),
  myoperator: () => new MyOperatorTelephonyProvider(),
  mock: () => new MockTelephonyProvider(),
};

let cached: TelephonyProvider | null = null;

/** Resolve the active telephony provider from env (defaults to mock). */
export function getProvider(): TelephonyProvider {
  if (cached) return cached;
  const choice = (process.env.TELEPHONY_PROVIDER || "mock").toLowerCase();
  cached = (PROVIDERS[choice] ?? PROVIDERS.mock)();
  return cached;
}

export * from "./provider";
