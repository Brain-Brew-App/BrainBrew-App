/**
 * RevenueCatService (Phase 7E) — the ONLY place the app talks to the purchase SDK.
 *
 * Screens never call the SDK directly; they call this. It depends on a
 * `PurchasesAdapter` (injected), so all of its logic — single-init, single-flight
 * purchases, identity continuity, offering mapping, error normalization — is
 * unit-tested with a fake adapter and never needs a real store.
 *
 * Authority boundary: RevenueCat customer info updates UI quickly, but it is
 * NEVER the sole authority for a protected server feature. The server's
 * synchronized `get_my_entitlements` remains authoritative — this service only
 * drives the store flow and fast, optimistic status.
 */

import type { PurchasesAdapter, RcErrorLike } from './adapter';
import { mapCurrentOffering } from './offerings';
import { storeModeFor, unavailableFor, validateOfferingForMode, type StoreMode } from './storeMode';
import type {
  CustomerState, OfferingContract, OfferingUnavailable, PurchaseOutcome, RestoreOutcome,
} from './types';

export interface RevenueCatServiceDeps {
  adapter: PurchasesAdapter;
  apiKey: string;
  /** Maps a raw RevenueCat CustomerInfo to "is our entitlement active?". */
  hasPremium: (rawCustomerInfo: unknown) => boolean;
  isDev: boolean;
}

export interface RevenueCatService {
  /** Safe diagnostics: the store mode name only — never the key. */
  storeMode(): StoreMode;
  configure(userId: string): Promise<void>;
  logIn(userId: string): Promise<void>;
  logOutOrSwitch(): Promise<void>;
  getOfferings(): Promise<{ offering: OfferingContract } | { unavailable: OfferingUnavailable }>;
  getCustomerState(): Promise<CustomerState>;
  purchase(packageId: string): Promise<PurchaseOutcome>;
  restore(): Promise<RestoreOutcome>;
  addListener(cb: (state: CustomerState) => void): () => void;
  currentUserId(): string | null;
}

function normalizeError(e: unknown): 'store_error' | 'network' | 'conflict' | 'unsupported' | 'config' {
  const err = e as RcErrorLike;
  const msg = `${err?.message ?? ''} ${err?.underlyingErrorMessage ?? ''}`.toLowerCase();
  if (/already in use|receipt.*in use|different user/.test(msg)) return 'conflict';
  if (/network|offline|timeout|connection/.test(msg)) return 'network';
  if (/not.?support|unavailable in|not configured/.test(msg)) return 'unsupported';
  if (/api key|configuration|invalid credentials/.test(msg)) return 'config';
  return 'store_error';
}

export function createRevenueCatService(deps: RevenueCatServiceDeps): RevenueCatService {
  const { adapter, apiKey, hasPremium, isDev } = deps;

  let configured = false;
  let userId: string | null = null;
  // Purchase single-flight: a second tap returns the SAME in-flight promise.
  let purchaseInFlight: Promise<PurchaseOutcome> | null = null;
  // packageId → raw RevenueCat package, so screens purchase by our safe id.
  let rawPackages = new Map<string, unknown>();

  const toState = (raw: unknown): CustomerState => ({
    premiumActive: hasPremium(raw),
    appUserId: userId,
  });

  const mode = storeModeFor(apiKey); // derived from the key PREFIX; key never stored elsewhere

  return {
    currentUserId: () => userId,
    storeMode: () => mode,

    async configure(id: string) {
      if (configured && userId === id) return; // single init per identity
      adapter.setLogLevelVerbose(isDev);
      await adapter.configure(apiKey, id);
      configured = true;
      userId = id;
      // Safe diagnostic: mode NAME + a short id prefix. Never the key, never the
      // full App User ID (which is the player's auth UUID).
      if (isDev) console.log(`[revenuecat] configured mode=${mode} appUserIdPrefix=${id.slice(0, 8)}…`);
    },

    async logIn(id: string) {
      if (!configured) { await this.configure(id); return; }
      if (userId === id) return;
      await adapter.logIn(id);
      userId = id;
      rawPackages = new Map(); // never carry one user's offering cache to another
    },

    async logOutOrSwitch() {
      // Clear identity + caches; the next configure/logIn attaches the new user.
      if (configured) await adapter.logOut();
      userId = null;
      rawPackages = new Map();
      purchaseInFlight = null;
    },

    async getOfferings() {
      try {
        const raw = await adapter.getOfferings();
        const offering = mapCurrentOffering(raw);

        // Environment-specific catalogue check. The package→product mapping decides
        // what the user is actually charged for, so a Play product in a Test Store
        // build (or vice versa) is rejected, not rendered.
        const check = validateOfferingForMode(offering, mode);
        if (!check.ok) {
          // Safe to log: offering/package/product ids are public catalogue names.
          if (isDev) console.warn(`[revenuecat] offering rejected (${mode}/${check.reason}): ${check.detail}`);
          return { unavailable: unavailableFor(check.reason) as OfferingUnavailable };
        }
        if (isDev) {
          console.log(`[revenuecat] mode=${mode} offering=${check.offering.offeringId} monthly=${check.monthly.productId} annual=${check.annual.productId}`);
        }
        rawPackages = new Map();
        // Re-associate each mapped package id with its raw package for purchase.
        const current = (raw as { current?: { availablePackages?: unknown[] } })?.current;
        for (const pkg of current?.availablePackages ?? []) {
          const pid = (pkg as { identifier?: string })?.identifier;
          if (pid) rawPackages.set(pid, pkg);
        }
        return { offering: check.offering };
      } catch {
        return { unavailable: 'store_unavailable' as OfferingUnavailable };
      }
    },

    async getCustomerState() {
      const raw = await adapter.getCustomerInfo();
      return toState(raw);
    },

    async purchase(packageId: string) {
      if (purchaseInFlight) return purchaseInFlight; // collapse duplicate taps
      const raw = rawPackages.get(packageId);
      if (!raw) return { status: 'error', code: 'config' };

      purchaseInFlight = (async (): Promise<PurchaseOutcome> => {
        try {
          const { customerInfo, userCancelled } = await adapter.purchasePackage(raw);
          if (userCancelled) return { status: 'cancelled' }; // cancellation is NOT an error
          return hasPremium(customerInfo) ? { status: 'purchased' } : { status: 'pending' };
        } catch (e) {
          const code = normalizeError(e);
          if (code === 'conflict') return { status: 'error', code: 'conflict' };
          return { status: 'error', code: code === 'network' ? 'network' : code === 'unsupported' ? 'unsupported' : code === 'config' ? 'config' : 'store_error' };
        } finally {
          purchaseInFlight = null;
        }
      })();
      return purchaseInFlight;
    },

    async restore() {
      try {
        const info = await adapter.restorePurchases();
        return hasPremium(info) ? { status: 'restored' } : { status: 'nothing_to_restore' };
      } catch (e) {
        const code = normalizeError(e);
        if (code === 'conflict') return { status: 'conflict' };
        return { status: 'error', code: code === 'network' ? 'network' : code === 'unsupported' ? 'unsupported' : 'store_error' };
      }
    },

    addListener(cb: (state: CustomerState) => void) {
      return adapter.addCustomerInfoUpdateListener((raw) => cb(toState(raw)));
    },
  };
}
