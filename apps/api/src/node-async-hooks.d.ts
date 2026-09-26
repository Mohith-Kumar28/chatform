/**
 * The slice of `node:async_hooks` the Worker uses, provided at runtime by the
 * `nodejs_compat` flag. Declared here because the package has no `@types/node`,
 * and pulling all of Node's globals in to type one class would let Node-only
 * APIs typecheck in code that cannot run them.
 */
declare module "node:async_hooks" {
  export class AsyncLocalStorage<T> {
    getStore(): T | undefined;
    run<R>(store: T, callback: () => R): R;
  }
}
