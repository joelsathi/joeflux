---
title: Terminal walkthroughs
description: Typed command and output scenes for developer explainers.
---

# Terminal walkthroughs

Choose **Add a shot → Browse templates → Explainers → Terminal · Dark** or **Terminal · Light**. Both use the editable `harness/terminal` component.

<div className="row">
  <div className="col col--6">

![Dark terminal walkthrough](/img/media/terminal-dark.gif)

  </div>
  <div className="col col--6">

![Light terminal walkthrough](/img/media/terminal-light.gif)

  </div>
</div>

## Transcript format

```text
$ toolkit start
Ready on localhost:3000

$ toolkit status
{"status":"ready"}
```

Lines that start with `$ ` are typed as commands; other lines stream as output. Spaces, blank lines and Unicode are preserved, long lines wrap and long transcripts scroll. Nothing is executed.

## Editable fields

Heading, eyebrow, window titles, two step labels, completion status and both transcripts. Clear the second transcript for a single window. Choose the palette, accent and typing speed. Durations are 8, 12 or 16 seconds; the timing guard protects typing, output, two-second settled holds and the pane handoff.

The sample project is `projects/terminal-templates`. Render all formats with `node scripts/render-terminal-specimens.mjs`.
