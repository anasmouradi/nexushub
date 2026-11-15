"use client";

import { useSyncExternalStore } from "react";

function subscribe(callback: () => void) {
  window.addEventListener("popstate", callback);
  return () => window.removeEventListener("popstate", callback);
}

function getSnapshot() {
  return window.location.search;
}

function getServerSnapshot() {
  return "";
}

export function useUrlSearch() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
