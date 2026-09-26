'use client';

/* Build-status ribbon — one honest pill for the dashboard build surface.
 *
 * The ribbon renders EXACTLY one pill at a time and performs NO fetch of its
 * own: every visible state comes from the parent's props. `Durdur` is
 * LOCAL-ONLY — it calls `onStop`, which halts polling in the parent. It never
 * claims the server-side build stopped, so the stopped state carries the
 * honest sentence `Sunucudaki kurulum devam eder.` next to `Devam et`
 * (which calls `onResume` to re-poll).
 *
 * Phase values reuse the builder allowlist from `builder-progress`
 * (`queued`/`generating`/`syncing`/`live`/`failed`); only the three
 * non-terminal phases count as an active build. Anything else (including
 * `live`, `failed`, `null`, or an unknown string) is not an active build.
 */

export interface BuildStatusRibbonProps {
  phase: string | null;
  streaming: boolean;
  approving: boolean;
  stopped: boolean;
  onStop: () => void;
  onResume: () => void;
}

const ACTIVE_BUILD_PHASES: readonly string[] = ['queued', 'generating', 'syncing'];

function isBuildActive(phase: string | null): boolean {
  return typeof phase === 'string' && ACTIVE_BUILD_PHASES.includes(phase);
}

function resolvePill(
  props: Pick<BuildStatusRibbonProps, 'phase' | 'streaming' | 'approving' | 'stopped'>,
): string {
  if (props.stopped) return 'Durduruldu';
  if (props.approving) return 'Onay gönderiliyor';
  if (isBuildActive(props.phase)) return 'Kurulum sürüyor';
  if (props.streaming) return 'Sohbet yazıyor';
  return 'Hazır';
}

export function BuildStatusRibbon({
  phase,
  streaming,
  approving,
  stopped,
  onStop,
  onResume,
}: BuildStatusRibbonProps): React.JSX.Element {
  const pill = resolvePill({ phase, streaming, approving, stopped });
  const showStop = !stopped && isBuildActive(phase);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <p
        role="status"
        className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium"
      >
        {pill}
      </p>
      {showStop ? (
        <button
          type="button"
          onClick={onStop}
          className="rounded-md border px-2.5 py-0.5 text-xs font-medium"
        >
          Durdur
        </button>
      ) : null}
      {stopped ? (
        <>
          <p className="text-xs">Sunucudaki kurulum devam eder.</p>
          <button
            type="button"
            onClick={onResume}
            className="rounded-md border px-2.5 py-0.5 text-xs font-medium"
          >
            Devam et
          </button>
        </>
      ) : null}
    </div>
  );
}
