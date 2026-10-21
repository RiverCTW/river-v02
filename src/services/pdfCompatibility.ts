const promiseConstructor = Promise as PromiseConstructor & {
  try?: <T>(callback: (...args: unknown[]) => T | PromiseLike<T>, ...args: unknown[]) => Promise<T>;
  withResolvers?: <T>() => {
    promise: Promise<T>;
    resolve: (value: T | PromiseLike<T>) => void;
    reject: (reason?: unknown) => void;
  };
};

if (typeof promiseConstructor.withResolvers !== "function") {
  promiseConstructor.withResolvers = <T>() => {
    let resolve!: (value: T | PromiseLike<T>) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((nextResolve, nextReject) => {
      resolve = nextResolve;
      reject = nextReject;
    });
    return { promise, resolve, reject };
  };
}

if (typeof promiseConstructor.try !== "function") {
  promiseConstructor.try = <T>(callback: (...args: unknown[]) => T | PromiseLike<T>, ...args: unknown[]) => {
    return new Promise<T>((resolve) => resolve(callback(...args)));
  };
}

const uint8ArrayConstructor = Uint8Array as Uint8ArrayConstructor & {
  fromBase64?: (value: string) => Uint8Array;
};

if (typeof uint8ArrayConstructor.fromBase64 !== "function") {
  uint8ArrayConstructor.fromBase64 = (value: string) => {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return bytes;
  };
}

if (typeof ReadableStream !== "undefined" && typeof ReadableStream.prototype[Symbol.asyncIterator] !== "function") {
  Object.defineProperty(ReadableStream.prototype, Symbol.asyncIterator, {
    configurable: true,
    writable: true,
    value: async function* readableStreamAsyncIterator(this: ReadableStream) {
      const reader = this.getReader();
      try {
        while (true) {
          const result = await reader.read();
          if (result.done) return;
          yield result.value;
        }
      } finally {
        reader.releaseLock();
      }
    },
  });
}

export {};
