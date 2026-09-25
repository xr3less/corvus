// Trial-only workaround: the local ISP resolver returns a blackholed IP for
// discord.com and NXDOMAIN for gateway.discord.gg (verified 2026-09-20).
// Resolve via public DNS first; fall back to the OS resolver on failure.
import dns from 'node:dns';

dns.setServers(['8.8.8.8', '8.8.4.4']);

type SingleAddressCallback = (
  err: NodeJS.ErrnoException | null,
  address: string,
  family: number,
) => void;

type AllAddressesCallback = (
  err: NodeJS.ErrnoException | null,
  addresses: dns.LookupAddress[],
) => void;

type LookupCallback = SingleAddressCallback | AllAddressesCallback;

// Captured before patching. Always invoked with (hostname, options, callback)
// so only one overload shape needs a type here.
const originalLookup = dns.lookup.bind(dns) as unknown as (
  hostname: string,
  options: dns.LookupOptions | number,
  callback: LookupCallback,
) => void;

function patchedLookup(
  hostname: string,
  options: dns.LookupOptions | number,
  callback: LookupCallback,
): void {
  const wantsAll = typeof options === 'object' && options !== null && options.all === true;
  dns.resolve4(hostname, (err, addresses) => {
    const first = err === null ? addresses[0] : undefined;
    if (first !== undefined) {
      if (wantsAll) {
        (callback as AllAddressesCallback)(null, [{ address: first, family: 4 }]);
        return;
      }
      (callback as SingleAddressCallback)(null, first, 4);
      return;
    }
    originalLookup(hostname, options, callback);
  });
}

// dns.lookup has overloads (options-or-callback, numeric family); normalize
// args then delegate. The original options object is passed through untouched
// so all:true / family / verbatim / hints survive on the fallback path.
const lookupWithFallback = (
  hostname: string,
  optionsOrCallback: dns.LookupOptions | number | LookupCallback,
  maybeCallback?: LookupCallback,
): void => {
  const isCallbackStyle = typeof optionsOrCallback === 'function';
  const callback = (isCallbackStyle ? optionsOrCallback : maybeCallback) as LookupCallback;
  const options = (isCallbackStyle ? {} : optionsOrCallback) as dns.LookupOptions | number;
  patchedLookup(hostname, options, callback);
};

(dns as unknown as { lookup: unknown }).lookup = lookupWithFallback;

export {};
