import { forwardPublicIntake, type PublicIntakeEnv } from "../../_lib/public-intake";

interface Context {
  request: Request;
  env: PublicIntakeEnv;
}

export const onRequestPost = ({ request, env }: Context) => forwardPublicIntake(request, env);
export const onRequestOptions = () => new Response(null, { status: 204 });
