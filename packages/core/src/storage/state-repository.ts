export interface IdentifiableRecord {
  id: string;
}

export interface StateRepository {
  put<T extends IdentifiableRecord>(collectionName: string, record: T): Promise<T>;
  get<T>(collectionName: string, recordId: string): Promise<T | undefined>;
  list<T>(collectionName: string): Promise<T[]>;
  delete(collectionName: string, recordId: string): Promise<void>;
}

