"use client";

// Web3Auth v11 — auth is split across three hooks:
//   useWeb3Auth()           → context & web3Auth instance (has .provider)
//   useWeb3AuthConnect()    → connect() / isConnected
//   useWeb3AuthDisconnect() → disconnect()
import { createContext, useContext, useEffect, useState } from "react";
import { Web3AuthProvider as W3AProvider } from "@web3auth/modal/react";
import {
  useWeb3Auth as useW3A,
  useWeb3AuthConnect,
  useWeb3AuthDisconnect,
} from "@web3auth/modal/react";
import { web3AuthConfig } from "@/lib/web3auth";
import { makeWalletClient } from "@/lib/viem-client";
import type { WalletClient } from "viem";

interface Web3AuthContextValue {
  address: string | null;
  walletClient: WalletClient | null;
  isConnected: boolean;
  isReady: boolean;
  initError: unknown;
  addressError: string | null; // diagnostic only — surfaced in the UI while this keeps breaking
  isDev: boolean; // true when running the no-Web3Auth local dev bypass (mock wallet, no on-chain)
  login: () => Promise<boolean>; // returns true if user completed auth
  logout: () => Promise<void>;
}

const Web3AuthContext = createContext<Web3AuthContextValue>({
  address: null,
  walletClient: null,
  isConnected: false,
  isReady: false,
  initError: null,
  addressError: null,
  isDev: false,
  login: async () => false,
  logout: async () => {},
});

type Eip1193Provider = { request: (args: { method: string }) => Promise<unknown> };

// Tries eth_requestAccounts first — some providers only populate eth_accounts
// for a caller that has itself requested access at least once in this JS
// context, even if the underlying wallet session is already authorized.
async function resolveAddressOnce(rawProvider: unknown): Promise<{ address: string | null; error: string | null }> {
  const eip1193 = rawProvider as Eip1193Provider;
  let lastError: string | null = null;
  for (const method of ["eth_requestAccounts", "eth_accounts"]) {
    try {
      const accounts = (await eip1193.request({ method })) as string[];
      if (accounts?.[0]) return { address: accounts[0], error: null };
    } catch (err) {
      lastError = `${method}: ${err instanceof Error ? err.message : String(err)}`;
      console.error(`Web3Auth ${method} failed`, err);
    }
  }
  return { address: null, error: lastError };
}

// Web3Auth's MPC key reconstruction can still be finishing for a moment
// after `connect()` resolves / `isConnected` flips true, so a single
// immediate request can legitimately come back with zero accounts and no
// error. Retry with backoff before giving up.
async function resolveAddressWithRetry(rawProvider: unknown, attempts = 6, delayMs = 500): Promise<{ address: string | null; error: string | null }> {
  let lastError: string | null = null;
  for (let i = 0; i < attempts; i++) {
    const { address, error } = await resolveAddressOnce(rawProvider);
    if (address) return { address, error: null };
    lastError = error;
    if (i < attempts - 1) await new Promise((r) => setTimeout(r, delayMs));
  }
  return { address: null, error: lastError };
}

function InnerProvider({ children }: { children: React.ReactNode }) {
  const { isInitialized, isConnected, connection, initError } = useW3A();
  const { connect } = useWeb3AuthConnect();
  const { disconnect } = useWeb3AuthDisconnect();
  const [address, setAddress] = useState<string | null>(null);
  const [addressError, setAddressError] = useState<string | null>(null);

  // Per Web3Auth v11's migration notes, the connected EVM provider lives on
  // `connection.ethereumProvider` from the hook — not `web3Auth.provider`,
  // which doesn't reliably reflect the active connection for custom chains.
  const provider = connection?.ethereumProvider ?? null;
  const walletClient: WalletClient | null = provider ? makeWalletClient(provider) : null;

  // Rehydration path: covers loading the app with an already-persisted
  // Web3Auth session (isConnected flips true without our own login() call
  // running). Keyed on `isConnected` too, not just `provider` — Web3Auth can
  // mutate the connection object in place rather than handing back a new
  // reference on connect.
  useEffect(() => {
    if (!isConnected || !provider) {
      setAddress(null);
      setAddressError(null);
      return;
    }

    let cancelled = false;
    resolveAddressWithRetry(provider).then(({ address: addr, error }) => {
      if (cancelled) return;
      setAddress(addr);
      setAddressError(error);
    });
    return () => { cancelled = true; };
  }, [isConnected, provider]); // eslint-disable-line react-hooks/exhaustive-deps

  async function login(): Promise<boolean> {
    // Already have a live session (persisted from a previous visit, or the
    // connector is already connected). Calling connect() again throws
    // "WalletLoginError: Already connected", so resolve from the existing
    // provider and treat it as a successful login instead of re-connecting.
    if (isConnected && provider) {
      const { address: addr, error } = await resolveAddressWithRetry(provider);
      setAddress(addr);
      setAddressError(error);
      return addr !== null;
    }

    try {
      const conn = await connect();
      if (!conn?.ethereumProvider) return false;
      // Resolve directly from the just-returned provider instead of waiting on
      // the reactive effect above — removes a whole class of "connected but
      // address never resolved" timing races.
      const { address: addr, error } = await resolveAddressWithRetry(conn.ethereumProvider);
      setAddress(addr);
      setAddressError(error);
      return addr !== null;
    } catch (err) {
      // Guard above can miss a session that raced into existence (or one the
      // SDK holds while our React `isConnected` is briefly stale). In that
      // case connect() throws "Already connected" — recover by reading the
      // current provider rather than surfacing a scary error to the user.
      const message = err instanceof Error ? err.message : String(err);
      const activeProvider = provider ?? connection?.ethereumProvider ?? null;
      if (/already connected/i.test(message) && activeProvider) {
        const { address: addr, error } = await resolveAddressWithRetry(activeProvider);
        setAddress(addr);
        setAddressError(error);
        return addr !== null;
      }
      throw err;
    }
  }

  return (
    <Web3AuthContext.Provider
      value={{
        address,
        walletClient,
        isConnected,
        isReady: isInitialized,
        initError,
        addressError,
        isDev: false,
        login,
        logout: () => disconnect(),
      }}
    >
      {children}
    </Web3AuthContext.Provider>
  );
}

// ── Local dev bypass ─────────────────────────────────────────────────────────
// When no Web3Auth clientId is configured (i.e. local dev without external
// keys), the real SDK can't init and the login button is stuck disabled
// forever. Instead of a dead app, hand out a mock wallet so the whole
// off-chain game loop (Convex scoring, leaderboards, streaks) is playable.
// walletClient stays null, so every on-chain path (score submission, hints,
// staking, registration) gracefully no-ops — those need a real wallet + keys.
// This branch is impossible in production because setting a clientId disables it.
const DEV_ADDRESS =
  (process.env.NEXT_PUBLIC_DEV_WALLET_ADDRESS as string | undefined) ??
  "0x1111111111111111111111111111111111111111";
const DEV_AUTH_KEY = "goodtrip-dev-auth";

function DevAuthProvider({ children }: { children: React.ReactNode }) {
  // This provider only renders client-side (Providers.tsx loads it with
  // ssr:false), so reading localStorage in the initializer is safe and avoids
  // a first-render flash that would bounce a "logged in" user off /play.
  const [isConnected, setIsConnected] = useState<boolean>(
    () => typeof window !== "undefined" && window.localStorage.getItem(DEV_AUTH_KEY) === "1"
  );

  useEffect(() => {
    console.warn(
      "[GoodTrip] Web3Auth not configured — running local DEV auth bypass with a mock wallet " +
        `(${DEV_ADDRESS}). On-chain features are disabled. Set NEXT_PUBLIC_WEB3AUTH_CLIENT_ID to use real login.`
    );
  }, []);

  async function login(): Promise<boolean> {
    window.localStorage.setItem(DEV_AUTH_KEY, "1");
    setIsConnected(true);
    return true;
  }

  async function logout(): Promise<void> {
    window.localStorage.removeItem(DEV_AUTH_KEY);
    setIsConnected(false);
  }

  return (
    <Web3AuthContext.Provider
      value={{
        address: isConnected ? DEV_ADDRESS : null,
        walletClient: null,
        isConnected,
        isReady: true,
        initError: null,
        addressError: null,
        isDev: true,
        login,
        logout,
      }}
    >
      {children}
    </Web3AuthContext.Provider>
  );
}

export function Web3AuthProvider({ children }: { children: React.ReactNode }) {
  // No clientId → local dev bypass (mock wallet). Setting a clientId in the
  // env switches to the real Web3Auth SDK and disables the bypass entirely.
  if (!process.env.NEXT_PUBLIC_WEB3AUTH_CLIENT_ID) {
    return <DevAuthProvider>{children}</DevAuthProvider>;
  }

  return (
    <W3AProvider config={web3AuthConfig}>
      <InnerProvider>{children}</InnerProvider>
    </W3AProvider>
  );
}

export function useWeb3Auth() {
  return useContext(Web3AuthContext);
}
