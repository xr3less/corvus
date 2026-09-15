/*
 * pick/variants.tsx — DEV-ONLY component picker variants.
 *
 * Every input style below is an ORIGINAL hand-written implementation. The
 * "shadcn-style" label names a visual rhythm (bordered field + accent focus
 * ring) popularized by shadcn/ui, which is MIT licensed. Zero bytes were
 * copied from shadcn/ui or any other project; only the idea of the rhythm
 * crosses over — same rule as D-049/D-051 ("idea crosses over, bytes do not").
 *
 * No external file was read or ported to build these. All styling lives in
 * pick.css, scoped under .pick-root.
 */
import type { ReactElement } from 'react';
import { Search } from 'lucide-react';

export const PICK_PLACEHOLDER = 'Deneme yazısı yaz…';

export type PickVariantOrigin = 'shadcn-style' | 'ours';

export interface PickVariant {
  id: string;
  name: string;
  origin: PickVariantOrigin;
  render: () => ReactElement;
}

export const VARIANTS: readonly PickVariant[] = [
  {
    id: 'shadcn-default',
    name: 'Klasik çerçeve',
    origin: 'shadcn-style',
    render: () => (
      <input
        type="text"
        className="pick-input pick-v-shadcn"
        placeholder={PICK_PLACEHOLDER}
        aria-label="Klasik çerçeve"
      />
    ),
  },
  {
    id: 'underline',
    name: 'Alt çizgi',
    origin: 'ours',
    render: () => (
      <input
        type="text"
        className="pick-input pick-v-underline"
        placeholder={PICK_PLACEHOLDER}
        aria-label="Alt çizgi"
      />
    ),
  },
  {
    id: 'filled',
    name: 'Dolgulu',
    origin: 'ours',
    render: () => (
      <input
        type="text"
        className="pick-input pick-v-filled"
        placeholder={PICK_PLACEHOLDER}
        aria-label="Dolgulu"
      />
    ),
  },
  {
    id: 'pill',
    name: 'Yuvarlak',
    origin: 'ours',
    render: () => (
      <input
        type="text"
        className="pick-input pick-v-pill"
        placeholder={PICK_PLACEHOLDER}
        aria-label="Yuvarlak"
      />
    ),
  },
  {
    id: 'floating-label',
    name: 'Üstte etiket',
    origin: 'ours',
    render: () => (
      <label className="pick-field">
        <span className="pick-float-label">Sunucu adı</span>
        <input
          type="text"
          className="pick-input pick-v-shadcn"
          placeholder={PICK_PLACEHOLDER}
          aria-label="Üstte etiket"
        />
      </label>
    ),
  },
  {
    id: 'icon-left',
    name: 'İkonlu',
    origin: 'ours',
    render: () => (
      <div className="pick-icon-row">
        <Search className="pick-icon" size={16} aria-hidden="true" />
        <input
          type="text"
          className="pick-input pick-v-icon"
          placeholder={PICK_PLACEHOLDER}
          aria-label="İkonlu"
        />
      </div>
    ),
  },
  {
    id: 'large',
    name: 'Geniş konforlu',
    origin: 'ours',
    render: () => (
      <input
        type="text"
        className="pick-input pick-v-large"
        placeholder={PICK_PLACEHOLDER}
        aria-label="Geniş konforlu"
      />
    ),
  },
  {
    id: 'mono',
    name: 'Kod kutusu',
    origin: 'ours',
    render: () => (
      <input
        type="text"
        className="pick-input pick-v-mono"
        placeholder={PICK_PLACEHOLDER}
        aria-label="Kod kutusu"
      />
    ),
  },
  {
    id: 'corvus-panel',
    name: 'Corvus paneli',
    origin: 'ours',
    render: () => (
      <input
        type="text"
        className="pick-input pick-v-corvus"
        placeholder={PICK_PLACEHOLDER}
        aria-label="Corvus paneli"
      />
    ),
  },
  {
    id: 'faint',
    name: 'Silik çizgi',
    origin: 'ours',
    render: () => (
      <input
        type="text"
        className="pick-input pick-v-faint"
        placeholder={PICK_PLACEHOLDER}
        aria-label="Silik çizgi"
      />
    ),
  },
];
