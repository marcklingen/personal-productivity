---
name: meeting-followup
description: Retrieve a reliable transcript for a specified or current meeting, then carry out the user's explicit follow-up request without assuming a default output. Use for post-meeting emails, recaps, decisions, action-item extraction, internal updates, research, or other follow-up work that must be grounded in Circleback, Gong, Google Meet/Gemini, or a Notion meeting-notes database.
---

# Meeting Follow-up

Ground every follow-up in a full transcript. Do not assume what the follow-up should be; perform only the outcome requested in the invocation.

## Resolve the meeting

1. Record the invocation time and the user's timezone.
2. If the user identifies a meeting, search Google Calendar in a bounded date window and match title, time, and attendees. Read the full event before retrieving a transcript.
3. If no meeting is identified, select the non-all-day calendar event whose start and end contain the invocation time. Prefer an event attended by the user with other attendees or a conferencing link. Exclude focus time, holds, travel, meals, and declined events unless explicitly requested.
4. If no event clearly contains the invocation time, ask the user which meeting they mean instead of guessing.
5. Retain the canonical event title, event ID, start and end, attendees, conferencing platform/link, description, and attachments. Use these fields to disambiguate transcript candidates.

## Retrieve the transcript

Set the availability deadline to 30 minutes after the calendar event ends. Try immediately, checking the following sources in order. Stop at the first usable full transcript.

### 1. Circleback

- Search captured meetings using a short distinctive title phrase and a narrow date range around the event.
- Match candidates against the calendar time and attendees, not title alone.
- Read the matching meeting, recover its meeting ID, and request the full transcript.
- If meeting search fails, search Circleback calendar events only when useful for recovering capture status or an associated meeting ID.

### 2. Gong

- Prefer a purpose-built Gong connector when available. Search by title, date, and participants, then fetch the full transcript.
- If no connector exists, use a signed-in browser session to find the meeting and extract its transcript.
- If authentication is unavailable or the transcript cannot be accessed, continue to Google Meet without blocking the workflow.

### 3. Google Meet / Gemini through Calendar and Drive

- Inspect the full Calendar event for a Google Doc attachment named like `Notes by Gemini` or `Transcript`.
- Fetch the attached Doc through Google Drive. Treat it as usable only when it contains an explicit transcript section with substantive dialogue; a summary alone is not a transcript.
- If the attachment is missing, search Drive using a few distinctive title tokens. Drive keyword search uses AND semantics, so keep the query short.
- Bound Drive results to Google Docs created between the meeting start and the availability deadline. Match title and creation time before fetching the file.
- A video recording without transcript text is not a usable transcript. Do not substitute Gemini's summary for the transcript unless the user explicitly allows it.

### 4. Notion

- Use the user's configured Notion meeting-notes database. If no database is configured or linked in the current context, ask the user for its URL instead of guessing.
- Fetch the database to recover its current data-source URL and schema.
- Query by meeting date and distinctive title terms. Use attendees or creator metadata when available to disambiguate; ignore blank placeholder rows.
- Fetch the matching page with transcript inclusion enabled. Accept the result only when it contains a non-empty `<transcript>` section.

## Retry unavailable transcripts

- If no source has a usable transcript and the deadline has not passed, wait until the earlier of five minutes from now or the deadline, then retry every source in the same priority order.
- Use the environment's native pause, continuation, monitoring, or automation mechanism. Do not busy-loop or run a blocking terminal sleep longer than 60 seconds.
- A transcript that appears during a retry takes precedence over summaries found earlier.
- At or after the deadline, make one final pass. If no transcript is available, report which sources were checked and stop without performing the requested follow-up.

## Perform the requested follow-up

After obtaining the transcript:

1. Apply the user's requested format, audience, tone, destination, and level of detail. There is no default deliverable.
2. Ground decisions, owners, commitments, deadlines, and quotations in the transcript. Clearly label inferences or recommendations.
3. Use calendar metadata only for meeting identity and participant context; do not treat attendance status as proof that someone spoke.
4. Draft content when the request asks for a draft. Send or publish only when the user explicitly requests that external write.
5. Ask for confirmation before adding, changing, completing, or deleting anything in a personal task list or issue tracker, including Notion tasks and Linear issues.

## Example invocations

- `Use $meeting-followup for my call with Acme today and draft a concise customer email with decisions and next steps.`
- `Use $meeting-followup for the meeting happening now and list only the commitments I made.`
- `Use $meeting-followup for yesterday's partner call and prepare an internal Slack recap.`
