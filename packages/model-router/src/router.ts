import type { ModelProviderAdapter, ModelProviderName } from "./types.js";

export class ModelRouter {
  readonly #adapters: ReadonlyMap<ModelProviderName, ModelProviderAdapter>;

  constructor(adapters: readonly ModelProviderAdapter[]) {
    this.#adapters = new Map(adapters.map((adapter) => [adapter.provider, adapter]));
  }

  get(provider: ModelProviderName): ModelProviderAdapter {
    const adapter = this.#adapters.get(provider);
    if (!adapter) throw new Error(`Model provider is not configured: ${provider}`);
    return adapter;
  }
}
