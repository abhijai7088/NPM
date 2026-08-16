import { create } from 'zustand';

interface AppState {
  lang: 'en' | 'hi';
  setLang: (lang: 'en' | 'hi') => void;
}

export const useAppStore = create<AppState>((set) => ({
  lang: 'en',
  setLang: (lang) => set({ lang }),
}));
