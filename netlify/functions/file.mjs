import { connectLambda } from "@netlify/blobs";
import { loadBinary } from "./lib/files.mjs";

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Cache-Control": "public, max-age=31536000, immutable",
};

export const handler = async (event) => {
  connectLambda(event);
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: { ...headers, "Access-Control-Allow-Methods": "GET, OPTIONS" } };
  }
  if (event.httpMethod !== "GET") {
    return { statusCode: 405, body: "Method not allowed" };
  }
  const id = event.queryStringParameters?.id;
  if (!id) {
    return { statusCode: 400, body: "Missing id" };
  }
  const file = await loadBinary(id);
  if (!file) {
    return { statusCode: 404, body: "Not found" };
  }
  return {
    statusCode: 200,
    headers: {
      ...headers,
      "Content-Type": file.contentType,
    },
    body: Buffer.from(file.body).toString("base64"),
    isBase64Encoded: true,
  };
};
