/**
 * The seam every text goes through. Callers hold an `SmsSender` and never
 * learn which provider is behind it: production talks to Pingram, and
 * development and tests get a sender that delivers nothing. If carrier
 * filtering on Pingram's shared numbers drops too many texts, a Twilio
 * implementation of this interface replaces `pingramSender` and nothing else
 * changes (docs/research/sms-provider-and-reminders.md, 2026-09-05 addendum).
 */
import "server-only";
import { ChannelsEnum, Pingram } from "pingram";

export type SendResult =
  /** `detail` is the provider's tracking id. */
  | { ok: true; detail: string }
  /** `detail` is what went wrong, in words the console can show. */
  | { ok: false; detail: string };

export interface SmsSender {
  /** Stored on each log row. `noop` rows deliver nothing and spend no budget. */
  readonly name: string;
  /**
   * `to` is E.164. `memberId` is who it is for: Pingram files the text under
   * that user, so a STOP reply comes back naming the member (`opt-outs.ts`).
   * Never throws: a provider fault comes back as `ok: false`.
   */
  send(to: string, body: string, memberId: number): Promise<SendResult>;
}

export const NOOP = "noop";

/** Delivers nothing and says so; what runs without `PINGRAM_API_KEY`. */
export const noopSender: SmsSender = {
  name: NOOP,
  async send() {
    return { ok: true, detail: "not delivered: no PINGRAM_API_KEY" };
  },
};

/** The Pingram notification type every text is filed under in its dashboard. */
const PINGRAM_TYPE = "saturday_slate";

/** Pingram's own reason when it answered with an error status, else what went wrong in reaching it. */
async function refusal(error: unknown): Promise<string> {
  // The SDK throws a `ResponseError` carrying the response, but does not export the class.
  const response = (error as { response?: unknown })?.response;
  if (response instanceof Response) {
    const body = (await response.json().catch(() => null)) as { message?: unknown } | null;
    return typeof body?.message === "string" ? body.message : `Pingram refused the text (${response.status}).`;
  }
  return error instanceof Error ? error.message : "Pingram could not be reached.";
}

export function pingramSender(apiKey: string): SmsSender {
  const client = new Pingram({ apiKey });
  return {
    name: "pingram",
    async send(to, body, memberId) {
      try {
        const response = await client.send({
          type: PINGRAM_TYPE,
          to: { id: String(memberId), number: to },
          forceChannels: [ChannelsEnum.SMS],
          sms: { message: body },
        });
        return { ok: true, detail: response.trackingId };
      } catch (error) {
        return { ok: false, detail: await refusal(error) };
      }
    },
  };
}

/** Pingram when a key is set, the no-op sender otherwise. */
export function senderFromEnv(): SmsSender {
  const key = process.env.PINGRAM_API_KEY;
  return key ? pingramSender(key) : noopSender;
}
