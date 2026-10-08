/**
 * High-Performance In-Memory LRU Cache with TTL and Telemetry
 * Provides fast sub-millisecond access for Master Data (Items, Customers, Suppliers, COA)
 */

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
  namespace: string;
}

export interface CacheStats {
  hits: number;
  misses: number;
  sets: number;
  invalidations: number;
  size: number;
  maxSize: number;
  hitRatePercentage: number;
}

export class InMemoryCacheService {
  private cache = new Map<string, CacheEntry<any>>();
  private maxSize: number;
  private hits = 0;
  private misses = 0;
  private sets = 0;
  private invalidations = 0;

  constructor(maxSize = 2000) {
    this.maxSize = maxSize;
  }

  /**
   * Retrieve cached value if present and not expired
   */
  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) {
      this.misses++;
      return null;
    }

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      this.misses++;
      return null;
    }

    // LRU touch: re-insert key to maintain recently used order
    this.cache.delete(key);
    this.cache.set(key, entry);

    this.hits++;
    return entry.value as T;
  }

  /**
   * Set cached value with TTL (in seconds) and namespace
   */
  set<T>(key: string, value: T, ttlSeconds = 300, namespace = "default"): void {
    if (this.cache.size >= this.maxSize) {
      // Evict oldest item (first key in Map iterator)
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) this.cache.delete(oldestKey);
    }

    this.cache.set(key, {
      value,
      expiresAt: Date.now() + ttlSeconds * 1000,
      namespace,
    });
    this.sets++;
  }

  /**
   * Invalidate all keys belonging to a namespace or matching a prefix
   */
  invalidateNamespace(namespace: string): number {
    let count = 0;
    for (const [key, entry] of this.cache.entries()) {
      if (entry.namespace === namespace || key.startsWith(namespace + ":")) {
        this.cache.delete(key);
        count++;
      }
    }
    this.invalidations += count;
    return count;
  }

  /**
   * Invalidate a single key
   */
  delete(key: string): boolean {
    const deleted = this.cache.delete(key);
    if (deleted) this.invalidations++;
    return deleted;
  }

  /**
   * Clear entire cache
   */
  clear(): void {
    this.cache.clear();
    this.invalidations++;
  }

  /**
   * Get operational statistics & hit rate metrics
   */
  getStats(): CacheStats {
    const totalRequests = this.hits + this.misses;
    const hitRate = totalRequests > 0 ? (this.hits / totalRequests) * 100 : 0;

    return {
      hits: this.hits,
      misses: this.misses,
      sets: this.sets,
      invalidations: this.invalidations,
      size: this.cache.size,
      maxSize: this.maxSize,
      hitRatePercentage: Math.round(hitRate * 100) / 100,
    };
  }
}

// Global Singleton Cache Instance
export const cacheService = new InMemoryCacheService(5000);
