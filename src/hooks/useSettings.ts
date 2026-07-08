import { useState, useCallback, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { type SettingsState } from "../store/settings";
import { loadSettings, setSetting } from "../store/settings";

let _loaded = false;
let _cache: SettingsState | null = null;
const _listeners = new Set<(key: string, value: unknown) => void>();

function emit<K extends keyof SettingsState>(key: K, value: SettingsState[K]) {
  _listeners.forEach(f => f(key as string, value));
}

export function useSettings() {
  const [settings, setSettings] = useState<SettingsState | null>(null);

  useEffect(() => {
    (async () => {
      if (!_loaded || !_cache) {
        _cache = await loadSettings();
        _loaded = true;
      }
      setSettings({ ..._cache });
    })();
    return subscribe((key, value) => {
      setSettings(prev => prev ? { ...prev, [key]: value } as SettingsState : null);
    });
  }, []);

  const getAll = useCallback(async (): Promise<SettingsState> => {
    const s = await loadSettings();
    _cache = s;
    _loaded = true;
    setSettings({ ...s });
    return s;
  }, []);

  const get = useCallback(<K extends keyof SettingsState>(key: K): SettingsState[K] => {
    return (_cache?.[key] ?? null) as SettingsState[K];
  }, []);

  const set = useCallback(async <K extends keyof SettingsState>(key: K, value: SettingsState[K]) => {
    _cache = { ..._cache!, [key]: value };
    emit(key, value);
    await setSetting(key, value);
  }, []);

  const subscribe = useCallback((fn: (key: string, value: unknown) => void) => {
    _listeners.add(fn);
    return () => { _listeners.delete(fn); };
  }, []);

  return { settings, getAll, get, set, subscribe };
}

/** Listen to a specific key and call onChange when it changes */
export function useSettingsValue<K extends keyof SettingsState>(
  key: K,
  onChange: (value: SettingsState[K]) => void,
) {
  const { subscribe } = useSettings();
  useEffect(() => {
    // Use async loadSettings so we don't depend on _cache being already loaded
    loadSettings().then(s => {
      if (s[key] !== undefined) onChange(s[key]);
    });
    return subscribe((k, v) => {
      if (k === key) onChange(v as SettingsState[K]);
    });
  }, [key]);
}

export function useSpeed() {
  const { set } = useSettings();
  const [speed, setSpeed] = useState(1.0);
  useSettingsValue("speed", v => setSpeed(v as number));

  // Sync saved speed to bridge on startup
  useEffect(() => {
    invoke<number | null>("bridge_get_speed").then(current => {
      loadSettings().then(s => {
        if (s.speed && current !== s.speed) {
          invoke("bridge_set_speed", { factor: s.speed });
        }
      });
    });
  }, []);

  const updateSpeed = useCallback((s: number) => {
    setSpeed(s);
  }, []);

  const commitSpeed = useCallback(async (s: number) => {
    setSpeed(s);
    await invoke("bridge_set_speed", { factor: s });
    await set("speed", s);
  }, [set]);

  return { speed, setSpeed: updateSpeed, commitSpeed };
}
