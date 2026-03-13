import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { IdentifiableRecord, StateRepository } from "./state-repository.js";

interface FileStateRepositoryOptions {
  dataDirectory: string;
}

export class FileStateRepository implements StateRepository {
  private readonly collectionWrites = new Map<string, Promise<void>>();

  constructor(private readonly options: FileStateRepositoryOptions) {}

  async put<T extends IdentifiableRecord>(collectionName: string, record: T): Promise<T> {
    await this.withCollectionWrite(collectionName, async () => {
      const collection = await this.readCollection<T>(collectionName);
      const nextCollection = collection.filter((item) => item.id !== record.id);
      nextCollection.push(record);
      await this.writeCollection(collectionName, nextCollection);
    });

    return record;
  }

  async get<T>(collectionName: string, recordId: string): Promise<T | undefined> {
    await this.awaitPendingWrite(collectionName);
    const collection = await this.readCollection<T & IdentifiableRecord>(collectionName);
    return collection.find((item) => item.id === recordId);
  }

  async list<T>(collectionName: string): Promise<T[]> {
    await this.awaitPendingWrite(collectionName);
    return this.readCollection<T>(collectionName);
  }

  async delete(collectionName: string, recordId: string): Promise<void> {
    await this.withCollectionWrite(collectionName, async () => {
      const collection = await this.readCollection<IdentifiableRecord>(collectionName);
      await this.writeCollection(
        collectionName,
        collection.filter((item) => item.id !== recordId)
      );
    });
  }

  private async readCollection<T>(collectionName: string): Promise<T[]> {
    const filePath = this.collectionPath(collectionName);

    try {
      const raw = await readFile(filePath, "utf8");
      return JSON.parse(raw) as T[];
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return [];
      }

      throw error;
    }
  }

  private async writeCollection<T>(collectionName: string, collection: T[]): Promise<void> {
    await mkdir(this.options.dataDirectory, {
      recursive: true
    });
    await writeFile(this.collectionPath(collectionName), JSON.stringify(collection, null, 2), "utf8");
  }

  private async withCollectionWrite(collectionName: string, operation: () => Promise<void>): Promise<void> {
    const previousWrite = this.collectionWrites.get(collectionName) ?? Promise.resolve();
    const nextWrite = previousWrite.then(operation, operation);
    const trackedWrite = nextWrite.finally(() => {
      if (this.collectionWrites.get(collectionName) === trackedWrite) {
        this.collectionWrites.delete(collectionName);
      }
    });

    this.collectionWrites.set(collectionName, trackedWrite);
    await trackedWrite;
  }

  private async awaitPendingWrite(collectionName: string): Promise<void> {
    await (this.collectionWrites.get(collectionName) ?? Promise.resolve());
  }

  private collectionPath(collectionName: string): string {
    return join(this.options.dataDirectory, `${collectionName}.json`);
  }
}
