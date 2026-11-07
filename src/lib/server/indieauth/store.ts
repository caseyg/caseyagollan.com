import { DurableObject } from "cloudflare:workers";
import { IndieAuthState, type StateStorage } from "./state";
import {
  authSettings,
  type IndieAuthEnvironment,
  type AuthOperations,
} from "./contracts";
export class IndieAuthStore extends DurableObject<IndieAuthEnvironment> {
  private state: IndieAuthState;
  constructor(ctx: DurableObjectState, env: IndieAuthEnvironment) {
    super(ctx, env);
    const settings = authSettings(env);
    if (!settings) throw new Error("indieauth:temporarily_unavailable");
    this.state = new IndieAuthState(
      ctx.storage as unknown as StateStorage,
      settings,
    );
  }
  async invoke<K extends keyof AuthOperations>(
    operation: K,
    input: AuthOperations[K]["input"],
  ): Promise<AuthOperations[K]["output"]> {
    return this.state.invoke(operation, input);
  }
  async alarm() {
    await this.state.alarm();
  }
}
