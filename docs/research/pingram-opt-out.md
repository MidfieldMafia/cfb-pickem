# Pingram's opt-out wording and STOP reporting

Research date: 2026-10-21. Resolves [#450](https://github.com/MidfieldMafia/cfb-pickem/issues/450),
a research ticket on the v4 map [#394](https://github.com/MidfieldMafia/cfb-pickem/issues/394). It
feeds the Notifications build ticket that follows
[#339](https://github.com/MidfieldMafia/cfb-pickem/issues/339).

**Question.** Can Saturday Slate's texts drop `OPT_OUT_LINE` ("Reply STOP to opt out.",
`src/lib/messaging/texts.ts:30`, appended to every text by `withOptOut`)? And can the app learn of a
STOP reply without a commissioner setting `members.smsOptedOut` by hand?

**Sources.** Pingram's docs at pingram.io/docs, fetched 2026-10-21. The `pingram` npm package
v1.0.32 installed in this repo, specifically its generated OpenAPI types under
`node_modules/pingram/dist/generated/src/`. CTIA's *Messaging Principles and Best Practices*
(May 2023), downloaded as a PDF. AWS End User Messaging docs for how toll-free STOP works at the
carrier level. The earlier [SMS provider research](sms-provider-and-reminders.md).

**Not reached.** These sites refused automated fetches: T-Mobile's Code of Conduct (403), Twilio's
help center, Twilio's 10DLC campaign pages and Telnyx's campaign pages (404 or empty shells). CTIA's
Short Code Monitoring Handbook was not fetched. Anything below that depends on those is marked
**unverified**. The live Pingram account was not queried, because a read of its numbers,
registrations and users was refused as personal-data handling. The account's real sender type is
therefore **unverified** too (see "Which sender this account uses").

## Answer

1. **Must every text say "Reply STOP to opt out"? No rule found requires that.** Pingram does not
   require it. CTIA's guidelines are voluntary, and they ask for opt-out instructions in the
   call-to-action and the opt-in confirmation message, not in every message. For a registered 10DLC
   campaign, Pingram's API asks for STOP/HELP wording in the *sample* messages and in an opt-in
   auto-reply. Dropping the line from routine texts is therefore allowed. The safe version is to
   keep it on the **first** text a member receives (in practice the Magic Link). Whether a carrier
   wants it repeated periodically on a 10DLC campaign is **unverified**.
2. **Pingram handles STOP and START itself, and does not handle HELP.** After a STOP, Pingram stops
   further SMS to that number "even if you send again", and START turns them back on. HELP is passed
   through as an ordinary inbound message for the app to answer. Nothing in the docs or SDK says
   Pingram adds opt-out wording to outgoing texts, so it most likely does not (**unverified**: not
   stated either way).
3. **Pingram reports opt-outs by webhook.** The Events Webhook sends `SMS_UNSUBSCRIBE` on a STOP and
   `SMS_SUBSCRIBE` on a START. Each event identifies the recipient by `userId`, not by phone number.
   The app sends with `sms.send({ to })` and never passes a user id, so which `userId` those events
   would carry is **unverified**. Sending through `pingram.send({ to: { id, number } })` instead
   makes the member's own id the key. No API was found that *lists* SMS opt-outs. The user record
   only has an email suppression status.

Taken together, the app could:

- Keep the STOP line on the Magic Link text only.
- Add a webhook route that sets `smsOptedOut` on `SMS_UNSUBSCRIBE` and clears it on
  `SMS_SUBSCRIBE`.
- Show the in-app Text setting as off whenever `smsOptedOut` is true. Pingram blocks texts after a
  STOP whatever the app's setting says, so the app's setting cannot switch texting back on.

## (1) Is opt-out wording required, and how often?

### Pingram

- Pingram's SMS compliance page answers the question "Do I need to implement HELP/STOP keywords?"
  with: "No. A reply of STOP stops further SMS to that number, even if you send again. START turns
  them back on."
  ([pingram.io/docs/sms/sms-senders-and-a2p-10dlc](https://www.pingram.io/docs/sms/sms-senders-and-a2p-10dlc))
- That page also says Pingram will "preflight content, consent language (HELP/STOP), and quiet-hour
  considerations to minimize filtering". It does not say what it checks for.
  ([same page](https://www.pingram.io/docs/sms/sms-senders-and-a2p-10dlc))
- The SMS overview's best practices list "Opt-out mechanism: Include unsubscribe instructions when
  required" and "Opt-in required: Ensure users have consented to SMS notifications". They do not
  say when it is required.
  ([pingram.io/docs/sms/overview](https://www.pingram.io/docs/sms/overview))
- For 10DLC registration, the SDK's `TenDlcCampaignRegistration` type describes these fields:
  - The sample SMS "should match the use case and typically identify the brand and include STOP/HELP
    language".
  - The opt-in auto-reply "should confirm the subscription, mention message frequency, and include
    STOP and HELP instructions".
  - The opt-out auto-reply "should confirm they will receive no further messages".
  - "STOP is always included" among the opt-out keywords, and "START is always included" among the
    opt-in keywords.

  (`node_modules/pingram/dist/generated/src/models/TenDlcCampaignRegistration.d.ts`, pingram 1.0.32)

**Pingram's rule:** opt-out wording belongs in the registration's sample and confirmation messages.
Nothing Pingram publishes requires it in every message.

### CTIA (industry guidelines, voluntary)

- CTIA presents the document as best practices, not law. It says the document "should not be used
  as a substitute for obtaining legal advice", and names the TCPA and CAN-SPAM among the laws that
  may apply (§2.3).
  ([CTIA Messaging Principles and Best Practices, May 2023](https://api.ctia.org/wp-content/uploads/2023/05/230523-CTIA-Messaging-Principles-and-Best-Practices-FINAL.pdf))
- §5.1.1 and §5.1.2.1: the call-to-action, and the **opt-in confirmation message** sent "before any
  additional messaging", should include "(3) how to opt-out" and "(4) a disclosure that the messages
  are recurring and the frequency of the messaging", along with the program name and HELP or
  customer-care contact.
- §5.1.3, Consumer Opt-Out:
  - "Message Senders should ensure that Consumers have the ability to opt-out of receiving Messages
    at any time".
  - Senders should "acknowledge and honor all Consumer opt-out requests by sending one final opt-out
    confirmation message per campaign". "No further messages should be sent following the
    confirmation message."
  - "Message Senders should state in the message how and what words effect an opt-out."
- The text extracted from §5.1.3 has a gap right after that last sentence, about standard STOP
  wording and plain-language requests. The gap did not survive extraction, so its exact wording is
  **unverified**.
- "In the message" in §5.1.3 does not say *which* message. Read with §5.1.2.1, it describes the
  confirmation message. Nothing in the document requires the instruction in every message.
- §4: a one-way alert that the business sends first, carrying information, is **Informational**
  messaging. It needs "express consent", which may be given "over text, on a form, on a website, or
  verbally". Saturday Slate's reminders and Magic Links fit that category.

### Carriers (10DLC and toll-free)

- In practice, carriers impose these rules through vetting at registration time: 10DLC campaign
  review and toll-free verification. Pingram's form fields above mirror what carriers check.
- No carrier rule saying "every message" was found. Whether a carrier code of conduct asks for a
  *periodic* reminder on recurring programs is **unverified**. The T-Mobile Code of Conduct returned
  403, and the CTIA Short Code Monitoring Handbook, which governs short codes and not this account,
  was not fetched.
- For toll-free numbers, STOP is enforced by the carrier network itself. AWS says: "For US toll-free
  numbers, opt-outs are managed at the carrier level. The only supported opt-out keyword for a US
  toll-free number is STOP… A user can resubscribe by sending… UNSTOP or START."
  ([docs.aws.amazon.com: Required opt-out keywords](https://docs.aws.amazon.com/sms-voice/latest/userguide/keywords-required.html))
  That is AWS describing carrier behaviour, and it would apply to a Pingram toll-free sender too
  (**unverified** for Pingram specifically).

### Which sender this account uses

- **Free accounts:** Pingram's SMS overview lists three shared senders, `+16505093677`,
  `+16505301081` and `+16504911034`.
  ([pingram.io/docs/sms/overview](https://www.pingram.io/docs/sms/overview))
- **Paid accounts:** the same page says they get a "Dedicated phone number. By default, from the +1
  (650) area code but can be changed to other area codes, short codes, or toll-free numbers".
  ([pingram.io/docs/sms/overview](https://www.pingram.io/docs/sms/overview))
- **Dedicated numbers are bought, not given.** The numbers page says every account can use a shared
  number. Dedicated numbers are bought with `numbers.orderNumber`. Without a `from`, a send uses
  "Your dedicated number (if you have exactly one)", otherwise "The shared number". A paid account
  "without approved A2P" registration may hold only one US number.
  ([pingram.io/docs/sms/managing-numbers](https://www.pingram.io/docs/sms/managing-numbers))
- **US production needs 10DLC.** "Registration is mandatory to send SMS to US numbers in
  production." Unregistered sending is "low-volume test messages… expect limited throughput and
  higher filtering risk".
  ([pingram.io/docs/sms/sms-senders-and-a2p-10dlc](https://www.pingram.io/docs/sms/sms-senders-and-a2p-10dlc))
- **The two docs pages disagree.** The overview says paid accounts *have* a dedicated number. The
  numbers page says one must be *bought*.
- **What this account uses is unverified.** `sender.ts` never passes `from`. So on the $20 plan, the
  account is either sending from a dedicated 650 long code, if one was bought, or from the shared
  number. A 10DLC campaign has only been registered if someone filled in Coverage & compliance in the
  dashboard. No sign of one in this repo.
- **How to settle it.** In the Pingram dashboard, check SMS → Numbers, and Coverage & compliance for
  the United States. This also settles the question left open in the 2026-10-16 update of
  [sms-provider-and-reminders.md](sms-provider-and-reminders.md): whether dropping back to the free
  tier would lose a registered number.

## (2) Does Pingram add the wording or handle the keywords?

- **STOP and START: handled by Pingram.** See the quote under (1). The Inbound Messages page adds
  that STOP and START "are not included" in `SMS_INBOUND`: "they arrive as `SMS_UNSUBSCRIBE` and
  `SMS_SUBSCRIBE`".
  ([pingram.io/docs/features/inbound](https://www.pingram.io/docs/features/inbound))
- **HELP: not handled.** "HELP is not answered automatically. When it arrives as `SMS_INBOUND`, send
  a short reply such as: 'Acme: For help, visit acme.com. Reply STOP to opt out.'"
  ([pingram.io/docs/sms/sms-senders-and-a2p-10dlc](https://www.pingram.io/docs/sms/sms-senders-and-a2p-10dlc))
  The SDK also has a per-sender `autoReply` message ("Auto-reply message to send when user texts
  in", `SenderPostBodySmsAutoReply.d.ts`), and inbound results can be `skipped_opt_out`
  (`InboundResponseBodyResultsInner.d.ts`).
- **Opt-out wording appended to outgoing texts: no evidence it happens.** No Pingram page or SDK type
  mentions appending opt-out text to outgoing SMS. The only "Reply STOP" in Pingram's docs is the
  sample HELP reply above, which the customer writes. A text without the line would therefore most
  likely arrive without it (**unverified**). Check by sending one test text without the line, from
  the console's Magic Link or the dashboard.
- **The opt-out confirmation text: unverified.** CTIA §5.1.3 expects "one final opt-out confirmation
  message". On a 10DLC campaign that is the `campaignOptoutMessage` the account registers.
  Unregistered, shared-number sends have no stated equivalent.
- **Inbound replies need a dedicated number.** "Dedicated numbers can receive inbound SMS messages",
  and "Dedicated numbers are exclusively yours — you control the sender ID and can receive replies"
  ([pingram.io/docs/sms/managing-numbers](https://www.pingram.io/docs/sms/managing-numbers)). The
  docs do not say whether STOP sent to a *shared* number is still enforced for this account, or what
  its scope is: this account only, or every Pingram customer on that number. **Unverified.**

## (3) Can the app learn of opt-outs automatically?

- **Yes, by webhook.** The Events Webhook lists:
  - `SMS_UNSUBSCRIBE`: "Triggered when a recipient opts out of SMS (e.g., replies STOP) or via the
    unsubscribe page". Payload `{ eventType, notificationId, channel: "SMS", userId }`.
  - `SMS_SUBSCRIBE`: "Triggered when a recipient opts back into SMS by replying START to your sending
    number". Payload `{ eventType, trackingId, notificationId, channel: "SMS", userId }`.

  ([pingram.io/docs/features/events-webhook](https://www.pingram.io/docs/features/events-webhook))
  Both event types appear in the SDK's `WebhookEventEventTypeEnum`.
- **Verifying a delivery.** The SDK ships `verify()` in `pingram/webhooks`. It checks the
  `X-Pingram-Id`, `X-Pingram-Signature` and `X-Pingram-Timestamp` headers against
  `PINGRAM_WEBHOOK_SECRET`, with a default tolerance of 300 s (`dist/src/webhooks.d.ts`).
- **Retries.** "Each delivery is attempted up to 3 times… The payload and trackingId stay the same
  on every attempt." A handler therefore has to be idempotent, which setting a boolean already is.
  ([events-webhook](https://www.pingram.io/docs/features/events-webhook))
- **Webhooks are managed by API too.** `webhooks.listWebhooks` and `webhooks.createWebhook` exist
  (`WebhooksApi.d.ts`), as well as the dashboard.
- **The catch is the key.** The payloads carry `userId`, never the phone number. Today
  `pingramSender` calls `client.sms.send({ type, to, message })`, whose `to` is only "The phone
  number of the recipient" (`SendSmsRequest.d.ts`). What `userId` Pingram records for such a send,
  perhaps the number itself, is **not documented**. Two ways to close it:
  - Switch the sender to the general `pingram.send({ type, to: { id: memberId, number }, sms: {
    message } })`. `SenderPostBodyTo.id` is the "Unique user identifier", so the member id becomes
    the `userId` events carry.
  - Or send one test STOP on the current setup and read what `userId` arrives.
- **No polling API was found.** `users.listUsers` returns user records with `emailSuppressionStatus`
  only, with no SMS field (`GetUsersResponseUsersInner.d.ts`). The suppression docs and the
  dashboard's "Show Only Suppressed Users" filter describe email only
  ([pingram.io/docs/features/managing-users](https://www.pingram.io/docs/features/managing-users)).
  `users.removeUserFromSuppression(userId, channel)` exists, but nothing says it reverses an SMS
  STOP. The webhook is the only documented way to learn of a STOP.

## What this means for the Notifications build

- **Drop the line, keep the first text.** Drop `OPT_OUT_LINE` from the Friday reminder. Keep it, or
  a fuller "Saturday Slate pick reminders, about 1 a week. Reply STOP to opt out." line, on the first
  text a member gets. That covers CTIA §5.1.2.1's confirmation content and Pingram's sample-message
  guidance.
- **The STOP reply wins.** Pingram enforces STOP however the app's setting is set, so the app should
  treat a STOP as the member's choice. Set `smsOptedOut` from `SMS_UNSUBSCRIBE`, clear it on
  `SMS_SUBSCRIBE`, and show Text as unavailable while it is set, with "Text START to … to turn texts
  back on". Turning Text back on in the app cannot undo a STOP.
- **Before building, settle three things in the dashboard or with a test send:**
  - Whether the account has a dedicated number and a 10DLC campaign.
  - What `userId` a STOP event carries for an `sms.send` recipient.
  - Whether a text sent without the line arrives as written.
