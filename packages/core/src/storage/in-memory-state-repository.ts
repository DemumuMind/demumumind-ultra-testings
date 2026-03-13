import type { IdentifiableRecord, StateRepository } from "./state-repository.js";

export class InMemoryStateRepository implements StateRepository {
  private readonly collections = new Map<string, Map<string, unknown>>();

  async put<T extends IdentifiableRecord>(collectionName: string, record: T): Promise<T> {
    const collection = this.getCollection(collectionName);
    collection.set(record.id, structuredClone(record));
    return record;
  }

  async get<T>(collectionName: string, recordId: string): Promise<T | undefined> {
    const collection = this.getCollection(collectionName);
    const record = collection.get(recordId);
    return record ? (structuredClone(record) as T) : undefined;
  }

  async list<T>(collectionName: string): Promise<T[]> {
    const collection = this.getCollection(collectionName);
    return Array.from(collection.values(), (value) => structuredClone(value) as T);
  }

  async delete(collectionName: string, recordId: string): Promise<void> {
    const collection = this.getCollection(collectionName);
    collection.delete(recordId);
  }

  private getCollection(collectionName: string): Map<string, unknown> {
    const existing = this.collections.get(collectionName);

    if (existing) {
      return existing;
    }

    const created = new Map<string, unknown>();
    this.collections.set(collectionName, created);
    return created;
  }
}
