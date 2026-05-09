declare module "lodash" {
  export interface DebounceOptions {
    readonly leading?: boolean;
    readonly trailing?: boolean;
    readonly maxWait?: number;
  }

  export interface DebouncedFunc<T extends (...args: any[]) => any> {
    (...args: Parameters<T>): void;
    cancel(): void;
    flush(): ReturnType<T> | undefined;
    pending(): boolean;
  }

  export function debounce<T extends (...args: any[]) => any>(
    func: T,
    wait?: number,
    options?: DebounceOptions,
  ): DebouncedFunc<T>;
}
