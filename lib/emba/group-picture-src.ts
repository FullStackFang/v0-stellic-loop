// Where a group's drawn picture is served. In a file of its own because the browser reads it too.

/** The 192px tile of a drawing, or the whole drawing. */
export const groupPictureSrc = (token: string, full = false) => `/animals/group/${token}${full ? '/full' : ''}`;
