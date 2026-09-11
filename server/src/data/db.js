// Supabase returns { data, error } instead of throwing. Everything in the data
// layer goes through unwrap() so a failed query becomes an exception the error
// middleware can map to a status code.

export class DbError extends Error {
  constructor(error) {
    super(error.message);
    this.name = 'DbError';
    this.code = error.code; // Postgres SQLSTATE, e.g. 23514 check violation
    this.details = error.details;
  }
}

export function unwrap({ data, error }) {
  if (error) throw new DbError(error);
  return data;
}

export const isUuid = (value) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(`${value}`);
