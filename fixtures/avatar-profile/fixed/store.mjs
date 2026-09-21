export function createStore() {
  const records = new Map();
  return {
    save(userId, bytes, contentType) {
      records.set(userId, { bytes, contentType });
    },
    get(userId) {
      return records.get(userId) ?? null;
    },
  };
}
