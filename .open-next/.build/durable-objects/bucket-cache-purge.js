globalThis.openNextDebug = false;globalThis.openNextVersion = "4.1.14";globalThis.nextVersion = "16.3.6";

// node_modules/.pnpm/@opennextjs+cloudflare@1.20.15_next@16.3.6_@types+node@22.10.2_react-dom@19.2.8_react@1_cabdf961fac015b81fc4abb24b3d24d3/node_modules/@opennextjs/cloudflare/dist/api/durable-objects/bucket-cache-purge.js
import { DurableObject } from "cloudflare:workers";

// node_modules/.pnpm/@opennextjs+aws@4.1.14_next@16.3.6_@types+node@22.10.2_react-dom@19.2.8_react@19.2.8__react@19.2.8_/node_modules/@opennextjs/aws/dist/utils/error.js
function isOpenNextError(e) {
  try {
    return "__openNextInternal" in e;
  } catch {
    return false;
  }
}

// node_modules/.pnpm/@opennextjs+aws@4.1.14_next@16.3.6_@types+node@22.10.2_react-dom@19.2.8_react@19.2.8__react@19.2.8_/node_modules/@opennextjs/aws/dist/adapters/logger.js
function debug(...args) {
  if (globalThis.openNextDebug) {
    console.log(...args);
  }
}
function warn(...args) {
  console.warn(...args);
}
var DOWNPLAYED_ERROR_LOGS = [
  {
    clientName: "S3Client",
    commandName: "GetObjectCommand",
    errorName: "NoSuchKey"
  }
];
var isDownplayedErrorLog = (errorLog) => DOWNPLAYED_ERROR_LOGS.some((downplayedInput) => downplayedInput.clientName === errorLog?.clientName && downplayedInput.commandName === errorLog?.commandName && (downplayedInput.errorName === errorLog?.error?.name || downplayedInput.errorName === errorLog?.error?.Code));
function error(...args) {
  if (args.some((arg) => isDownplayedErrorLog(arg))) {
    return debug(...args);
  }
  if (args.some((arg) => isOpenNextError(arg))) {
    const error2 = args.find((arg) => isOpenNextError(arg));
    if (error2.logLevel < getOpenNextErrorLogLevel()) {
      return;
    }
    if (error2.logLevel === 0) {
      return console.log(...args.map((arg) => isOpenNextError(arg) ? `${arg.name}: ${arg.message}` : arg));
    }
    if (error2.logLevel === 1) {
      return warn(...args.map((arg) => isOpenNextError(arg) ? `${arg.name}: ${arg.message}` : arg));
    }
    return console.error(...args);
  }
  console.error(...args);
}
function getOpenNextErrorLogLevel() {
  const strLevel = process.env.OPEN_NEXT_ERROR_LOG_LEVEL ?? "1";
  switch (strLevel.toLowerCase()) {
    case "debug":
    case "0":
      return 0;
    case "error":
    case "2":
      return 2;
    default:
      return 1;
  }
}

// node_modules/.pnpm/@opennextjs+cloudflare@1.20.15_next@16.3.6_@types+node@22.10.2_react-dom@19.2.8_react@1_cabdf961fac015b81fc4abb24b3d24d3/node_modules/@opennextjs/cloudflare/dist/api/overrides/internal.js
var debugCache = (name, ...args) => {
  if (process.env.NEXT_PRIVATE_DEBUG_CACHE) {
    console.log(`[${name}] `, ...args);
  }
};
async function requestPurgeCacheByTags(env, tags) {
  if (!env.CACHE_PURGE_ZONE_ID || !env.CACHE_PURGE_API_TOKEN) {
    return {
      status: "missing-credentials",
      message: "No cache zone ID or API token provided. Skipping cache purge."
    };
  }
  let response;
  try {
    response = await fetch(`https://api.cloudflare.com/client/v4/zones/${env.CACHE_PURGE_ZONE_ID}/purge_cache`, {
      headers: {
        Authorization: `Bearer ${env.CACHE_PURGE_API_TOKEN}`,
        "Content-Type": "application/json"
      },
      method: "POST",
      body: JSON.stringify({
        tags
      })
    });
    if (response.status === 429) {
      return { status: "rate-limit-exceeded", message: "purgeCacheByTags: Rate limit exceeded." };
    }
    const bodyResponse = await response.json();
    if (!bodyResponse.success) {
      return {
        status: "purge-failed",
        message: `purgeCacheByTags: Cache purge failed. Errors: ${bodyResponse.errors.map((error2) => `${error2.code}: ${error2.message}`).join(", ")}`
      };
    }
    debugCache("purgeCacheByTags", "Cache purged successfully for tags:", tags);
    return { status: "purge-success" };
  } catch (e) {
    return { status: "purge-failed", message: `Error purging cache by tags: ${e}` };
  } finally {
    try {
      await response?.body?.cancel();
    } catch {
    }
  }
}
async function internalPurgeCacheByTags(env, tags) {
  const result = await requestPurgeCacheByTags(env, tags);
  if (result.status !== "purge-success") {
    error(result.message);
  }
  return result.status;
}

// node_modules/.pnpm/@opennextjs+cloudflare@1.20.15_next@16.3.6_@types+node@22.10.2_react-dom@19.2.8_react@1_cabdf961fac015b81fc4abb24b3d24d3/node_modules/@opennextjs/cloudflare/dist/api/durable-objects/bucket-cache-purge.js
var DEFAULT_BUFFER_TIME_IN_SECONDS = 5;
var MAX_NUMBER_OF_TAGS_PER_PURGE = 100;
var BucketCachePurgeBase = class extends DurableObject {
  /**
   * Delay before the first buffered purge batch is processed.
   *
   * This uses `NEXT_CACHE_DO_PURGE_BUFFER_TIME_IN_SECONDS` when configured and
   * defaults to five seconds.
   */
  bufferTimeInSeconds;
  storageInitialization;
  /**
   * Creates a cache purge Durable Object.
   *
   * Storage initialization is deferred by one microtask so overridable methods do
   * not run before subclass fields are initialized. The input gate prevents events
   * from running until initialization completes.
   *
   * @param state Durable Object state and storage access.
   * @param env Cloudflare environment containing cache purge configuration.
   */
  constructor(state, env) {
    super(state, env);
    this.bufferTimeInSeconds = env.NEXT_CACHE_DO_PURGE_BUFFER_TIME_IN_SECONDS ? parseInt(env.NEXT_CACHE_DO_PURGE_BUFFER_TIME_IN_SECONDS) : DEFAULT_BUFFER_TIME_IN_SECONDS;
    state.blockConcurrencyWhile(async () => {
      await Promise.resolve();
      await this.ensureStorageInitialized();
    });
  }
  /**
   * Adds cache tags to the buffered purge queue.
   *
   * An alarm is scheduled after the configured buffer delay only when no alarm is
   * already pending.
   *
   * @param tags Cache tags to enqueue for purging.
   * @returns A promise that resolves after the tags are stored and an alarm is scheduled if needed.
   * @throws When initialization, persistence, or alarm scheduling fails.
   */
  async purgeCacheByTags(tags) {
    await this.ensureStorageInitialized();
    await this.enqueueTags(tags);
    const nextAlarm = await this.ctx.storage.getAlarm();
    if (!nextAlarm) {
      await this.ctx.storage.setAlarm(Date.now() + this.bufferTimeInSeconds * 1e3);
    }
  }
  /**
   * Processes buffered cache tags when the Durable Object alarm fires.
   *
   * The alarm repeatedly loads, executes, and settles batches until no work remains.
   * A retry settlement or thrown hook error retains whatever work the implementation
   * leaves in storage and fails the alarm so the platform can retry it.
   *
   * @returns A promise that resolves after all available batches are processed.
   * @throws When a hook throws or settlement requests an alarm retry.
   */
  async alarm() {
    await this.ensureStorageInitialized();
    while (true) {
      const batch = await this.loadNextBatch(MAX_NUMBER_OF_TAGS_PER_PURGE);
      if (batch === void 0) {
        return;
      }
      const result = await this.executePurge(batch);
      const settlement = await this.settleBatch(batch, result);
      if (settlement === "retry") {
        throw new Error("Cache purge retry requested");
      }
    }
  }
  /**
   * Coordinates storage initialization for the current Durable Object instance.
   *
   * The promise is memoized before it is awaited so concurrent events share the same
   * initialization work. A rejected promise is cleared so a later event can retry.
   *
   * @returns A promise that resolves when storage is ready.
   * @throws When `initializeStorage` rejects.
   */
  async ensureStorageInitialized() {
    const initialization = this.storageInitialization ??= this.initializeStorage();
    try {
      await initialization;
    } catch (error2) {
      if (this.storageInitialization === initialization) {
        this.storageInitialization = void 0;
      }
      throw error2;
    }
  }
};
var BucketCachePurge = class extends BucketCachePurgeBase {
  /**
   * Creates the default cache-tag queue schema.
   *
   * The unique tag index deduplicates invalidations buffered before the alarm runs.
   *
   * @returns A promise that resolves after the schema is ready.
   * @throws When SQL schema initialization fails.
   */
  async initializeStorage() {
    this.ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS cache_purge (
        tag TEXT NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS tag_index ON cache_purge (tag);
      `);
  }
  /**
   * Adds tags to the default SQL queue.
   *
   * Existing tags are replaced so each cache tag appears at most once.
   *
   * @param tags Cache tags to enqueue.
   * @returns A promise that resolves after all tags are stored.
   * @throws When a SQL insert fails.
   */
  async enqueueTags(tags) {
    for (const tag of tags) {
      this.ctx.storage.sql.exec(`
        INSERT OR REPLACE INTO cache_purge (tag)
        VALUES (?)`, tag);
    }
  }
  /**
   * Loads the next tag batch from the default SQL queue.
   *
   * @param limit Maximum number of tags to load.
   * @returns The next tag batch, or `undefined` when the queue is empty.
   * @throws When the SQL query fails.
   */
  async loadNextBatch(limit) {
    const tags = this.ctx.storage.sql.exec(`SELECT tag FROM cache_purge LIMIT ${limit}`).toArray().map((row) => row.tag);
    return tags.length === 0 ? void 0 : tags;
  }
  /**
   * Purges one tag batch with the default Cloudflare API implementation.
   *
   * @param tags Cache tags in the current batch.
   * @returns The purge status used to settle the batch.
   */
  async executePurge(tags) {
    return internalPurgeCacheByTags(this.env, tags);
  }
  /**
   * Settles a default tag batch after purge execution.
   *
   * Rate-limited batches remain stored and request an alarm retry. Every other
   * result removes the batch and continues draining the queue.
   *
   * @param tags Cache tags in the executed batch.
   * @param result Purge execution status.
   * @returns Whether the alarm should continue or request a retry.
   * @throws When deleting a completed batch fails.
   */
  async settleBatch(tags, result) {
    if (result === "rate-limit-exceeded") {
      return "retry";
    }
    this.ctx.storage.sql.exec(`DELETE FROM cache_purge WHERE tag IN (${tags.map(() => "?").join(",")})`, ...tags);
    return "continue";
  }
};
export {
  BucketCachePurge,
  BucketCachePurgeBase
};
