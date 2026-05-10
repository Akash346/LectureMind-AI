type AuthDebugFields = Record<
  string,
  string | number | boolean | null | undefined | string[]
>;

export function logAuthDebug(event: string, fields: AuthDebugFields = {}) {
  if (process.env.NODE_ENV !== "development") {
    return;
  }

  console.info(
    "[auth:debug]",
    JSON.stringify({
      event,
      ...compact(fields)
    })
  );
}

export function logNotebookOwnerDebug({
  event,
  sessionUserId,
  notebookId,
  notebookOwnerId
}: {
  event: string;
  sessionUserId: string;
  notebookId?: string | null;
  notebookOwnerId?: string | null;
}) {
  logAuthDebug(event, {
    sessionUserId,
    notebookId,
    notebookOwnerId
  });
}

function compact(fields: AuthDebugFields) {
  return Object.fromEntries(
    Object.entries(fields).filter(([, value]) => value !== undefined)
  );
}
