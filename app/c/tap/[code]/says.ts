/** Why a tap did nothing, in the person's words. A plain module: the page (server) and the button (client) both read it. */
export const TAP_SAYS: Record<string, string> = {
  unknown: 'This link does not lead anywhere. Ask your assistant again.',
  not_yours: 'This was made for another Loopd account than the one signed in here. Sign in with the account your assistant uses, or ask your own assistant.',
  used: 'This was already done.',
  expired: 'This ran out after ten minutes. Ask your assistant again.',
  sign_in: 'Sign in to continue.',
};
