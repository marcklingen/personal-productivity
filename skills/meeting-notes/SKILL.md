---
name: meeting-notes
description: >
  Extract meeting notes, AI summaries, transcripts, and tasks/action items from Google Calendar
  events AND Notion AI meeting notes. Trigger for: meeting notes or summaries, what was discussed
  in a meeting, transcripts, action items, tasks from a meeting, what the user committed to
  (e.g. "what did I commit to yesterday?", "my tasks from this week", "show me tasks from today").
  Also trigger when the user names a specific meeting (e.g. "weekly kickoff", "founder sync",
  "daily standup"). Handles the full pipeline: finding calendar events, fetching attached Google
  Docs (manual notes, Gemini AI notes), searching Notion meeting notes database, and presenting
  notes or extracting tasks filtered to the current user by default. Use this skill even when the
  user just mentions meeting notes, tasks from a date, or a meeting name without explicitly asking
  for notes.
---

# Meeting Notes Extraction

## Overview

This skill has two modes:

1. **Notes mode** — fetch and present meeting notes/summaries/transcripts for a specific meeting
2. **Tasks mode** — extract action items across one meeting, a full day, or a full week, using parallel subagents for speed

Detect the mode from the user's request:

- "what did we discuss", "summarize", "transcript", "notes from" → **Notes mode**
- "tasks", "action items", "what did I commit to", "what do I need to do" → **Tasks mode**

---

## Data Sources

This skill searches **two sources** for meeting notes and merges results:

1. **Google Calendar + Google Docs** — Calendar events with attached "Notes by Gemini" and manual collaborative notes (Google Docs)
2. **Notion AI Meeting Notes** — A Notion database containing AI-generated meeting summaries, structured notes, action items, and transcripts

Always search **both sources in parallel** when looking for meeting notes. Some meetings may only exist in one source. When both sources have notes for the same meeting (match by date/time and title similarity), synthesize them — they often complement each other.

### Source 1: Google Calendar + Google Docs

Calendar events have Google Docs attached — either "Notes by Gemini" (AI-generated summary + transcript) or "Notes - <Meeting Name>" (manual collaborative notes). See the "Google Calendar Details" section below for how to query and fetch these.

### Source 2: Notion AI Meeting Notes

- **Data source URL**: `collection://<datasource_id>`
- **Database URL**: `https://www.notion.so/<database_url>`
- **Schema**: Meeting name (title), Date (datetime), Category (multi-select: Planning, Standup, Presentation, Retro, Customer call), Attendees (person), Summary (text)
- **Page content**: Each page contains a `<meeting-notes>` block with:
  - `<summary>` — Structured bullet points organized by topic, with `- [ ]` checkboxes for action items in an "Action Items" section
  - `<notes>` — Manual/collaborative notes (may be empty)
  - `<transcript>` — Full transcript (use `notion-fetch` on the meeting note URL to access)

**How to query Notion meeting notes:**

- **By title/name** — Use `notion-query-data-sources` with SQL:

  ```
  SELECT * FROM "collection://<datasource_id>"
  WHERE "Meeting name" LIKE '%search term%'
  ORDER BY "date:Date:start" DESC LIMIT 10
  ```

  Note: Many Notion meeting notes have no explicit "Meeting name" set — the title is often just the date/time. So title search may miss entries. Always combine with date-based queries.

- **By date range** — Filter on `"date:Date:start"`:

  ```
  SELECT * FROM "collection://<datasource_id>"
  WHERE "date:Date:start" >= '2026-01-20T00:00:00Z' AND "date:Date:start" < '2026-01-21T00:00:00Z'
  ORDER BY "date:Date:start" DESC
  ```

- **By Notion's built-in meeting notes query** — Use `notion-query-meeting-notes` with filters on `title`, `created_time`, or `notion://meeting_notes/attendees`. This is especially useful for broader date ranges and leveraging Notion's semantic matching.

- **Fetching full content** — Use `notion-fetch` with the page ID (from the `url` field in query results, e.g. `2ee2bd19-f290-80e5-8e75-d5a85c0fb664`) to get the full summary with action items and the transcript.

---

## Notes Mode

### Step 1: Search Both Sources in Parallel

Launch both searches simultaneously:

**Google Calendar search:**
Use `gcal_list_events` to find events matching the user's query:

- `timeMin` / `timeMax`: Set the date range (use RFC3339 format without timezone, e.g., `2026-02-23T00:00:00`)
- `timeZone`: Use the user's timezone from the current context or settings
- `q`: Optional text search to filter by event name
- `condenseEventDetails: false` to get the full `attachments` array directly

**Notion search:**
Query the Notion meeting notes database by date range (and optionally title) using `notion-query-data-sources` or `notion-query-meeting-notes`.

Run both queries in the **same turn** so they execute in parallel.

**Important for Google Calendar**: The list response includes `hasAttachments: true/false` but does NOT include the actual attachment URLs or file IDs unless you set `condenseEventDetails: false`.

**If a specific `q` search returns no results, broaden it** — e.g., "langfuse LT" → "langfuse", "weekly product sync" → "product sync". Try at most one retry with a broader term before giving up.

**Never use `google_drive_search`** to locate meeting notes. Document file IDs come from two places on the calendar event — the `attachments` array and Google Docs links embedded in the event `description`. Check both before concluding there are no notes.

### Step 2: Fetch Detailed Content

**From Google Calendar:**
Use `google_drive_fetch` with the `fileId`(s) from the attachments to retrieve the actual document contents.

```
google_drive_fetch(document_ids=["<fileId1>", "<fileId2>"])
```

Always fetch both "Notes by Gemini" and manual notes when both are available — pass all file IDs in a single batched call.

**Note**: `google_drive_fetch` occasionally returns "Content not accessible" on the first attempt. Retry once — it typically succeeds.

**From Notion:**
If Notion query results were found, use `notion-fetch` with the page ID to get the full meeting notes content (summary, action items, transcript). The Summary property on the database row is a condensed version — the page content has the full structured notes.

### Step 3: Synthesize and Present

When both sources have notes for the same meeting:

- The Google Docs "Notes by Gemini" and Notion AI meeting notes often cover the same ground but from slightly different angles. Synthesize rather than duplicate.
- Manual Google Doc notes may contain agenda items and participant-written details not captured by AI.
- Notion notes tend to have well-structured topic-based summaries with clear action items.

Present the notes, summary, and/or transcript as requested.

---

## Tasks Mode

Use this when the user wants to extract action items from one or more meetings.

### Scope detection

| User says                               | Time range   | Strategy                          |
| --------------------------------------- | ------------ | --------------------------------- |
| "tasks from [meeting name]"             | Single event | Direct fetch, no subagents needed |
| "tasks from yesterday / today / [date]" | Full day     | Subagents (one per meeting)       |
| "tasks from this week / last week"      | Mon–Sun      | Subagents (one per meeting)       |
| "what did I commit to [date range]?"    | Custom range | Subagents (one per meeting)       |

### Assignee filtering

- **Resolve the current user first**: infer the user's name and likely aliases from agent settings, profile/context, or the current conversation
- **Default**: show only the current user's tasks, matching likely aliases such as full name, first name, or common shorthand when they are clearly referring to the same person
- **If the user asks to see everyone's tasks**: show all tasks, but visually highlight the current user's with ⭐ when the identity is known
- **If the current user cannot be identified**: ask a short clarification before doing personalized filtering, for example `Which name should I treat as yours in meeting notes?`. Suggest adding their preferred name/aliases to `agent settings (global)` so future meeting-task queries work without clarification

### Single-meeting tasks (no subagents)

1. Search both Google Calendar (`gcal_list_events` with `condenseEventDetails: false`) and Notion (`notion-query-data-sources` by date/title) **in parallel**
2. Fetch content from whichever sources have notes:
   - Google Docs: `google_drive_fetch` for Gemini notes / manual notes
   - Notion: `notion-fetch` for the full page content
3. Parse action items from:
   - Google Docs: "Suggested next steps" section (`- [ ]` checkboxes)
   - Notion: "Action Items" section in the `<summary>` block (`- [ ]` checkboxes)
4. Deduplicate tasks that appear in both sources (same assignee + similar description)
5. Filter/present per assignee rules above

### Multi-meeting tasks (parallel subagents)

When the query spans a day or week, use subagents for maximum speed.

**Step 1: List all meetings from both sources**

Run both queries in the **same turn**:

Google Calendar:

```
gcal_list_events(
  timeMin="<date>T00:00:00",
  timeMax="<date>T23:59:59",   # or end of week
  timeZone="<user timezone>",
  condenseEventDetails=false
)
```

Notion:

```
notion-query-data-sources with SQL:
SELECT * FROM "collection://2ef2bd19-f290-8026-b9b5-000bcb1b0c8e"
WHERE "date:Date:start" >= '<date>T00:00:00Z' AND "date:Date:start" < '<end_date>T00:00:00Z'
ORDER BY "date:Date:start" ASC
```

Include **all meetings** regardless of the current user's RSVP status (accepted, declined, tentative). Skip non-meeting events: `Sleep`, `Block`, `Office`, focus time blocks, working location events, and any event with no notes in either source.

**Step 2: Match and merge meeting lists**

Before spawning subagents, match meetings across sources by overlapping time and similar titles. Create a unified meeting list where each entry knows:

- Whether it has Google Doc attachments (and which file IDs)
- Whether it has a Notion page (and which page ID)
- Or both

This avoids spawning duplicate subagents for the same meeting.

**Step 3: Spawn one subagent per meeting**

For each meeting in the unified list, spawn a `general-purpose` Task subagent. Adapt the prompt based on which sources are available:

```
Extract action items from this meeting's notes.

Meeting: <event summary>
Date/time: <start dateTime in the user's timezone>

Sources to check:
- Gemini notes doc ID: <fileId or "none">
- Manual notes doc ID: <fileId or "none">
- Notion page ID: <page ID or "none">

Steps:
1. Fetch all available sources:
   - If Google Doc IDs are available: use google_drive_fetch with both IDs in a single call.
     If content is not accessible on the first try, retry once.
   - If Notion page ID is available: use notion-fetch with the page ID to get the full
     meeting notes content.
2. Find action items in:
   - Google Docs: "Suggested next steps" section (look for "- [ ]" checkboxes)
   - Notion: "Action Items" section in the summary (look for "- [ ]" checkboxes)
3. For each task, identify the assignee (look for "[Name] will..." patterns, or bold names
   before the task) and the task text.
4. Deduplicate tasks that appear in both sources.
5. Return results in exactly this markdown format:

## <Meeting Name> (<date>, <time> <timezone>)
- **[Assignee Name]** Task description
- **[Assignee Name]** Task description

If no tasks are found, return:
## <Meeting Name> — no tasks found
```

Spawn all subagents in the **same turn** so they run in parallel.

**Step 4: Wait for all subagents, then merge**

Collect results from all subagents. Combine into a single list ordered chronologically by meeting time. Group by day with a `### <Weekday, Date>` header if the query spans multiple days.

Apply filtering:

- Default: keep only tasks where the assignee matches the current user's known name/aliases
- Show-all mode: include all tasks, prefix the current user's tasks with ⭐ when the identity is known
- If the current user's identity is still unknown and the request depends on personalized filtering, ask a short clarification and suggest adding that name to `agent settings (global)` for future runs

**Step 5: Present**

Show the final task list with meeting headers. Close with a brief count: e.g., "Found 6 tasks for you across 4 meetings." Indicate which source(s) the notes came from if relevant.

---

## Google Calendar Details

### Attachment Types Reference

#### 1. Manual/Collaborative Notes

- **Title pattern**: `"Notes - <Meeting Name>"`
- **Content**: Hand-written bullet points, agendas, participant updates

#### 2. AI-Generated Notes (Gemini)

- **Title pattern**: `"Notes by Gemini"`
- **Content**: Two sections:
  - **📝 Notes**: Structured summary, detailed bullet points, and **Suggested next steps** (action items as `- [ ]` checkboxes)
  - **📖 Transcript**: Full verbatim transcript with timestamps and speaker attribution

#### 3. Other Attachments (skip for task extraction)

- **Recordings**: MP4 video files
- **Chat logs**: Plain text `.txt` files

---

## Notion Meeting Notes Details

### Page Content Structure

Each Notion meeting note page contains a `<meeting-notes>` block with three sections:

1. **`<summary>`** — The main content. Organized into topic-based headers (e.g., "### Evaluation System Architecture") with bullet points and source references (`[^url]`). Ends with an "### Action Items" section containing `- [ ]` checkboxes with assignee names.

2. **`<notes>`** — Manual/collaborative notes added by participants. May be empty (`<empty-block/>`).

3. **`<transcript>`** — Full meeting transcript. Initially shown as "Transcript omitted" in the fetch response — access the full transcript by fetching the specific meeting note URL shown in the `readOnlyViewMeetingNoteUrl` attribute.

### Properties Quick Reference

| Property     | Type         | Notes                                                      |
| ------------ | ------------ | ---------------------------------------------------------- |
| Meeting name | title        | Often auto-set to date/time, not always descriptive        |
| Date         | datetime     | When the meeting occurred                                  |
| Category     | multi-select | Planning, Standup, Presentation, Retro, Customer call      |
| Attendees    | person       | Notion users who attended                                  |
| Summary      | text         | AI-generated condensed summary (shorter than page content) |

---

## Tips

- **Always search both sources** — Some meetings only have notes in Google Docs, others only in Notion, many in both. Running both queries in parallel takes the same time as one.
- **Finding the right event in Google Calendar**: Use `q` parameter to search by name, or `timeMin`/`timeMax` for date-based queries. If a narrow `q` search returns nothing, retry with a shorter/broader term — never fall back to `google_drive_search`.
- **Finding doc file IDs**: Check both the `attachments` array and any Google Docs links in the event `description`. Some recurring meetings embed the shared notes doc in the description rather than attaching it.
- **Notion title matching**: Many Notion meeting notes have titles that are just timestamps (e.g., "@January 20, 2026 6:09 PM"), not descriptive meeting names. Always include a date-range query alongside any title search.
- **Recurring meetings**: Each Google Calendar occurrence has a different `eventId`. Fetch the right date's instance.
- **Batch fetching (Notes mode)**: `google_drive_fetch` accepts multiple IDs in one call — useful when fetching Gemini + manual notes for a single event.
- **Transcript extraction**: Gemini transcripts are in Google Docs `📖 Transcript` section. Notion transcripts require fetching the meeting note URL from the `readOnlyViewMeetingNoteUrl` attribute.
- **Action items location**: Gemini notes have "Suggested next steps" with `- [ ]` checkboxes. Notion notes have "Action Items" with the same pattern. Manual notes may have inline task lists.
- **Retry on failure**: If `google_drive_fetch` returns empty/inaccessible content, retry once. `notion-fetch` is generally reliable on first try.
- **Deduplication**: When the same meeting has notes in both sources, action items may overlap. Deduplicate by matching assignee + task description similarity.
- **Meetings without notes**: Some meetings have no notes in either source. Note them briefly ("no notes available") and move on.
