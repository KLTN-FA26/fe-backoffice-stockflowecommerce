import "server-only";

import { isIP } from "node:net";

/**
 * Login rate-limit identity for the Spring call made by this BFF.
 *
 * Without it every browser shares the BFF egress address, so one admin's failed logins put the
 * whole team in the same `RateLimitInterceptor` bucket. The address is taken ONLY from a header the
 * hosting platform / sanitizing ingress controls - never from the browser's own X-Forwarded-For -
 * and must be exactly one IP. Backend nginx trusts it only with the shared BFF secret.
 */
export const BFF_CLIENT_IP_HEADER = "X-Stockflow-Client-IP";
export const BFF_SECRET_HEADER = "X-Stockflow-Bff-Secret";
// Vercel sets this from the edge connection and overwrites any client-supplied value.
export const VERCEL_CLIENT_IP_HEADER = "x-vercel-forwarded-for";
// Shorter values are treated as unconfigured: the trust path stays off (fail closed).
const MIN_SECRET_LENGTH = 32;
const HEADER_NAME = /^[A-Za-z0-9-]+$/;

function trustedIngressHeader(): string | undefined {
  if (process.env.VERCEL === "1") return VERCEL_CLIENT_IP_HEADER;
  // Only for a reverse proxy that overwrites this header itself. Unset = trust nothing.
  const configured = process.env.TRUSTED_CLIENT_IP_HEADER?.trim();
  return configured && HEADER_NAME.test(configured) ? configured : undefined;
}

/** One validated IPv4/IPv6 address from the trusted ingress header, else undefined. */
export function trustedClientIp(headers: Headers): string | undefined {
  const name = trustedIngressHeader();
  const value = name ? headers.get(name) : null;
  // isIP rejects lists, ports, brackets and hostnames; '%' excludes IPv6 zone identifiers.
  if (!value || value.includes("%") || isIP(value) === 0) return undefined;
  return value;
}

function bffSecret(): string | undefined {
  const secret = process.env.BFF_ORIGIN_SECRET;
  return secret && secret.length >= MIN_SECRET_LENGTH && /^[\x21-\x7e]+$/.test(secret)
    ? secret
    : undefined;
}

/**
 * Server-generated headers for the upstream login request. Built from scratch: nothing the browser
 * sent is copied. X-Forwarded-For / X-Real-IP serve direct-to-Spring setups; behind production
 * nginx they are overwritten, and only the secret-authenticated metadata is honoured.
 */
export function loginClientIpHeaders(headers: Headers): Record<string, string> {
  const ip = trustedClientIp(headers);
  if (!ip) return {};
  const secret = bffSecret();
  return {
    "X-Forwarded-For": ip,
    "X-Real-IP": ip,
    ...(secret ? { [BFF_CLIENT_IP_HEADER]: ip, [BFF_SECRET_HEADER]: secret } : {}),
  };
}
