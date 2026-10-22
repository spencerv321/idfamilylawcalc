import type { FormBytes } from './forms';

let cache: Promise<FormBytes> | null = null;

/** The official forms ship with the app (public/forms/), so this never leaves the site's own origin. */
export function loadForms(): Promise<FormBytes> {
  const get = async (name: string) => {
    const res = await fetch(`${import.meta.env.BASE_URL}forms/${name}.pdf`);
    if (!res.ok) throw new Error(`Could not load ${name}.pdf (${res.status}).`);
    return new Uint8Array(await res.arrayBuffer());
  };
  cache ??= Promise.all([get('form5'), get('form6'), get('form7')])
    .then(([form5, form6, form7]) => ({ form5, form6, form7 }))
    .catch((e) => {
      cache = null;
      throw e;
    });
  return cache;
}
