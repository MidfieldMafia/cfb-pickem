# 1. SMS opt-out is a flag the commissioner sets by hand

Status: accepted (2026-09-20). Ticket: #19.

## Context

Every text ends with "Reply STOP to opt out." The provider (Pingram, on shared
sender numbers) honors a STOP reply itself and stops delivering to that number.
The app is not told: a reply goes to the provider, and nothing calls us back.

Left alone, the app would keep planning texts for someone who has opted out. The
provider would drop them, but each still spends a slot in the month's budget
(the free tier is 100 texts, and the app stops at 95), takes a place in the
send log as a "sent" text that never arrived, and leaves the commissioner
believing the person was reminded.

The ticket says opted-out members are flagged and skipped. It does not say how
the app finds out.

## Decision

`members.sms_opted_out` is set by a commissioner in the console, when a member
tells them they replied STOP or asks to be texted again. The reminder plan, the
Magic Link text, and "text me my link" all skip a flagged member, and the
console names them under "Not reachable by text" with a copyable reminder to
send by hand.

The app does not listen for STOP replies.

## Why not an inbound webhook

- It needs Pingram to deliver inbound messages to us on the free tier, which
  was not confirmed. Building against an unverified feature risks a dead
  endpoint that looks like it works.
- It adds a public, signature-verified endpoint and a second thing to keep in
  step with the provider. The group is 10 to 25 people who know the
  commissioners, so a member who opts out will usually say so.
- The flag is one column. If a webhook is added later it sets the same column,
  and nothing that reads the flag changes.

## Consequences

- A member who replies STOP and tells nobody keeps being planned for until the
  commissioner hears of it. Their texts are dropped by the provider, but they
  still count against the budget in our log, so the budget can read higher than
  the provider's own count. The 5-text reserve below Pingram's cap absorbs
  small drift.
- Opting back in has the same two steps in reverse: the member replies START to
  the provider, and a commissioner clears the flag. Clearing the flag alone
  does not restore delivery.
- The flag stops texts only. A commissioner can still copy the member's Magic
  Link and reminder text and send them by hand.
- Swapping the provider (a Twilio implementation of the same sender interface,
  per the SMS research addendum) does not change this. Twilio also handles STOP
  itself, and the flag is still ours to set.

## Revisit when

Delivery failures or budget drift from unreported opt-outs become noticeable,
or when the provider is confirmed to post inbound replies on our plan. The
webhook then sets `sms_opted_out` and this decision is superseded.
