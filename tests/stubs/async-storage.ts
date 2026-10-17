// テスト用の AsyncStorage の代わり（メモリ上）。本物は React Native の中でしか動かないので、vitest.config.ts でこれに置き換える。
const data = new Map<string, string>();

const AsyncStorage = {
  getItem: async (key: string) => data.get(key) ?? null,
  setItem: async (key: string, value: string) => {
    data.set(key, value);
  },
  removeItem: async (key: string) => {
    data.delete(key);
  },
  clear: async () => {
    data.clear();
  },
};

export default AsyncStorage;
