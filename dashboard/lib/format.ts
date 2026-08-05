import { formatUnits } from "viem";
import { USDC_DECIMALS } from "./config";

export function formatUsdc(value: bigint): string {
  const formatted = Number(formatUnits(value, USDC_DECIMALS));
  return formatted.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  });
}

export function truncateAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function formatTimestamp(unixSeconds: bigint | number): string {
  const ms = Number(unixSeconds) * 1000;
  return new Date(ms).toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "medium",
  });
}
