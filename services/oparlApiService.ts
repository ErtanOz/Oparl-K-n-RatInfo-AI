
import { PagedResponse, OparlObject } from '../types';

const BASE_URL = 'https://buergerinfo.stadt-koeln.de/oparl/bodies/stadtverwaltung_koeln';
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes
const MAX_CACHE_SIZE = 200; // Limit number of cached items

interface CacheEntry<T> {
  data: T;
  expiry: number;
  etag?: string;
  lastModified?: string;
}

const cache = new Map<string, CacheEntry<any>>();

// Concurrency control
const MAX_CONCURRENT_REQUESTS = 5;
let activeRequests = 0;
const requestQueue: Array<{ resolve: () => void; reject: (reason?: any) => void; signal?: AbortSignal }> = [];

const processQueue = () => {
    if (activeRequests < MAX_CONCURRENT_REQUESTS && requestQueue.length > 0) {
        // Find the next request that hasn't been aborted yet
        const nextIndex = requestQueue.findIndex(item => !item.signal?.aborted);
        
        if (nextIndex !== -1) {
            const [next] = requestQueue.splice(nextIndex, 1);
            activeRequests++;
            next.resolve();
        } else {
            // Clean up aborted requests from the queue to prevent memory leaks
            requestQueue.length = 0;
        }
    }
};

const waitForTurn = (signal?: AbortSignal): Promise<void> => {
    return new Promise((resolve, reject) => {
        if (signal?.aborted) {
            reject(new DOMException('Aborted', 'AbortError'));
            return;
        }
        requestQueue.push({ resolve, reject, signal });
        processQueue();
    });
};

const releaseTurn = () => {
    activeRequests--;
    processQueue();
};

// Basic Least Recently Used (LRU) pruning
function pruneCache() {
  if (cache.size > MAX_CACHE_SIZE) {
    const keysToDelete = Array.from(cache.keys()).slice(0, 20);
    for (const key of keysToDelete) {
      cache.delete(key);
    }
  }
}

function isPagedResponse(data: any): data is PagedResponse<any> {
    return data && Array.isArray(data.data) && typeof data.pagination === 'object';
}

function isOparlObject(item: any): item is OparlObject {
    return item && typeof item.id === 'string';
}

export async function fetchFromApi<T>(url: string, signal?: AbortSignal): Promise<T> {
  const now = Date.now();
  const cached = cache.get(url);

  // 1. Check Cache validity
  // Note: We verify validity but also respect explicit aborts immediately
  if (signal?.aborted) {
      return Promise.reject(new DOMException('Aborted', 'AbortError'));
  }

  if (cached) {
    if (now < cached.expiry) {
        cache.delete(url);
        cache.set(url, cached); // Update LRU
        return Promise.resolve(cached.data as T);
    }
  }

  // 2. Network Request with Queueing
  try {
    await waitForTurn(signal);
  } catch (e) {
      return Promise.reject(e);
  }

  try {
    if (signal?.aborted) {
        throw new DOMException('Aborted', 'AbortError');
    }

    const headers: HeadersInit = {};
    if (cached) {
        if (cached.etag) headers['If-None-Match'] = cached.etag;
        if (cached.lastModified) headers['If-Modified-Since'] = cached.lastModified;
    }

    const response = await fetch(url, { headers, signal });

    if (response.status === 304 && cached) {
        cached.expiry = now + CACHE_TTL;
        cache.delete(url);
        cache.set(url, cached);
        return cached.data;
    }

    if (!response.ok) {
        throw new Error(`API-Fehler: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    
    const entry: CacheEntry<T> = {
        data,
        expiry: now + CACHE_TTL,
        etag: response.headers.get('ETag') || undefined,
        lastModified: response.headers.get('Last-Modified') || undefined
    };

    pruneCache();
    cache.set(url, entry);

    // Cache Warming for List Items
    if (isPagedResponse(data)) {
        data.data.forEach((item) => {
            if (isOparlObject(item)) {
                cache.set(item.id, {
                    data: item,
                    expiry: now + CACHE_TTL
                });
            }
        });
    }

    return data;
  } finally {
    releaseTurn();
  }
}

export async function getList<T>(resource: string, params: URLSearchParams = new URLSearchParams(), signal?: AbortSignal): Promise<PagedResponse<T>> {
  const url = `${BASE_URL}/${resource}?${params.toString()}`;
  return fetchFromApi<PagedResponse<T>>(url, signal);
}

export async function getItem<T>(url: string, signal?: AbortSignal): Promise<T> {
  if(typeof url !== 'string') {
      throw new Error(`Invalid URL for getItem: expected string, got ${typeof url}`);
  }
  if(!url.startsWith('http')) {
      throw new Error(`Invalid URL for getItem: ${url}`);
  }
  return fetchFromApi<T>(url, signal);
}

export async function search<T>(resource: string, query: string, page: number = 1, signal?: AbortSignal): Promise<PagedResponse<T>> {
  const params = new URLSearchParams();
  if(query) params.set('q', query);
  params.set('page', page.toString());
  return getList<T>(resource, params, signal);
}