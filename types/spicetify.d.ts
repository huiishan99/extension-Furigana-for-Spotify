interface SpicetifyPlaybarButton {
  active: boolean;
  label: string;
  deregister(): void;
  register(): void;
}

interface SpicetifyReact {
  createElement(
    type: string,
    props?: Record<string, unknown> | null,
    ...children: unknown[]
  ): unknown;
  createElement<Props>(
    type: (props: Props) => unknown,
    props?: Props | null,
    ...children: unknown[]
  ): unknown;
  useEffect(effect: () => void | (() => void), dependencies: readonly unknown[]): void;
  useRef<T>(value: T): { current: T };
  useState<T>(initial: T | (() => T)): [T, (value: T) => void];
}

interface SpicetifyGlobal {
  React: SpicetifyReact;
  Config?: {
    version?: string;
    custom_apps?: string[];
  };
  Platform: unknown;
  Player: {
    data?: {
      item?: {
        uri?: string;
        name?: string;
        metadata?: Record<string, string | undefined>;
      };
    };
    addEventListener(
      type: "onprogress",
      callback: (event?: Event & { data: number }) => void,
    ): void;
    addEventListener(type: string, callback: () => void): void;
    removeEventListener(
      type: "onprogress",
      callback: (event?: Event & { data: number }) => void,
    ): void;
    removeEventListener(type: string, callback: () => void): void;
    getProgress(): number;
  };
  CosmosAsync: {
    get<T = unknown>(
      url: string,
      body?: unknown,
      headers?: Record<string, string>,
    ): Promise<T>;
  };
  LocalStorage: {
    get(key: string): string | null;
    set(key: string, value: string): void;
  };
  Playbar: {
    Button: new (
      label: string,
      icon: string,
      onClick: (self: SpicetifyPlaybarButton) => void,
      disabled?: boolean,
      active?: boolean,
      registerOnCreate?: boolean,
    ) => SpicetifyPlaybarButton;
  };
  showNotification(message: string, isError?: boolean): void;
}

declare const Spicetify: SpicetifyGlobal;
