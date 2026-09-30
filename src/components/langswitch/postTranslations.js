// The open post's translations, for the language switcher (FE-14 step 8).
//
// The switcher sits in the header, outside the routed page, so it cannot
// read BlogPost's data directly. BlogPost publishes { lang, slug,
// translations } here while a post is on screen; the switcher subscribes.
// A tiny external store instead of a context provider: the provider would
// have to wrap the header in App.jsx. Once the blog moves to swr (FE-12,
// W5), the switcher can read usePost(slug)'s cache instead and this module
// goes away. Nothing here is persisted (T-12: no remembered preference).
import { useEffect, useSyncExternalStore } from "react";

let current = null;
const listeners = new Set();

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const getSnapshot = () => current;
// On the server no post has been published (effects do not run there).
const getServerSnapshot = () => null;

export function setPostTranslations(entry) {
  if (entry === current) return;
  current = entry;
  emit();
}

// { lang, slug, translations: [{ lang, slug }] } of the post on screen, or
// null while no post is shown.
export function usePostTranslations() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

// Called by BlogPost with the loaded post (or null while loading). The entry
// is withdrawn when the post leaves the screen.
export function usePublishPostTranslations(post) {
  const lang = post?.lang ?? null;
  const slug = post?.slug ?? null;
  const translations = post?.translations;
  // Serialised so a refetch with the same data does not re-publish.
  const key = JSON.stringify(Array.isArray(translations) ? translations : []);

  useEffect(() => {
    if (!lang || !slug) return undefined;
    const entry = Object.freeze({
      lang,
      slug,
      translations: Object.freeze(JSON.parse(key)),
    });
    setPostTranslations(entry);
    return () => {
      if (current === entry) setPostTranslations(null);
    };
  }, [lang, slug, key]);
}
