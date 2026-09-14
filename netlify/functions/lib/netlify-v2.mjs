/**
 * Run a Lambda-style handler on the modern Netlify Functions runtime (API v2).
 * That runtime initializes NETLIFY_BLOBS_CONTEXT, including uncachedEdgeURL,
 * which stock connectLambda never copies from event.blobs `{ token, url }`.
 *
 * Function modules that use this MUST export default and MUST NOT export `handler`,
 * or Netlify keeps Lambda compatibility mode and strong Blobs reads stay unavailable.
 *
 * @netlify/aws-lambda-compat and @netlify/identity require Node >=22.12.0.
 *
 * Studio still authenticates with netlify-identity-widget Authorization Bearer.
 * Native getUser() only sees runtime identity context / nf_jwt cookies, so after
 * that we verify the Bearer against the trusted Identity /user endpoint.
 */
import { withLambda } from "@netlify/aws-lambda-compat";
import { verifyIdentityBearer } from "./auth.mjs";

function setOperatorUser(lambdaContext, user) {
  lambdaContext.clientContext = {
    ...(lambdaContext.clientContext || {}),
    user: { sub: user.sub, email: user.email },
  };
}

export function asNetlifyFunction(lambdaHandler) {
  return withLambda(async (event, lambdaContext) => {
    if (!lambdaContext.clientContext?.user?.sub) {
      try {
        const { getUser } = await import("@netlify/identity");
        const user = await getUser();
        if (user?.id) setOperatorUser(lambdaContext, { sub: user.id, email: user.email });
      } catch {
        /* Identity helper is v2-only; isolated QA keeps existing bearer auth. */
      }
    }
    if (!lambdaContext.clientContext?.user?.sub) {
      const verified = await verifyIdentityBearer(event);
      if (verified?.sub) setOperatorUser(lambdaContext, verified);
    }
    return lambdaHandler(event, lambdaContext);
  });
}
