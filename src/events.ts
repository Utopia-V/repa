export class AsyncEventChannel<T> implements AsyncIterable<T> {
  readonly #buffer: T[] = [];
  readonly #waiters: Array<(result: IteratorResult<T>) => void> = [];
  #closed = false;
  #iteratorClaimed = false;

  push(value: T): void {
    if (this.#closed) return;

    const waiter = this.#waiters.shift();
    if (waiter) {
      waiter({ done: false, value });
      return;
    }

    this.#buffer.push(value);
  }

  close(): void {
    if (this.#closed) return;
    this.#closed = true;

    if (this.#buffer.length === 0) {
      for (const waiter of this.#waiters.splice(0)) {
        waiter({ done: true, value: undefined });
      }
    }
  }

  [Symbol.asyncIterator](): AsyncIterator<T> {
    if (this.#iteratorClaimed) {
      throw new Error("Repa 的事件流只能由一个 Adapter 消费。");
    }
    this.#iteratorClaimed = true;

    return {
      next: () => this.#next(),
    };
  }

  #next(): Promise<IteratorResult<T>> {
    const value = this.#buffer.shift();
    if (value !== undefined) {
      if (this.#closed && this.#buffer.length === 0) {
        for (const waiter of this.#waiters.splice(0)) {
          waiter({ done: true, value: undefined });
        }
      }
      return Promise.resolve({ done: false, value });
    }

    if (this.#closed) {
      return Promise.resolve({ done: true, value: undefined });
    }

    return new Promise((resolve) => {
      this.#waiters.push(resolve);
    });
  }
}
