import 'server-only';
import type {Carrier} from './reach-send';

// The email provider. None is chosen yet (task 5.1 of loop-club-reach is the
// founder's): until one is, there is no sender and the scheduled run sends
// nothing. The provider's adapter goes here. It must send both parts, pass the
// message's id as the provider's idempotency key so a repeat is the same send,
// and set List-Unsubscribe to the message's `unsubscribeUrl` with
// List-Unsubscribe-Post: List-Unsubscribe=One-Click. It must also give up on a
// request after a few seconds: the scheduled run has 45 seconds for all rows.
// A message with a `calendar` part (loop-trip) is sent from LOOP_INVITE_FROM,
// with that part as text/calendar; method=<its method> beside the text and
// HTML parts, and the same content attached as invite.ics.
export function emailSender():Carrier['email']|null {
 return null;
}
