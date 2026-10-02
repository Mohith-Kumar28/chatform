import type { components, paths } from "../generated/openapi.js";

/**
 * Read a type out of the generated spec by path and method.
 *
 * `Res<"/v1/responses/{id}", "get">` is the body that endpoint answers with,
 * exactly as the API declares it. Every public type in this package is built
 * from these, so none of them is a second copy of a shape the API owns.
 */

type Method = "get" | "post" | "put" | "patch" | "delete";
type Path = keyof paths;

type Operation<P extends Path, M extends Method> = NonNullable<paths[P][M]>;
type Json<T> = T extends { content: { "application/json": infer Body } } ? Body : never;

/** The success body: 200, else 201, else 202. */
export type Res<P extends Path, M extends Method> =
  Operation<P, M> extends { responses: infer R }
    ? R extends { 200: infer Ok }
      ? Json<Ok>
      : R extends { 201: infer Created }
        ? Json<Created>
        : R extends { 202: infer Accepted }
          ? Json<Accepted>
          : never
    : never;

/** The 202 body, for the endpoints that answer one while still working. */
export type Accepted<P extends Path, M extends Method> =
  Operation<P, M> extends { responses: { 202: infer A } } ? Json<A> : never;

/** The JSON request body. */
export type Body<P extends Path, M extends Method> =
  Operation<P, M> extends { requestBody?: infer B } ? Json<NonNullable<B>> : never;

/** The query parameters. */
export type Query<P extends Path, M extends Method> =
  Operation<P, M> extends { parameters: { query?: infer Q } } ? NonNullable<Q> : never;

/** One element of a list. */
export type Item<T> = T extends readonly (infer E)[] ? E : never;

export type ErrorEnvelope = components["schemas"]["ErrorEnvelope"];
