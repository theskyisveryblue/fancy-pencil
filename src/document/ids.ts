const ALPHABET = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

export function generateId(existing?: Set<string>): string {
  for (let attempt = 0; attempt < 10000; attempt += 1) {
    let id = '';
    for (let index = 0; index < 5; index += 1) {
      id += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
    }
    if (!existing || !existing.has(id)) {
      return id;
    }
  }
  throw new Error('pen-clone: unable to generate a unique node id');
}

export function createIdFactory(existing: Set<string>): () => string {
  return () => {
    const id = generateId(existing);
    existing.add(id);
    return id;
  };
}
