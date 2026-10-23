// A stand-in for next/headers in action tests: one browser at a time.
import { SESSION_COOKIE, signSession } from "@/lib/session";

export const jar = {
  cookies: new Map<string, string>(),
  ip: "10.0.0.1",
};

/** A fresh device with no cookies. */
export function newDevice(ip = "10.0.0." + Math.floor(Math.random() * 250 + 1)) {
  jar.cookies.clear();
  jar.ip = ip;
}

/** A device signed in as `personId`. */
export function signedIn(personId: string) {
  newDevice();
  jar.cookies.set(SESSION_COOKIE, signSession(personId, process.env.SESSION_SECRET!));
}

/** Reads see the jar as it was when cookies() was called, like a request does. */
export function cookiesMock() {
  const snap = new Map(jar.cookies);
  return {
    get: (name: string) => (snap.has(name) ? { name, value: snap.get(name)! } : undefined),
    set: (name: string, value: string) => void jar.cookies.set(name, value),
    delete: (name: string) => void jar.cookies.delete(name),
    has: (name: string) => snap.has(name),
  };
}

export function headersMock() {
  return new Headers({ "x-forwarded-for": jar.ip });
}
