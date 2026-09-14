/**
 * Run a Lambda-style handler on the modern Netlify Functions runtime (API v2).
 * That runtime initializes NETLIFY_BLOBS_CONTEXT, including uncachedEdgeURL,
 * which stock connectLambda never copies from event.blobs `{ token, url }`.
 *
 * Function modules that use this MUST export default and MUST NOT export `handler`,
 * or Netlify keeps Lambda compatibility mode and strong Blobs reads stay unavailable.
 *
 * @netlify/aws-lambda-compat and @netlify/identity require Node >=22.12.0.
 */
import { withLambda } from "@netlify/aws-lambda-compat";

export function asNetlifyFunction(lambdaHandler) {
  return withLambda(async (event, lambdaContext) => {
    if (!lambdaContext.clientContext?.user?.sub) {
      try {
        const { getUser } = await import("@netlify/identity");
        const user = await getUser();
        if (user?.id) {
          lambdaContext.clientContext = {
            ...(lambdaContext.clientContext || {}),
            user: { sub: user.id, email: user.email },
          };
        }
      } catch {
        /* Identity helper is v2-only; isolated QA keeps existing bearer auth. */
      }
    }
    return lambdaHandler(event, lambdaContext);
  });
}
