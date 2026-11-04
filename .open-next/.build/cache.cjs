globalThis.disableIncrementalCache = false;globalThis.disableDynamoDBCache = false;globalThis.openNextDebug = false;globalThis.openNextVersion = "4.1.14";globalThis.nextVersion = "16.3.6";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// node_modules/.pnpm/@opennextjs+aws@4.1.14_next@16.3.6_@types+node@22.10.2_react-dom@19.2.8_react@19.2.8__react@19.2.8_/node_modules/@opennextjs/aws/dist/adapters/cache.js
var cache_exports = {};
__export(cache_exports, {
  SOFT_TAG_PREFIX: () => SOFT_TAG_PREFIX,
  default: () => Cache
});
module.exports = __toCommonJS(cache_exports);

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

// node_modules/.pnpm/@opennextjs+aws@4.1.14_next@16.3.6_@types+node@22.10.2_react-dom@19.2.8_react@19.2.8__react@19.2.8_/node_modules/@opennextjs/aws/dist/utils/cacheHeaders.js
var CACHE_TAGS_HEADER = "x-next-cache-tags";

// node_modules/.pnpm/@opennextjs+aws@4.1.14_next@16.3.6_@types+node@22.10.2_react-dom@19.2.8_react@19.2.8__react@19.2.8_/node_modules/@opennextjs/aws/dist/utils/semver.js
function compareSemver(v1, operator, v2) {
  let versionDiff = 0;
  if (v1 === "latest") {
    versionDiff = 1;
  } else {
    if (/^[^\d]/.test(v1)) {
      v1 = v1.substring(1);
    }
    if (/^[^\d]/.test(v2)) {
      v2 = v2.substring(1);
    }
    const [major1, minor1 = 0, patch1 = 0] = v1.split(".").map(Number);
    const [major2, minor2 = 0, patch2 = 0] = v2.split(".").map(Number);
    if (Number.isNaN(major1) || Number.isNaN(major2)) {
      throw new Error("The major version is required.");
    }
    if (major1 !== major2) {
      versionDiff = major1 - major2;
    } else if (minor1 !== minor2) {
      versionDiff = minor1 - minor2;
    } else if (patch1 !== patch2) {
      versionDiff = patch1 - patch2;
    }
  }
  switch (operator) {
    case "=":
      return versionDiff === 0;
    case ">=":
      return versionDiff >= 0;
    case "<=":
      return versionDiff <= 0;
    case ">":
      return versionDiff > 0;
    case "<":
      return versionDiff < 0;
    default:
      throw new Error(`Unsupported operator: ${operator}`);
  }
}

// node_modules/.pnpm/@opennextjs+aws@4.1.14_next@16.3.6_@types+node@22.10.2_react-dom@19.2.8_react@19.2.8__react@19.2.8_/node_modules/@opennextjs/aws/dist/utils/cache.js
async function isStale(key, tags, lastModified) {
  if (!compareSemver(globalThis.nextVersion, ">=", "16.0.0")) {
    return false;
  }
  if (globalThis.openNextConfig.dangerous?.disableTagCache) {
    return false;
  }
  if (globalThis.tagCache.mode === "nextMode") {
    return tags.length === 0 ? false : await globalThis.tagCache.isStale?.(tags, lastModified) ?? false;
  }
  return await globalThis.tagCache.isStale?.(key, lastModified) ?? false;
}
function getStaleLastModified(revalidate) {
  if (!compareSemver(globalThis.nextVersion, ">=", "16.3.0")) {
    return 1;
  }
  if (typeof revalidate !== "number") {
    return 1;
  }
  return Date.now() - revalidate * 1e3 - 1;
}
async function hasBeenRevalidated(key, tags, cacheEntry) {
  if (globalThis.openNextConfig.dangerous?.disableTagCache) {
    return false;
  }
  const value = cacheEntry.value;
  if (!value) {
    return true;
  }
  if ("type" in cacheEntry && cacheEntry.type === "page") {
    return false;
  }
  const lastModified = cacheEntry.lastModified ?? Date.now();
  if (globalThis.tagCache.mode === "nextMode") {
    return tags.length === 0 ? false : await globalThis.tagCache.hasBeenRevalidated(tags, lastModified);
  }
  const _lastModified = await globalThis.tagCache.getLastModified(key, lastModified);
  return _lastModified === -1;
}
function getTagsFromValue(value) {
  if (!value) {
    return [];
  }
  try {
    const cacheTags = value.meta?.headers?.[CACHE_TAGS_HEADER]?.split(",") ?? [];
    delete value.meta?.headers?.[CACHE_TAGS_HEADER];
    return cacheTags;
  } catch (e) {
    return [];
  }
}
function getTagKey(tag) {
  if (typeof tag === "string") {
    return tag;
  }
  if ("path" in tag) {
    return JSON.stringify({
      tag: tag.tag,
      path: tag.path
    });
  }
  return tag.tag;
}
async function writeTags(tags) {
  const store = globalThis.__openNextAls.getStore();
  debug("Writing tags", tags, store);
  if (!store || globalThis.openNextConfig.dangerous?.disableTagCache) {
    return;
  }
  const tagsToWrite = tags.filter((t) => {
    const tagKey = getTagKey(t);
    const shouldWrite = !store.writtenTags.has(tagKey);
    if (shouldWrite) {
      store.writtenTags.add(tagKey);
    }
    return shouldWrite;
  });
  if (tagsToWrite.length === 0) {
    return;
  }
  await globalThis.tagCache.writeTags(tagsToWrite);
}

// node_modules/.pnpm/@opennextjs+aws@4.1.14_next@16.3.6_@types+node@22.10.2_react-dom@19.2.8_react@19.2.8__react@19.2.8_/node_modules/@opennextjs/aws/dist/utils/binary.js
var commonBinaryMimeTypes = /* @__PURE__ */ new Set([
  "application/octet-stream",
  // Docs
  "application/epub+zip",
  "application/msword",
  "application/pdf",
  "application/rtf",
  "application/vnd.amazon.ebook",
  "application/vnd.ms-excel",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  // Fonts
  "font/otf",
  "font/woff",
  "font/woff2",
  // Images
  "image/bmp",
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/tiff",
  "image/vnd.microsoft.icon",
  "image/webp",
  // Audio
  "audio/3gpp",
  "audio/aac",
  "audio/basic",
  "audio/flac",
  "audio/mpeg",
  "audio/ogg",
  "audio/wavaudio/webm",
  "audio/x-aiff",
  "audio/x-midi",
  "audio/x-wav",
  // Video
  "video/3gpp",
  "video/mp2t",
  "video/mpeg",
  "video/ogg",
  "video/quicktime",
  "video/webm",
  "video/x-msvideo",
  // Archives
  "application/java-archive",
  "application/vnd.apple.installer+xml",
  "application/x-7z-compressed",
  "application/x-apple-diskimage",
  "application/x-bzip",
  "application/x-bzip2",
  "application/x-gzip",
  "application/x-java-archive",
  "application/x-rar-compressed",
  "application/x-tar",
  "application/x-zip",
  "application/zip",
  // Serialized data
  "application/x-protobuf"
]);
function isBinaryContentType(contentType) {
  if (!contentType)
    return false;
  const value = contentType.split(";")[0];
  return commonBinaryMimeTypes.has(value);
}

// node_modules/.pnpm/@opennextjs+aws@4.1.14_next@16.3.6_@types+node@22.10.2_react-dom@19.2.8_react@19.2.8__react@19.2.8_/node_modules/@opennextjs/aws/dist/utils/routeCacheKey.js
var ROUTE_CACHE_KEY_PREFIX = /^\/?route-cache\/(?:PAGES|APP_PAGE|APP_ROUTE)\/[0-9a-f]{64}\/\$(?=\/)/;
function useRouteCacheKeys(nextVersion) {
  return compareSemver(nextVersion, ">=", "15.5.27") && compareSemver(nextVersion, "<", "16.0.0") || compareSemver(nextVersion, ">=", "16.3.8");
}
function getPathFromRouteCacheKey(key) {
  return key.replace(ROUTE_CACHE_KEY_PREFIX, "");
}

// node_modules/.pnpm/@opennextjs+aws@4.1.14_next@16.3.6_@types+node@22.10.2_react-dom@19.2.8_react@19.2.8__react@19.2.8_/node_modules/@opennextjs/aws/dist/adapters/cache.js
var SOFT_TAG_PREFIX = "_N_T_/";
function isFetchCache(options) {
  if (typeof options === "boolean") {
    return options;
  }
  if (typeof options === "object") {
    return options.kindHint === "fetch" || options.fetchCache || options.kind === "FETCH";
  }
  return false;
}
function getCacheControl({ revalidate, expire }, isEntryStale) {
  if (isEntryStale && typeof revalidate !== "number") {
    return { revalidate: 1 };
  }
  if (revalidate === void 0) {
    return void 0;
  }
  return { revalidate, expire };
}
var sharedCacheControls = null;
async function getSharedCacheControls() {
  if (sharedCacheControls === null) {
    try {
      const { SharedCacheControls } = await import("next/dist/server/lib/incremental-cache/shared-cache-controls.external.js");
      sharedCacheControls = SharedCacheControls.cacheControls;
    } catch (e) {
      debug("Failed to load the Next.js cache controls", e);
      sharedCacheControls = void 0;
    }
  }
  return sharedCacheControls;
}
async function recordCacheControl(key, cacheControl) {
  const nextVersion = globalThis.nextVersion;
  if (!cacheControl || compareSemver(nextVersion, ">=", "16.4.0") || !useRouteCacheKeys(nextVersion)) {
    return;
  }
  (await getSharedCacheControls())?.set(key, cacheControl);
}
var Cache = class {
  async get(key, options) {
    if (globalThis.openNextConfig.dangerous?.disableIncrementalCache) {
      return null;
    }
    const softTags = typeof options === "object" ? options.softTags : [];
    const tags = typeof options === "object" ? options.tags : [];
    return isFetchCache(options) ? this.getFetchCache(key, softTags, tags) : this.getIncrementalCache(key);
  }
  async getFetchCache(key, softTags, tags) {
    debug("get fetch cache", { key, softTags, tags });
    try {
      const cachedEntry = await globalThis.incrementalCache.get(key, "fetch");
      if (cachedEntry?.value === void 0)
        return null;
      const _tags = [...tags ?? [], ...softTags ?? []];
      const _lastModified = cachedEntry.lastModified ?? Date.now();
      const _hasBeenRevalidated = cachedEntry.shouldBypassTagCache ? false : await hasBeenRevalidated(key, _tags, cachedEntry);
      if (_hasBeenRevalidated)
        return null;
      if ((tags ?? []).length === 0) {
        const path = softTags?.find((tag) => tag.startsWith(SOFT_TAG_PREFIX) && !tag.endsWith("layout") && !tag.endsWith("page"));
        if (path) {
          const hasPathBeenUpdated = cachedEntry.shouldBypassTagCache ? false : await hasBeenRevalidated(path.replace(SOFT_TAG_PREFIX, ""), [], cachedEntry);
          if (hasPathBeenUpdated) {
            return null;
          }
        }
      }
      const _isStale = cachedEntry.shouldBypassTagCache ? false : await isStale(key, _tags, _lastModified);
      return {
        lastModified: _isStale ? 1 : _lastModified,
        value: cachedEntry.value
      };
    } catch (e) {
      debug("Failed to get fetch cache", e);
      return null;
    }
  }
  async getIncrementalCache(key) {
    try {
      const cachedEntry = await globalThis.incrementalCache.get(key, "cache");
      if (!cachedEntry?.value) {
        return null;
      }
      const cacheData = cachedEntry.value;
      const meta = cacheData.meta;
      const tags = getTagsFromValue(cacheData);
      let _lastModified = cachedEntry.lastModified ?? Date.now();
      const _hasBeenRevalidated = cachedEntry.shouldBypassTagCache ? false : await hasBeenRevalidated(key, tags, cachedEntry);
      if (_hasBeenRevalidated)
        return null;
      const _isStale = cachedEntry.shouldBypassTagCache ? false : await isStale(key, tags, _lastModified);
      const store = globalThis.__openNextAls.getStore();
      if (store) {
        store.lastModified = _isStale ? 1 : _lastModified;
      }
      if (_isStale) {
        _lastModified = getStaleLastModified(cacheData.revalidate);
      }
      const _cacheControl = getCacheControl(cacheData, _isStale);
      await recordCacheControl(key, _cacheControl);
      if (cacheData?.type === "route") {
        return {
          lastModified: _lastModified,
          cacheControl: _cacheControl,
          value: {
            kind: compareSemver(globalThis.nextVersion, ">=", "15.0.0") ? "APP_ROUTE" : "ROUTE",
            body: Buffer.from(cacheData.body ?? Buffer.alloc(0), isBinaryContentType(String(meta?.headers?.["content-type"])) ? "base64" : "utf8"),
            status: meta?.status,
            headers: meta?.headers
          }
        };
      }
      if (cacheData?.type === "page" || cacheData?.type === "app") {
        if (cacheData.html === void 0) {
          warn("No html in the cache entry", key);
          return null;
        }
        if (compareSemver(globalThis.nextVersion, ">=", "15.0.0") && cacheData?.type === "app") {
          const segmentData = /* @__PURE__ */ new Map();
          if (cacheData.segmentData) {
            for (const [segmentPath, segmentContent] of Object.entries(cacheData.segmentData ?? {})) {
              segmentData.set(segmentPath, Buffer.from(segmentContent));
            }
          }
          return {
            lastModified: _lastModified,
            cacheControl: _cacheControl,
            value: {
              kind: "APP_PAGE",
              html: cacheData.html,
              // `rsc` is absent when the build collected neither a `.rsc` nor a
              // `.prefetch.rsc` file, see `CachedFile`. An undefined value is expected: the
              // Next.js file system cache also leaves `rscData` undefined for fallback
              // shells, and on 16.2+ for postponed PPR routes.
              rscData: cacheData.rsc === void 0 ? void 0 : Buffer.from(cacheData.rsc),
              status: meta?.status,
              headers: meta?.headers,
              postponed: meta?.postponed,
              segmentData
            }
          };
        }
        const pageData = cacheData.type === "page" ? cacheData.json : cacheData.rsc;
        if (pageData === void 0) {
          warn("No page data in the cache entry", key);
          return null;
        }
        return {
          lastModified: _lastModified,
          cacheControl: _cacheControl,
          value: {
            kind: compareSemver(globalThis.nextVersion, ">=", "15.0.0") ? "PAGES" : "PAGE",
            html: cacheData.html,
            pageData,
            status: meta?.status,
            headers: meta?.headers
          }
        };
      }
      if (cacheData?.type === "redirect") {
        return {
          lastModified: _lastModified,
          cacheControl: _cacheControl,
          value: {
            kind: "REDIRECT",
            props: cacheData.props
          }
        };
      }
      warn("Unknown cache type", cacheData);
      return null;
    } catch (e) {
      debug("Failed to get body cache", e);
      return null;
    }
  }
  async set(key, data, ctx) {
    if (globalThis.openNextConfig.dangerous?.disableIncrementalCache) {
      return;
    }
    const store = globalThis.__openNextAls.getStore();
    const writePromise = this.writeCache(key, data, ctx);
    if (store !== void 0) {
      store.pendingPromiseRunner.add(writePromise);
    }
    if (data?.kind === "FETCH" || store === void 0) {
      await writePromise;
    }
  }
  async writeCache(key, data, ctx) {
    try {
      if (data === null || data === void 0) {
        await globalThis.incrementalCache.delete(key);
      } else {
        const cacheControl = this.extractCacheControlForSet(ctx);
        switch (data.kind) {
          case "ROUTE":
          case "APP_ROUTE": {
            const { body, status, headers } = data;
            await globalThis.incrementalCache.set(key, {
              type: "route",
              body: body.toString(isBinaryContentType(String(headers["content-type"])) ? "base64" : "utf8"),
              meta: {
                status,
                headers
              },
              ...cacheControl
            }, "cache");
            break;
          }
          case "PAGE":
          case "PAGES": {
            const { html, pageData, status, headers } = data;
            const isAppPath = typeof pageData === "string";
            if (isAppPath) {
              await globalThis.incrementalCache.set(key, {
                type: "app",
                html,
                rsc: pageData,
                meta: {
                  status,
                  headers
                },
                ...cacheControl
              }, "cache");
            } else {
              await globalThis.incrementalCache.set(key, {
                type: "page",
                html,
                json: pageData,
                ...cacheControl
              }, "cache");
            }
            break;
          }
          case "APP_PAGE": {
            const { html, rscData, headers, status, segmentData, postponed } = data;
            const segmentToWrite = {};
            if (segmentData) {
              for (const [segmentPath, segmentContent] of segmentData.entries()) {
                segmentToWrite[segmentPath] = segmentContent.toString("utf8");
              }
            }
            await globalThis.incrementalCache.set(key, {
              type: "app",
              html,
              rsc: rscData?.toString("utf8"),
              meta: {
                status,
                headers,
                postponed
              },
              ...cacheControl,
              segmentData: segmentData ? segmentToWrite : void 0
            }, "cache");
            break;
          }
          case "FETCH":
            await globalThis.incrementalCache.set(key, data, "fetch");
            break;
          case "REDIRECT":
            await globalThis.incrementalCache.set(key, {
              type: "redirect",
              props: data.props,
              ...cacheControl
            }, "cache");
            break;
          case "IMAGE":
            break;
        }
      }
      await this.updateTagsOnSet(key, data, ctx);
      debug("Finished setting cache");
    } catch (e) {
      error("Failed to set cache", e);
    }
  }
  /**
   * Revalidates cache entries associated with one or more tags.
   *
   * The tag cache is updated before the CDN is invalidated. CDN handlers that
   * support tag invalidation receive the original tags; other handlers retain
   * the existing path-based invalidation behavior.
   *
   * @param tags Tags whose cache entries should be revalidated.
   * @param durations Optional stale and expiry durations.
   * @returns A promise that resolves when revalidation is complete.
   */
  async revalidateTag(tags, durations) {
    const config = globalThis.openNextConfig.dangerous;
    if (config?.disableTagCache || config?.disableIncrementalCache) {
      return;
    }
    const _tags = Array.isArray(tags) ? tags : [tags];
    if (_tags.length === 0) {
      return;
    }
    try {
      const cdnInvalidationHandler = globalThis.cdnInvalidationHandler;
      if (globalThis.tagCache.mode === "nextMode") {
        const now = Date.now();
        const tagsToWrite = _tags.map((tag) => {
          if (durations) {
            return {
              tag,
              stale: now,
              expire: durations.expire !== void 0 ? now + durations.expire * 1e3 : void 0
            };
          }
          return {
            tag,
            expire: now
          };
        });
        await writeTags(tagsToWrite);
        if (cdnInvalidationHandler.invalidateTags) {
          await cdnInvalidationHandler.invalidateTags(_tags);
        } else {
          const paths = await globalThis.tagCache.getPathsByTags?.(_tags) ?? [];
          if (paths.length > 0) {
            await cdnInvalidationHandler.invalidatePaths(paths.map(getPathFromRouteCacheKey).map((path) => ({
              initialPath: path,
              rawPath: path,
              resolvedRoutes: [
                {
                  route: path,
                  // TODO: ideally here we should check if it's an app router page or route
                  type: "app"
                }
              ]
            })));
          }
        }
        return;
      }
      for (const tag of _tags) {
        debug("revalidateTag", tag);
        const paths = await globalThis.tagCache.getByTag(tag);
        debug("Items", paths);
        const now = Date.now();
        const toInsert = paths.map((path) => {
          const baseEntry = { path, tag };
          if (durations) {
            return {
              ...baseEntry,
              stale: now,
              expire: durations.expire !== void 0 ? now + durations.expire * 1e3 : void 0
            };
          }
          return {
            ...baseEntry,
            expire: now
          };
        });
        if (tag.startsWith(SOFT_TAG_PREFIX)) {
          for (const path of paths) {
            const _tags2 = await globalThis.tagCache.getByPath(path);
            const hardTags = _tags2.filter((t) => !t.startsWith(SOFT_TAG_PREFIX));
            for (const hardTag of hardTags) {
              const _paths = await globalThis.tagCache.getByTag(hardTag);
              debug({ hardTag, _paths });
              toInsert.push(..._paths.map((path2) => {
                const baseEntry = { path: path2, tag: hardTag };
                if (durations) {
                  return {
                    ...baseEntry,
                    stale: now,
                    expire: durations.expire !== void 0 ? now + durations.expire * 1e3 : void 0
                  };
                }
                return {
                  ...baseEntry,
                  expire: now
                };
              }));
            }
          }
        }
        await writeTags(toInsert);
        if (cdnInvalidationHandler.invalidateTags) {
          continue;
        }
        const uniquePaths = Array.from(new Set(toInsert.filter((t) => t.tag.startsWith(SOFT_TAG_PREFIX)).map((t) => getPathFromRouteCacheKey(`/${t.path}`))));
        if (uniquePaths.length > 0) {
          await cdnInvalidationHandler.invalidatePaths(uniquePaths.map((path) => ({
            initialPath: path,
            rawPath: path,
            resolvedRoutes: [
              {
                route: path,
                // TODO: ideally here we should check if it's an app router page or route
                type: "app"
              }
            ]
          })));
        }
      }
      if (cdnInvalidationHandler.invalidateTags) {
        await cdnInvalidationHandler.invalidateTags(_tags);
      }
    } catch (e) {
      error("Failed to revalidate tag", e);
    }
  }
  // TODO: We should delete/update tags in this method
  // This will require an update to the tag cache interface
  async updateTagsOnSet(key, data, ctx) {
    if (globalThis.openNextConfig.dangerous?.disableTagCache || globalThis.tagCache.mode === "nextMode" || // Here it means it's a delete
    !data) {
      return;
    }
    const pageCacheTags = data?.kind === "PAGE" || data?.kind === "APP_PAGE" ? data.headers?.[CACHE_TAGS_HEADER] : void 0;
    const derivedTags = data?.kind === "FETCH" ? (
      //@ts-expect-error - On older versions of next, ctx was a number, but for these cases we use data?.data?.tags
      ctx?.tags ?? data?.data?.tags ?? []
    ) : typeof pageCacheTags === "string" ? pageCacheTags.split(",") : [];
    debug("derivedTags", derivedTags);
    const storedTags = await globalThis.tagCache.getByPath(key);
    const tagsToWrite = derivedTags.filter((tag) => !storedTags.includes(tag));
    if (tagsToWrite.length > 0) {
      await writeTags(tagsToWrite.map((tag) => ({
        path: key,
        tag,
        // In case the tags are not there we just need to create them
        // but we don't want them to return from `getLastModified` as they are not stale
        revalidatedAt: 1
      })));
    }
  }
  /**
   * Returns the lifetime Next.js passed to `set()`.
   *
   * It is stored with the entry so that `get()` can report it. Only the newest context
   * shape carries an `expire`.
   *
   * @param ctx The context passed to `set()`
   * @returns The lifetime, empty when there is none
   */
  extractCacheControlForSet(ctx) {
    if (ctx === void 0) {
      return {};
    }
    if (typeof ctx === "number" || ctx === false) {
      return { revalidate: ctx };
    }
    if ("revalidate" in ctx) {
      return { revalidate: ctx.revalidate };
    }
    if ("cacheControl" in ctx) {
      return { ...ctx.cacheControl };
    }
    return {};
  }
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  SOFT_TAG_PREFIX
});
